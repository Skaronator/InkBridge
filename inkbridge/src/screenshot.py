import json
from io import BytesIO
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import Error as PlaywrightError, sync_playwright

from config import HomeAssistantConfig


def capture_screenshot(
    slug: str,
    url: str,
    width: int,
    height: int,
    render_delay: int,
    zoom: float,
    home_assistant_config: HomeAssistantConfig,
) -> Image.Image:
    with sync_playwright() as playwright:
        page_hostname = urlparse(url).hostname
        home_assistant_hostname = urlparse(home_assistant_config.url).hostname
        is_home_assistant = page_hostname == home_assistant_hostname
        storage_state = None

        if is_home_assistant:
            hass_tokens = {
                "hassUrl": home_assistant_config.url,
                "access_token": home_assistant_config.token,
                "token_type": "Bearer",
            }
            hass_origin = urlparse(home_assistant_config.url)
            storage_state = {
                "cookies": [],
                "origins": [
                    {
                        "origin": f"{hass_origin.scheme}://{hass_origin.netloc}",
                        "localStorage": [
                            {"name": "hassTokens", "value": json.dumps(hass_tokens)},
                            {"name": "selectedLanguage", "value": json.dumps(home_assistant_config.language)},
                        ],
                    }
                ],
            }

        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = browser.new_context(viewport={"width": width, "height": height}, storage_state=storage_state)

        try:
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_load_state("load")

            page.evaluate("pageZoom => { document.body.style.zoom = String(pageZoom); }", zoom)

            if render_delay > 0:
                page.wait_for_timeout(render_delay)

            png_bytes = page.screenshot(type="png")
            return Image.open(BytesIO(png_bytes)).convert("RGBA")
        finally:
            context.close()
            browser.close()
