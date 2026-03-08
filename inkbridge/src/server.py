from datetime import datetime

from flask import Flask, Response
from waitress import serve

from config import AppConfig
from image_generation import image_cache, image_cache_lock


def _format_timestamp(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def create_server(config: AppConfig) -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index() -> str:
        with image_cache_lock:
            available_endpoints = []
            for page in config.pages:
                cache_entry = image_cache.get(page.slug)
                generated_at = (
                    f"Generated at {_format_timestamp(cache_entry.generated_at)}"
                    if cache_entry
                    else "Not generated yet"
                )
                available_endpoints.append(f'<li><a href="/{page.slug}">/{page.slug} - {generated_at}</a></li>')

        return f"<h1>InkBridge</h1><p>Available endpoints:</p><ul>{''.join(available_endpoints)}</ul>"

    for page in config.pages:
        route_path = f"/{page.slug}"

        def _make_handler(slug: str):
            def _handler() -> Response | tuple[str, int]:
                with image_cache_lock:
                    cache_entry = image_cache.get(slug)

                if cache_entry is None:
                    return "Image not ready yet. Try again shortly.", 503

                return Response(cache_entry.buffer, mimetype="image/bmp")

            return _handler

        app.add_url_rule(route_path, endpoint=f"page_{page.slug}", view_func=_make_handler(page.slug), methods=["GET"])

    return app


def start_server(config: AppConfig) -> None:
    app = create_server(config)
    host = config.global_config.host
    port = config.global_config.port

    print(f"Server running at http://{host}:{port}")
    print("Available endpoints:")
    for page in config.pages:
        print(f"- http://{host}:{port}/{page.slug}")

    # Use a production-grade WSGI server instead of Flask's development server.
    serve(app, host=host, port=port, threads=8)
