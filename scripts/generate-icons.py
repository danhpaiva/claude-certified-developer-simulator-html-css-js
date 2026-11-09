"""Gera os ícones do PWA em assets/icons/ (PNG reais, não data: URI). Uso: python scripts/generate-icons.py
Requer Pillow (pip install pillow). Não roda no CI: os PNGs gerados são versionados.

Logo = o mesmo do favicon: quadrado arredondado laranja com o símbolo </> branco (grade de 64 unidades).
  icon-192.png / icon-512.png    purpose "any"      cantos arredondados, fundo transparente
  icon-maskable-512.png          purpose "maskable" quadrado cheio; símbolo dentro da zona segura (círculo de 80%)
  apple-touch-icon.png (180)     quadrado cheio     (o iOS aplica o arredondamento e não aceita transparência)
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "icons"
ORANGE = (194, 65, 12, 255)  # #c2410c
WHITE = (255, 255, 255, 255)
SUPER = 8  # supersampling para bordas suaves

STROKES = [[(20, 22), (10, 32), (20, 42)], [(44, 22), (54, 32), (44, 42)], [(36, 16), (28, 48)]]
STROKE_WIDTH = 5


def render(size: int, rounded: bool) -> Image.Image:
    big = size * SUPER
    unit = big / 64
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=14 * unit, fill=ORANGE)
    else:
        draw.rectangle([0, 0, big, big], fill=ORANGE)
    r = STROKE_WIDTH * unit / 2
    for stroke in STROKES:
        points = [(x * unit, y * unit) for x, y in stroke]
        draw.line(points, fill=WHITE, width=round(STROKE_WIDTH * unit), joint="curve")
        for x, y in points:  # pontas e vértices arredondados
            draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)
    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(192, rounded=True).save(OUT / "icon-192.png", optimize=True)
    render(512, rounded=True).save(OUT / "icon-512.png", optimize=True)
    render(512, rounded=False).save(OUT / "icon-maskable-512.png", optimize=True)
    render(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    (OUT / "icon.svg").write_text(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
        "<rect width='64' height='64' rx='14' fill='#c2410c'/>"
        "<path d='M20 22l-10 10 10 10M44 22l10 10-10 10M36 16l-8 32' fill='none' stroke='white' "
        "stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/></svg>\n",
        encoding="utf-8",
    )
    for path in sorted(OUT.iterdir()):
        print(f"{path.name:24s} {path.stat().st_size:>7d} bytes")


if __name__ == "__main__":
    main()
