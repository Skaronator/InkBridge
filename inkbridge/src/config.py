import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from epaper_dithering import ColorScheme, DitherMode

OPTIONS_PATH = Path("/data/options.json")


@dataclass(frozen=True)
class GlobalConfig:
    host: str
    port: int
    width: int
    height: int
    colorscheme: ColorScheme
    dither_mode: DitherMode
    cron_schedule: str
    render_delay: int
    zoom: float


@dataclass(frozen=True)
class HomeAssistantConfig:
    url: str
    token: str
    language: str


@dataclass(frozen=True)
class PageConfig:
    slug: str
    url: str
    width: int | None = None
    height: int | None = None
    colorscheme: ColorScheme | None = None
    dither_mode: DitherMode | None = None
    render_delay: int | None = None
    zoom: float | None = None


@dataclass(frozen=True)
class AppConfig:
    global_config: GlobalConfig
    home_assistant: HomeAssistantConfig
    pages: list[PageConfig]


def _required_string(value: Any, option_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"[config] {option_name} must be a non-empty string.")
    return value.strip()


def _required_positive_int(value: Any, option_name: str) -> int:
    if not isinstance(value, int) or value <= 0:
        raise ValueError(f"[config] {option_name} must be a positive integer.")
    return value


def _required_non_negative_int(value: Any, option_name: str) -> int:
    if not isinstance(value, int) or value < 0:
        raise ValueError(f"[config] {option_name} must be a non-negative integer.")
    return value


def _required_positive_float(value: Any, option_name: str) -> float:
    if not isinstance(value, (int, float)) or value <= 0:
        raise ValueError(f"[config] {option_name} must be a positive number.")
    return float(value)


def _optional_positive_int(value: Any) -> int | None:
    if isinstance(value, int) and value > 0:
        return value
    return None


def _optional_non_negative_int(value: Any) -> int | None:
    if isinstance(value, int) and value >= 0:
        return value
    return None


def _optional_positive_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and value > 0:
        return float(value)
    return None


def _parse_enum_by_name(enum_type: type, value: Any, option_name: str) -> Any:
    candidate = _required_string(value, option_name)
    try:
        return getattr(enum_type, candidate)
    except AttributeError as exc:
        raise ValueError(f"[config] Invalid {option_name} '{candidate}'.") from exc


def load_config() -> AppConfig:
    try:
        raw_options = json.loads(OPTIONS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"[config] {OPTIONS_PATH} not found.") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"[config] Invalid JSON in {OPTIONS_PATH}: {exc}") from exc

    raw_global = raw_options.get("global")
    raw_home_assistant = raw_options.get("home_assistant")
    raw_pages = raw_options.get("pages")

    if not isinstance(raw_global, dict):
        raise ValueError("[config] Missing required object: global")
    if not isinstance(raw_home_assistant, dict):
        raise ValueError("[config] Missing required object: home_assistant")
    if not isinstance(raw_pages, list) or len(raw_pages) == 0:
        raise ValueError("[config] pages must be a non-empty array.")

    global_config = GlobalConfig(
        host=_required_string(raw_global.get("host"), "global.host"),
        port=_required_positive_int(raw_global.get("port"), "global.port"),
        width=_required_positive_int(raw_global.get("width"), "global.width"),
        height=_required_positive_int(raw_global.get("height"), "global.height"),
        colorscheme=_parse_enum_by_name(ColorScheme, raw_global.get("colorscheme"), "global.colorscheme"),
        dither_mode=_parse_enum_by_name(DitherMode, raw_global.get("dither_mode"), "global.dither_mode"),
        cron_schedule=_required_string(raw_global.get("cron_schedule"), "global.cron_schedule"),
        render_delay=_required_non_negative_int(raw_global.get("render_delay"), "global.render_delay"),
        zoom=_required_positive_float(raw_global.get("zoom"), "global.zoom"),
    )

    home_assistant = HomeAssistantConfig(
        url=_required_string(raw_home_assistant.get("url"), "home_assistant.url"),
        token=_required_string(raw_home_assistant.get("token"), "home_assistant.token"),
        language=_required_string(raw_home_assistant.get("language"), "home_assistant.language"),
    )

    pages: list[PageConfig] = []
    for index, raw_page in enumerate(raw_pages):
        if not isinstance(raw_page, dict):
            print(f"[config] Ignoring non-object pages[{index}] entry.")
            continue

        slug = raw_page.get("slug")
        url = raw_page.get("url")
        if not isinstance(slug, str) or not slug.strip() or not isinstance(url, str) or not url.strip():
            print(f"[config] Ignoring pages[{index}] because slug or url is missing.")
            continue

        page = PageConfig(
            slug=slug.strip(),
            url=url.strip(),
            width=_optional_positive_int(raw_page.get("width")),
            height=_optional_positive_int(raw_page.get("height")),
            render_delay=_optional_non_negative_int(raw_page.get("render_delay")),
            zoom=_optional_positive_float(raw_page.get("zoom")),
            colorscheme=(
                None
                if raw_page.get("colorscheme") is None
                else _parse_enum_by_name(ColorScheme, raw_page.get("colorscheme"), f"pages[{index}].colorscheme")
            ),
            dither_mode=(
                None
                if raw_page.get("dither_mode") is None
                else _parse_enum_by_name(DitherMode, raw_page.get("dither_mode"), f"pages[{index}].dither_mode")
            ),
        )
        pages.append(page)

    if not pages:
        raise ValueError("[config] No valid pages configured. Add at least one pages entry in /data/options.json.")

    return AppConfig(global_config=global_config, home_assistant=home_assistant, pages=pages)
