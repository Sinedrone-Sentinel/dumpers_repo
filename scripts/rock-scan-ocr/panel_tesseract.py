"""Tesseract OCR for the calibrated RESULTS panel crop."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

try:
    import pytesseract
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "pytesseract is required for composition OCR. Run: pip install pytesseract"
    ) from exc


def _configure_tesseract() -> None:
    if shutil.which("tesseract"):
        return
    candidates = [
        Path(__file__).resolve().parent / "vendor" / "tesseract" / "tesseract.exe",
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
    ]
    for path in candidates:
        if path.is_file():
            pytesseract.pytesseract.tesseract_cmd = str(path)
            return


def _upscale(img: Image.Image, target_height: int = 2000) -> Image.Image:
    if img.height >= target_height:
        return img
    scale = target_height / img.height
    return img.resize(
        (int(img.width * scale), int(img.height * scale)),
        Image.LANCZOS,
    )


_FAST_LAYOUT_TARGET_HEIGHT = 1000


def _preprocess_warm_channel(img: Image.Image) -> Image.Image:
    """Warm-channel isolate (SC Toolbox label_captures pattern)."""
    arr = np.array(img.convert("RGB"))
    red = arr[..., 0]
    green = arr[..., 1]
    blue = arr[..., 2]
    warm = np.clip(red.astype(np.int32) - blue.astype(np.int32), 0, 255).astype(np.uint8)
    warm2 = np.clip(red.astype(np.int32) - green.astype(np.int32), 0, 255).astype(np.uint8)
    warm = np.maximum(warm, (warm2 * 2).astype(np.uint8))
    lo = int(np.percentile(warm, 50))
    hi = int(np.percentile(warm, 99))
    if hi > lo:
        warm = np.clip((warm.astype(np.int32) - lo) * 255 // max(1, hi - lo), 0, 255).astype(
            np.uint8
        )
    binary = np.where(warm > 60, 0, 255).astype(np.uint8)
    return Image.fromarray(binary, mode="L")


def _preprocess_bright_mask(img: Image.Image) -> Image.Image:
    """Brightness mask — color-agnostic HUD text (split_panels pattern)."""
    rgb = np.array(img.convert("RGB"), dtype=np.int16)
    mask = rgb.max(axis=2) >= 160
    binary = np.where(mask, 0, 255).astype(np.uint8)
    return Image.fromarray(binary, mode="L")


def _preprocess_grayscale(img: Image.Image, scale: int = 2) -> Image.Image:
    gray = ImageOps.grayscale(img)
    if scale > 1:
        gray = gray.resize((gray.width * scale, gray.height * scale), Image.LANCZOS)
    return ImageOps.autocontrast(gray)


def _run_tesseract(img: Image.Image, psm: int = 6) -> str:
    return pytesseract.image_to_string(
        img,
        config=f"--oem 1 --psm {psm} -l eng",
    )


def _normalize_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if line:
            lines.append(line)
    return lines


def ocr_panel_line_candidates(img: Image.Image) -> list[tuple[str, list[str]]]:
    """Return separate OCR line lists per preprocessing pass (thorough — offline/debug)."""
    _configure_tesseract()
    base = _upscale(img)
    passes: list[tuple[str, Image.Image]] = [
        ("grayscale", _preprocess_grayscale(base, scale=1)),
        ("warm-channel", _preprocess_warm_channel(base)),
        ("bright-mask", _preprocess_bright_mask(base)),
    ]
    candidates: list[tuple[str, list[str]]] = []
    for label, processed in passes:
        for psm in (6, 4):
            text = _run_tesseract(processed, psm=psm)
            lines = _normalize_lines(text)
            if lines:
                candidates.append((f"{label}-psm{psm}", lines))
    return candidates


def ocr_panel_line_candidates_fast(img: Image.Image) -> list[tuple[str, list[str]]]:
    """Two-pass OCR for live bridge scans (warm + bright, psm 6 only)."""
    _configure_tesseract()
    base = _upscale(img, target_height=_FAST_LAYOUT_TARGET_HEIGHT)
    candidates: list[tuple[str, list[str]]] = []
    for label, processed in (
        ("warm-channel", _preprocess_warm_channel(base)),
        ("bright-mask", _preprocess_bright_mask(base)),
        ("grayscale", _preprocess_grayscale(base, scale=1)),
    ):
        text = _run_tesseract(processed, psm=6)
        lines = _normalize_lines(text)
        if lines:
            candidates.append((f"{label}-psm6", lines))
    return candidates


def merge_line_candidates(candidates: list[tuple[str, list[str]]]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for _label, lines in candidates:
        for line in lines:
            key = line.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(key)
    return merged


def ocr_panel_lines(img: Image.Image) -> list[str]:
    """Return lines from the first OCR candidate pass (debug/export helper)."""
    candidates = ocr_panel_line_candidates(img)
    if not candidates:
        return []
    return candidates[0][1]


def ocr_panel_words(img: Image.Image) -> list[dict[str, int | str]]:
    """Word boxes from the warm-channel pass (for spatial composition parsing)."""
    _configure_tesseract()
    processed = _preprocess_warm_channel(_upscale(img))
    data = pytesseract.image_to_data(
        processed,
        output_type=pytesseract.Output.DICT,
        config="--oem 1 --psm 6 -l eng",
    )
    words: list[dict[str, int | str]] = []
    for index, text in enumerate(data["text"]):
        token = text.strip()
        if not token:
            continue
        try:
            conf = int(data["conf"][index])
        except (TypeError, ValueError):
            continue
        if conf < 35:
            continue
        words.append(
            {
                "text": token,
                "x0": int(data["left"][index]),
                "y0": int(data["top"][index]),
                "x1": int(data["left"][index]) + int(data["width"][index]),
                "y1": int(data["top"][index]) + int(data["height"][index]),
            }
        )
    return words


def ocr_panel_lines_fast(img: Image.Image) -> list[str]:
    """Single-pass line OCR for overlay row-marker alignment (keeps UI responsive)."""
    _configure_tesseract()
    processed = _preprocess_bright_mask(_upscale(img, target_height=_FAST_LAYOUT_TARGET_HEIGHT))
    text = _run_tesseract(processed, psm=6)
    return _normalize_lines(text)
