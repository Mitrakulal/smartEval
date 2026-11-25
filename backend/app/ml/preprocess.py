"""Image preprocessing for handwritten answer photos."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Tuple

from PIL import Image, ImageOps

from app.core.config import settings

logger = logging.getLogger("smarteval.preprocess")


def preprocess_image(source: Path) -> Tuple[Path, str]:
    """Normalize a photo and return ``(normalized_jpeg_path, sha256)``.

    The normalized file is what Gemini sees and what the API serves.  It is
    rotated according to EXIF, converted to RGB, limited to a sensible long edge
    and re-encoded as JPEG.  The SHA-256 is computed over the normalized bytes so
    the transcript cache is stable across repeated uploads of the same photo.
    """
    source = Path(source)
    if not source.is_file():
        raise FileNotFoundError(f"Answer image not found: {source}")

    # If the worker already normalized this file, just hash it again.
    if source.name.endswith("_norm.jpg"):
        data = source.read_bytes()
        return source, hashlib.sha256(data).hexdigest()

    target = source.with_name(f"{source.stem}_norm.jpg")
    max_edge = max(256, int(settings.MAX_IMAGE_EDGE))
    quality = min(95, max(60, int(settings.JPEG_QUALITY)))

    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original)
        image = image.convert("RGB")
        # thumbnail() only shrinks; it never upscales a small phone photo.
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, format="JPEG", quality=quality, optimize=True)

    data = target.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    logger.debug("Preprocessed %s -> %s (%d bytes)", source, target, len(data))
    return target, digest
