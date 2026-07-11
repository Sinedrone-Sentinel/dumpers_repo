"""Full-screen overlay with per-row scan checkmarks beside HUD lines."""

from __future__ import annotations

import queue
import sys
import threading
import time
import tkinter as tk
from collections.abc import Callable

from PIL import Image, ImageTk

from game_window import GameWindow
from live_scan_types import LiveScanResult
from overlay_frame import OverlayFrame
from panel_crop import PanelFractions
from panel_row_layout import PanelRowLayout
from region_store import fractions_from_pixels, save_region

# HUD row ids ticked in scan order (y positions come from each frozen grab).
HUD_ROW_IDS: tuple[str, ...] = ("ore", "mass", "res", "inst", "comp_scu")

_CHECK_SIZE = 16
_CHECK_FONT = ("Segoe UI", _CHECK_SIZE, "bold")
_PENDING_COLOR = "#3a5a44"
_OK_COLOR = "#3dff6a"
_FAIL_COLOR = "#ff5a5a"
_PENDING = "○"
_OK = "✓"
_FAIL = "✗"
_SCAN_FINISH_DELAY_MS = 2600
_MARK_STAGGER_S = 0.14


class BridgeScanOverlay:
    """Confirm RESULTS box, then keep overlay up while OCR rows complete."""

    def __init__(
        self,
        window: GameWindow,
        snapshot: Image.Image,
        *,
        return_focus_hwnd: int,
        initial_fractions: PanelFractions,
        on_scan: Callable[[PanelFractions, ScanProgressReporter], LiveScanResult],
    ) -> None:
        self.window = window
        self.return_focus_hwnd = return_focus_hwnd
        self.on_scan = on_scan
        frame = OverlayFrame.from_window_snapshot(window, snapshot)
        self.client_w = frame.width
        self.client_h = frame.height
        self.bg_image = snapshot
        self.scan_mode = False
        self.cancelled = False
        self.confirmed_fractions: PanelFractions | None = None
        self.result: LiveScanResult | None = None

        self.start_x = 0
        self.start_y = 0
        self.sel_rect_id: int | None = None
        self.shade_ids: list[int] = []
        self.selection: tuple[int, int, int, int] | None = None
        self._locked_box: tuple[int, int, int, int] | None = None
        self._check_ids: dict[str, int] = {}
        self._row_layout: PanelRowLayout | None = None
        self._ui_ops: queue.Queue[Callable[[], None]] = queue.Queue()

        self.root = tk.Tk()
        self._photo = ImageTk.PhotoImage(snapshot, master=self.root)
        self.root.title("Rock Scan")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.geometry(
            f"{frame.width}x{frame.height}+{frame.left}+{frame.top}"
        )

        self.canvas = tk.Canvas(
            self.root,
            width=frame.width,
            height=frame.height,
            cursor="crosshair",
            highlightthickness=0,
            bg="black",
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self._bg_image_id = self.canvas.create_image(0, 0, image=self._photo, anchor=tk.NW)

        self.hint = tk.Label(
            self.root,
            text=(
                "Frozen HUD snapshot — box the RESULTS panel  |  "
                "Enter = scan this frame  |  Esc = cancel  |  R = reset"
            ),
            fg="#d7ffe0",
            bg="#102018",
            font=("Segoe UI", 10),
        )
        self.hint.place(x=8, y=8)

        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)
        self.root.bind("<Return>", self._on_enter)
        self.root.bind("<Escape>", self._on_cancel)
        self.root.bind("r", self._on_reset)
        self.root.bind("R", self._on_reset)
        self.root.protocol("WM_DELETE_WINDOW", self._on_cancel)

        self._set_selection_from_fractions(initial_fractions)
        self.root.update_idletasks()
        self.root.after(30, self._drain_ui_ops)

    def schedule_ui(self, fn: Callable[[], None]) -> None:
        """Thread-safe: run *fn* on the tk main loop."""
        self._ui_ops.put(fn)

    def _drain_ui_ops(self) -> None:
        while True:
            try:
                fn = self._ui_ops.get_nowait()
            except queue.Empty:
                break
            fn()
            self.root.update()
        self.root.after(30, self._drain_ui_ops)

    def set_header(self, text: str) -> None:
        self.hint.config(text=text)
        self.root.update()

    def _set_header_threadsafe(self, text: str) -> None:
        self.schedule_ui(lambda: self.set_header(text))

    def ensure_row(self, row_id: str, y_frac: float | None = None) -> None:
        """Add or reposition a checkmark at a HUD row band (inside the green box)."""
        if y_frac is None:
            if self._row_layout is not None:
                y_frac = self._row_layout.y_frac(row_id)
            else:
                y_frac = 0.5
        box = self._selection_box()
        if box is None:
            return
        left, top, _right, bottom = box
        height = max(1, bottom - top)
        y = top + int(round(y_frac * height))
        x = left + 8
        if row_id in self._check_ids:
            self.canvas.coords(self._check_ids[row_id], x, y)
            return
        self._check_ids[row_id] = self.canvas.create_text(
            x,
            y,
            text="",
            fill=_PENDING_COLOR,
            font=_CHECK_FONT,
            anchor=tk.W,
        )

    def mark_row(self, row_id: str, *, ok: bool | None = None) -> None:
        item = self._check_ids.get(row_id)
        if item is None:
            return
        if ok is None:
            self.canvas.itemconfig(item, text=_PENDING, fill=_PENDING_COLOR)
        elif ok:
            self.canvas.itemconfig(item, text=_OK, fill=_OK_COLOR)
        else:
            self.canvas.itemconfig(item, text=_FAIL, fill=_FAIL_COLOR)
        self.root.update()

    def _mark_row_threadsafe(self, row_id: str, *, ok: bool | None = None) -> None:
        self.schedule_ui(lambda: self.mark_row(row_id, ok=ok))

    def clear_row(self, row_id: str) -> None:
        item = self._check_ids.get(row_id)
        if item is None:
            return
        self.canvas.itemconfig(item, text="", fill=_PENDING_COLOR)
        self.root.update()

    def _clear_row_threadsafe(self, row_id: str) -> None:
        self.schedule_ui(lambda: self.clear_row(row_id))

    def _set_selection_from_fractions(self, fractions: PanelFractions) -> None:
        left = int(round(fractions.x * self.client_w))
        top = int(round(fractions.y * self.client_h))
        right = left + max(1, int(round(fractions.width * self.client_w)))
        bottom = top + max(1, int(round(fractions.height * self.client_h)))
        self._apply_selection(left, top, right, bottom)

    def _apply_selection(self, x0: int, y0: int, x1: int, y1: int) -> None:
        if self.sel_rect_id is not None:
            self.canvas.delete(self.sel_rect_id)
        self._draw_shades(x0, y0, x1, y1)
        self.sel_rect_id = self.canvas.create_rectangle(
            x0, y0, x1, y1, outline="#5cff7a", width=3
        )
        self.selection = (x0, y0, x1, y1)

    def _clear_shades(self) -> None:
        for item in self.shade_ids:
            self.canvas.delete(item)
        self.shade_ids.clear()

    def _draw_shades(self, x0: int, y0: int, x1: int, y1: int) -> None:
        self._clear_shades()
        left = min(x0, x1)
        right = max(x0, x1)
        top = min(y0, y1)
        bottom = max(y0, y1)
        w, h = self.client_w, self.client_h
        fill, stipple = "#000000", "gray50"
        for rx0, ry0, rx1, ry1 in (
            (0, 0, w, top),
            (0, bottom, w, h),
            (0, top, left, bottom),
            (right, top, w, bottom),
        ):
            if rx1 > rx0 and ry1 > ry0:
                self.shade_ids.append(
                    self.canvas.create_rectangle(
                        rx0, ry0, rx1, ry1, fill=fill, stipple=stipple, outline=""
                    )
                )

    def _on_press(self, event: tk.Event) -> None:
        if self.scan_mode:
            return
        self.start_x = event.x
        self.start_y = event.y
        if self.sel_rect_id is not None:
            self.canvas.delete(self.sel_rect_id)
            self.sel_rect_id = None
        self._clear_shades()

    def _on_drag(self, event: tk.Event) -> None:
        if self.scan_mode:
            return
        if self.sel_rect_id is not None:
            self.canvas.delete(self.sel_rect_id)
        self._draw_shades(self.start_x, self.start_y, event.x, event.y)
        self.sel_rect_id = self.canvas.create_rectangle(
            self.start_x, self.start_y, event.x, event.y, outline="#5cff7a", width=3
        )

    def _on_release(self, event: tk.Event) -> None:
        if self.scan_mode:
            return
        x0, y0 = self.start_x, self.start_y
        x1, y1 = event.x, event.y
        if abs(x1 - x0) < 20 or abs(y1 - y0) < 20:
            self.selection = None
            return
        self.selection = (x0, y0, x1, y1)

    def _on_reset(self, _event: tk.Event | None = None) -> None:
        if self.scan_mode:
            return
        if self.sel_rect_id is not None:
            self.canvas.delete(self.sel_rect_id)
            self.sel_rect_id = None
        self._clear_shades()
        self.selection = None

    def _selection_box(self) -> tuple[int, int, int, int] | None:
        if self.scan_mode and self._locked_box is not None:
            return self._locked_box
        if self.selection is None:
            return None
        x0, y0, x1, y1 = self.selection
        return min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)

    def apply_row_layout(self, layout: PanelRowLayout) -> None:
        """Reposition HUD checkmarks; composition rows are placed when parsed."""
        self._row_layout = layout
        for row_id in HUD_ROW_IDS:
            self.ensure_row(row_id)
        self.root.update()

    def _place_fallback_checkmarks(self) -> None:
        """Show pending markers immediately; real positions arrive from the scan thread."""
        self._row_layout = PanelRowLayout(rows={})
        for row_id in HUD_ROW_IDS:
            self.ensure_row(row_id)

    def _lock_scan_mode(self) -> None:
        self.scan_mode = True
        self.canvas.config(cursor="arrow")
        self.canvas.unbind("<ButtonPress-1>")
        self.canvas.unbind("<B1-Motion>")
        self.canvas.unbind("<ButtonRelease-1>")
        self.root.unbind("r")
        self.root.unbind("R")
        self.root.unbind("<Return>")

    def _refresh_background(self, image: Image.Image) -> None:
        self.bg_image = image
        self._photo = ImageTk.PhotoImage(image, master=self.root)
        self.canvas.itemconfig(self._bg_image_id, image=self._photo)

    def _on_enter(self, _event: tk.Event | None = None) -> None:
        if self.scan_mode:
            return
        if self.selection is None:
            print("Draw a box first (drag around the RESULTS panel).", file=sys.stderr)
            return

        x0, y0, x1, y1 = self.selection
        fractions = fractions_from_pixels(
            x0, y0, x1, y1, self.client_w, self.client_h
        )
        self.confirmed_fractions = fractions
        save_region(
            fractions,
            client_width=self.client_w,
            client_height=self.client_h,
        )

        locked = self._selection_box()
        if locked is None:
            return
        self._locked_box = locked

        self._lock_scan_mode()
        self.set_header("Scanning frozen HUD frame…")
        self._place_fallback_checkmarks()
        for row_id in HUD_ROW_IDS:
            self.mark_row(row_id, ok=None)

        def work() -> None:
            reporter = ScanProgressReporter(self)
            try:
                result = self.on_scan(fractions, reporter)
            except Exception as exc:  # pragma: no cover
                result = LiveScanResult(ok=False, error=f"Rock scan failed: {exc}")
            self.schedule_ui(lambda: self._apply_scan_result(result))

        threading.Thread(target=work, name="rock-scan-ocr", daemon=True).start()

    def _apply_scan_result(self, result: LiveScanResult) -> None:
        self.result = result
        if result.ok:
            self.set_header("Scan complete — returning to Rock Calculator…")
        else:
            self.set_header((result.error or "Scan failed")[:80])
        self.root.update()
        self.root.after(_SCAN_FINISH_DELAY_MS, self._finish)

    def _on_cancel(self, _event: tk.Event | None = None) -> None:
        if self.scan_mode:
            return
        self.cancelled = True
        self._finish()

    def _finish(self) -> None:
        from focus_helper import restore_focus  # noqa: PLC0415

        self.root.destroy()
        restore_focus(self.return_focus_hwnd)

    def run(self) -> LiveScanResult | None:
        self.root.focus_force()
        self.root.mainloop()
        if self.cancelled:
            return LiveScanResult(ok=False, error="Scan cancelled.")
        return self.result


class ScanProgressReporter:
    """Thread-safe overlay updates while OCR runs off the UI thread."""

    def __init__(self, overlay: BridgeScanOverlay) -> None:
        self._overlay = overlay

    def set_header(self, text: str) -> None:
        self._overlay._set_header_threadsafe(text)

    def ensure_row(self, row_id: str, y_frac: float | None = None) -> None:
        self._overlay.schedule_ui(
            lambda: self._overlay.ensure_row(row_id, y_frac)
        )

    def apply_row_layout(self, layout: PanelRowLayout) -> None:
        self._overlay.schedule_ui(lambda: self._overlay.apply_row_layout(layout))

    def mark_row(self, row_id: str, *, ok: bool | None = None) -> None:
        self._overlay._mark_row_threadsafe(row_id, ok=ok)
        time.sleep(_MARK_STAGGER_S)

    def clear_row(self, row_id: str) -> None:
        self._overlay._clear_row_threadsafe(row_id)

    def _composition_row_y_frac(self, index: int, line_count: int) -> float:
        """Even bands between COMP header and INERT when line OCR missed a row."""
        layout = self._overlay._row_layout
        if layout is not None and f"comp_{index}" in layout.rows:
            return layout.y_frac(f"comp_{index}")
        top = layout.y_frac("comp_scu") if layout else 0.42
        bottom = layout.y_frac("inert") if layout else 0.82
        if line_count <= 0:
            return top
        slot = index + 1
        return top + (bottom - top) * slot / (line_count + 1)

    def mark_composition_result(self, composition: dict) -> None:
        """Tick each composition % line and the INERT anchor — only rows that exist."""
        lines = composition.get("lines") or []

        if not composition.get("ok") or not lines:
            self.ensure_row("comp_0")
            self.mark_row("comp_0", ok=False)
            return

        for index in range(len(lines)):
            row_id = f"comp_{index}"
            y_frac = self._composition_row_y_frac(index, len(lines))
            self.ensure_row(row_id, y_frac)
            time.sleep(0.05)
            self.mark_row(row_id, ok=True)

        inert_ok = composition.get("inert_anchor_line") is not None
        self.ensure_row("inert")
        time.sleep(0.05)
        self.mark_row("inert", ok=inert_ok)

        # Hide extra composition slots detected on the grab but not parsed.
        for row_id, _item in list(self._overlay._check_ids.items()):
            if not row_id.startswith("comp_") or row_id == "comp_scu":
                continue
            try:
                index = int(row_id.split("_", 1)[1])
            except ValueError:
                continue
            if index >= len(lines):
                self.clear_row(row_id)
