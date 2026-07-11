"""Align frozen snapshots with on-screen overlay windows."""

from __future__ import annotations

from dataclasses import dataclass

from PIL import Image

from game_window import GameWindow


@dataclass(frozen=True)
class OverlayFrame:
    """Screen placement and pixel coordinate space for a frozen HUD snapshot."""

    left: int
    top: int
    width: int
    height: int

    @classmethod
    def from_window_snapshot(cls, window: GameWindow, snapshot: Image.Image) -> OverlayFrame:
        snap_w, snap_h = snapshot.size
        return cls(
            left=window.client_left,
            top=window.client_top,
            width=snap_w,
            height=snap_h,
        )


def normalize_snapshot(snapshot: Image.Image, window: GameWindow) -> Image.Image:
    """
    Resize capture to the current client rect when PrintWindow/mss sizes disagree.

    Fractions are always stored relative to this returned image's pixel size.
    """
    target = (window.client_width, window.client_height)
    if snapshot.size == target:
        return snapshot
    return snapshot.resize(target, Image.LANCZOS)
