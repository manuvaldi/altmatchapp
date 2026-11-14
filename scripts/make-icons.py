#!/usr/bin/env python3
"""Genera los iconos de la app (PWA, favicon, apple-touch) a partir del escudo.

El escudo que sirve la RFFM es pequeño (100x105) y con fondo blanco, así que no
vale como icono del manifest: se compone sobre el azul de marca, en una tarjeta
blanca redondeada, y se exporta en los tamaños que pide el manifest.

Uso: python3 scripts/make-icons.py
"""

from __future__ import annotations

import json
import pathlib
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("Falta Pillow: pip install pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"
SNAPSHOT = PUBLIC / "data" / "snapshot.json"

BRAND = (30, 70, 255, 255)  # --brand (#1e46ff)
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling para bordes suaves


def crest_path() -> pathlib.Path:
    """Escudo del equipo según el snapshot generado (o el genérico si falta)."""
    try:
        snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        name = snap["team"]["crest"]
        candidate = PUBLIC / "data" / "crests" / name
        if candidate.exists():
            return candidate
    except (OSError, KeyError, ValueError):
        pass
    sys.exit("No encuentro el escudo del equipo: ejecuta antes `npm run fetch`")


def build(size: int, crest_ratio: float, card: bool = True) -> Image.Image:
    """Icono cuadrado: fondo + escudo (con tarjeta blanca redondeada opcional)."""
    big = size * SS
    canvas = Image.new("RGBA", (big, big), BRAND if card else WHITE)

    if card:
        # Tarjeta blanca (más pequeña en maskable para respetar la zona segura)
        pad = int(big * (0.115 if crest_ratio > 0.6 else 0.16))
        radius = int(big * 0.22)
        rounded = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        ImageDraw.Draw(rounded).rounded_rectangle(
            [pad, pad, big - pad, big - pad], radius=radius, fill=WHITE
        )
        canvas.alpha_composite(rounded)

    # Escudo centrado dentro de la tarjeta
    box = int(big * crest_ratio)
    crest = Image.open(crest_path()).convert("RGBA")
    # El escudo original mide ~100 px: hay que ampliarlo, no sólo encogerlo.
    scale = box / max(crest.width, crest.height)
    crest = crest.resize(
        (max(1, round(crest.width * scale)), max(1, round(crest.height * scale))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(
        crest, ((big - crest.width) // 2, (big - crest.height) // 2)
    )

    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 0.56, True),
        ("icon-512.png", 512, 0.56, True),
        ("icon-maskable-512.png", 512, 0.44, True),
        ("apple-touch-icon.png", 180, 0.52, True),
        # A 32 px la tarjeta se come el escudo: mejor escudo a sangre sobre blanco
        ("favicon-32.png", 32, 0.92, False),
    ]
    for name, size, ratio, card in targets:
        build(size, ratio, card).save(ICONS / name, optimize=True)
        print(f"  ✓ icons/{name}")


if __name__ == "__main__":
    print(f"Escudo: {crest_path().name}")
    main()
