"""Pre-render the soft full-player backgrounds from the existing cover art."""

from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


assets = Path(__file__).resolve().parents[1] / "dist" / "assets"

for source in ("hero.png", "cover-coast.jpg", "cover-night.jpg", "cover-bloom.jpg", "cover-dunes.jpg", "cover-forest.jpg"):
    with Image.open(assets / source) as image:
        # The source image stays sharp in the cover. This small derivative is
        # blurred once at build time instead of filtering a viewport-sized layer.
        background = ImageOps.fit(image.convert("RGB"), (480, 320), method=Image.Resampling.LANCZOS)
        background = background.filter(ImageFilter.GaussianBlur(24))
        background.save(assets / f"bg-{Path(source).stem}.webp", "WEBP", quality=76, method=6)
