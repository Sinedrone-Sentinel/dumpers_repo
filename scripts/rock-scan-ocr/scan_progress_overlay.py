"""Full-screen overlay with per-row scan checkmarks beside HUD lines."""

from __future__ import annotations

import sys
import tkinter as tk
from collections.abc import Callable
from dataclasses import dataclass

from PIL import Image, ImageTk

from game_window import GameWindow
from live_scan_types import LiveScanResult
from panel_crop import PanelFractions
from region_store import fractions_from_pixels, save_region


@dataclass(frozen=True)
class HudCheckRow:
    id: str
    y_frac: float


# Vertical bands aligned to the Mole pilot RESULTS panel (see member mockup).
HUD_CHECK_ROWS: tuple[HudCheckRow, ...] = (
    HudCheckRow("ore", 0.11),
    HudCheckRow("mass", 0.20),
    HudCheckRow("res", 0.27),
    HudCheckRow("inst", 0.34),
    HudCheckRow("comp_scu", 0.43),
)

# Composition list below the SCU bar — up to 3 valuable lines + INERT anchor.
COMPOSITION_CHECK_ROWS: tuple[HudCheckRow, ...] = (
    HudCheckRow("comp_0", 0.58),
    HudCheckRow("comp_1", 0.67),
    HudCheckRow("comp_2", 0.76),
    HudCheckRow("inert", 0.85),
)

_CHECK_SIZE = 16
_CHECK_FONT = ("Segoe UI", _CHECK_SIZE, "bold")
_PENDING_COLOR = "#3a5a44"
_OK_COLOR = "#3dff6a"
_FAIL_COLOR = "#ff5a5a"


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
        self.client_w = window.client_width
        self.client_h = window.client_height
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
        self._check_ids: dict[str, int] = {}

        self.root = tk.Tk()
        self._photo = ImageTk.PhotoImage(snapshot, master=self.root)
        self.root.title("Rock Scan")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.geometry(
            f"{self.client_w}x{self.client_h}+{window.client_left}+{window.client_top}"
        )

        self.canvas = tk.Canvas(
            self.root,
            width=self.client_w,
            height=self.client_h,
            cursor="crosshair",
            highlightthickness=0,
            bg="black",
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self._bg_image_id = self.canvas.create_image(0, 0, image=self._photo, anchor=tk.NW)

        self.hint = tk.Label(
            self.root,
            text=(
                "Box the RESULTS panel — adjust if needed  |  "
                "Enter = scan now  |  Esc = cancel  |  R = reset"
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

    def set_header(self, text: str) -> None:
        self.hint.config(text=text)
        self.root.update_idletasks()

    def ensure_row(self, row_id: str, y_frac: float) -> None:
        """Add a checkmark slot at a HUD row band (inside the green box, left edge)."""
        if row_id in self._check_ids:
            return
        box = self._selection_box()
        if box is None:
            return
        left, top, _right, bottom = box
        height = max(1, bottom - top)
        y = top + int(round(y_frac * height))
        x = left + 8
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
            self.canvas.itemconfig(item, text="", fill=_PENDING_COLOR)
        elif ok:
            self.canvas.itemconfig(item, text="✓", fill=_OK_COLOR)
        else:
            self.canvas.itemconfig(item, text="✗", fill=_FAIL_COLOR)
        self.root.update_idletasks()

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
        if self.selection is None:
            return None
        x0, y0, x1, y1 = self.selection
        return min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)

    def _place_checkmarks(self) -> None:
        for row in HUD_CHECK_ROWS:
            self.ensure_row(row.id, row.y_frac)
        for row in COMPOSITION_CHECK_ROWS:
            self.ensure_row(row.id, row.y_frac)

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

        self._lock_scan_mode()
        self.set_header("Preparing live capture…")
        self._place_checkmarks()
        reporter = ScanProgressReporter(self)

        try:
            self.result = self.on_scan(fractions, reporter)
        except Exception as exc:  # pragma: no cover
            self.result = LiveScanResult(ok=False, error=f"Rock scan failed: {exc}")
            self.set_header(f"Scan failed: {exc}")

        if self.result and self.result.ok:
            self.set_header("Scan complete — returning to Rock Calculator…")
        elif self.result:
            self.set_header((self.result.error or "Scan failed")[:80])

        self.root.after(1600, self._finish)

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
    """Update the live overlay header and HUD-row checkmarks."""

    def __init__(self, overlay: BridgeScanOverlay) -> None:
        self._overlay = overlay

    def set_header(self, text: str) -> None:
        self._overlay.set_header(text)

    def ensure_row(self, row_id: str, y_frac: float) -> None:
        self._overlay.ensure_row(row_id, y_frac)

    def mark_row(self, row_id: str, *, ok: bool | None = None) -> None:
        self._overlay.mark_row(row_id, ok=ok)

    def mark_composition_result(self, composition: dict) -> None:
        """Tick each composition % line and the INERT anchor row like the HUD mockup."""
        lines = composition.get("lines") or []
        comp_start = COMPOSITION_CHECK_ROWS[0].y_frac
        comp_step = 0.09

        if not composition.get("ok") or not lines:
            for row in COMPOSITION_CHECK_ROWS:
                self.mark_row(row.id, ok=False)
            return

        for index in range(len(lines)):
            row_id = f"comp_{index}"
            y_frac = comp_start + index * comp_step
            self.ensure_row(row_id, y_frac)
            self.mark_row(row_id, ok=True)

        inert_ok = composition.get("inert_anchor_line") is not None
        if len(lines) <= 2:
            self.mark_row("inert", ok=inert_ok)
        else:
            inert_y = min(comp_start + len(lines) * comp_step, 0.9)
            self.ensure_row("inert", inert_y)
            self.mark_row("inert", ok=inert_ok)
