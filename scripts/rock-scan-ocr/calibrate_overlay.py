"""Frozen snapshot overlay for RESULTS panel region selection."""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path

from PIL import Image, ImageTk

from capture import crop_fraction
from panel_crop import PanelFractions
from region_store import REGION_FILE, fractions_from_pixels, save_region


class RegionOverlay:
    def __init__(
        self,
        left: int,
        top: int,
        width: int,
        height: int,
        background: Image.Image,
        *,
        return_focus_hwnd: int,
        initial_fractions: PanelFractions | None = None,
        enter_label: str = "Enter = save & scan now",
    ) -> None:
        self.client_w = width
        self.client_h = height
        self.bg_image = background
        self.return_focus_hwnd = return_focus_hwnd
        self.start_x = 0
        self.start_y = 0
        self.sel_rect_id: int | None = None
        self.shade_ids: list[int] = []
        self.selection: tuple[int, int, int, int] | None = None
        self.confirmed_fractions: PanelFractions | None = None
        self.cancelled = False

        self.root = tk.Tk()
        self._photo = ImageTk.PhotoImage(background, master=self.root)
        self.root.title("Rock Scan Region")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.geometry(f"{width}x{height}+{left}+{top}")

        self.canvas = tk.Canvas(
            self.root,
            width=width,
            height=height,
            cursor="crosshair",
            highlightthickness=0,
            bg="black",
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.canvas.create_image(0, 0, image=self._photo, anchor=tk.NW)

        self.hint = tk.Label(
            self.root,
            text=(
                "Box the RESULTS panel (MASS/RES/INST/COMP) — not the reticle  |  "
                f"{enter_label}  |  Esc=cancel  |  R=reset"
            ),
            fg="#d7ffe0",
            bg="#102018",
            font=("Segoe UI", 10),
        )
        self.hint.place(x=8, y=8)

        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)
        self.root.bind("<Return>", self._on_save)
        self.root.bind("<Escape>", self._on_cancel)
        self.root.bind("r", self._on_reset)
        self.root.bind("R", self._on_reset)
        self.root.protocol("WM_DELETE_WINDOW", self._on_cancel)

        if initial_fractions is not None:
            self._set_selection_from_fractions(initial_fractions)

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
            x0,
            y0,
            x1,
            y1,
            outline="#5cff7a",
            width=3,
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
        w = self.client_w
        h = self.client_h
        fill = "#000000"
        stipple = "gray50"
        rects = [
            (0, 0, w, top),
            (0, bottom, w, h),
            (0, top, left, bottom),
            (right, top, w, bottom),
        ]
        for rx0, ry0, rx1, ry1 in rects:
            if rx1 > rx0 and ry1 > ry0:
                self.shade_ids.append(
                    self.canvas.create_rectangle(
                        rx0, ry0, rx1, ry1, fill=fill, stipple=stipple, outline=""
                    )
                )

    def _on_press(self, event: tk.Event) -> None:
        self.start_x = event.x
        self.start_y = event.y
        if self.sel_rect_id is not None:
            self.canvas.delete(self.sel_rect_id)
            self.sel_rect_id = None
        self._clear_shades()

    def _on_drag(self, event: tk.Event) -> None:
        if self.sel_rect_id is not None:
            self.canvas.delete(self.sel_rect_id)
        self._draw_shades(self.start_x, self.start_y, event.x, event.y)
        self.sel_rect_id = self.canvas.create_rectangle(
            self.start_x,
            self.start_y,
            event.x,
            event.y,
            outline="#5cff7a",
            width=3,
        )

    def _on_release(self, event: tk.Event) -> None:
        x0, y0 = self.start_x, self.start_y
        x1, y1 = event.x, event.y
        if abs(x1 - x0) < 20 or abs(y1 - y0) < 20:
            self.selection = None
            return
        self.selection = (x0, y0, x1, y1)

    def _on_reset(self, _event: tk.Event | None = None) -> None:
        if self.sel_rect_id is not None:
            self.canvas.delete(self.sel_rect_id)
            self.sel_rect_id = None
        self._clear_shades()
        self.selection = None

    def _finish(self) -> None:
        from focus_helper import restore_focus  # noqa: PLC0415

        self.root.destroy()
        restore_focus(self.return_focus_hwnd)

    def _on_cancel(self, _event: tk.Event | None = None) -> None:
        self.cancelled = True
        self._finish()

    def _on_save(self, _event: tk.Event | None = None) -> None:
        if self.selection is None:
            print("Draw a box first (drag around the RESULTS panel).", file=sys.stderr)
            return
        x0, y0, x1, y1 = self.selection
        self.confirmed_fractions = fractions_from_pixels(
            x0, y0, x1, y1, self.client_w, self.client_h
        )
        self._finish()

    def run(self) -> PanelFractions | None:
        self.root.focus_force()
        self.root.mainloop()
        return None if self.cancelled else self.confirmed_fractions


def confirm_region_on_snapshot(
    window,
    snapshot: Image.Image,
    *,
    return_focus_hwnd: int,
    initial_fractions: PanelFractions | None = None,
    enter_label: str = "Enter = save & scan now",
) -> PanelFractions | None:
    """Show overlay on a frozen frame; return fractions on Enter or None on Esc."""
    overlay = RegionOverlay(
        window.client_left,
        window.client_top,
        window.client_width,
        window.client_height,
        snapshot,
        return_focus_hwnd=return_focus_hwnd,
        initial_fractions=initial_fractions,
        enter_label=enter_label,
    )
    return overlay.run()


def save_region_preview(
    snapshot: Image.Image,
    fractions: PanelFractions,
    *,
    preview_path: Path | None = None,
) -> Path:
    path = preview_path or Path(__file__).resolve().parent / "calibration-preview.png"
    crop_fraction(snapshot, fractions).save(path)
    return path
