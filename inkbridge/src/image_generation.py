from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from threading import Lock

from epaper_dithering import dither_image
from PIL import Image

from config import AppConfig, PageConfig
from screenshot import capture_screenshot


@dataclass(frozen=True)
class ImageCacheEntry:
    buffer: bytes
    generated_at: datetime


image_cache: dict[str, ImageCacheEntry] = {}
image_cache_lock = Lock()


def create_bmp_buffer(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="BMP")
    return output.getvalue()


def generate_image(page_config: PageConfig, config: AppConfig) -> None:
    width = page_config.width or config.global_config.width
    height = page_config.height or config.global_config.height
    render_delay = page_config.render_delay if page_config.render_delay is not None else config.global_config.render_delay
    zoom = page_config.zoom or config.global_config.zoom
    colorscheme = page_config.colorscheme or config.global_config.colorscheme
    dither_mode = page_config.dither_mode or config.global_config.dither_mode

    print(f"[{page_config.slug}] Capturing screenshot from {page_config.url}...")
    screenshot = capture_screenshot(
        slug=page_config.slug,
        url=page_config.url,
        width=width,
        height=height,
        render_delay=render_delay,
        zoom=zoom,
        home_assistant_config=config.home_assistant,
    )

    print(f"[{page_config.slug}] Starting dithering with colorscheme {colorscheme} and dither mode {dither_mode}...")
    dithered = dither_image(screenshot, colorscheme, dither_mode)

    print(f"[{page_config.slug}] Generating BMP in RAM...")
    bmp_buffer = create_bmp_buffer(dithered)

    with image_cache_lock:
        image_cache[page_config.slug] = ImageCacheEntry(buffer=bmp_buffer, generated_at=datetime.now())

    print(f"[{page_config.slug}] Image ready!")


def update_all_images(config: AppConfig) -> None:
    for page in config.pages:
        try:
            generate_image(page, config)
        except Exception as error:
            print(f"[{page.slug}] Failed to generate image: {error}")
