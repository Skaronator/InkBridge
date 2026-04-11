# InkBridge

A lightweight app for capturing Home Assistant dashboard screenshots and optimizing them for eInk displays.

InkBridge can render multiple pages at once and even capture any URL, making it a simple way to power custom eInk dashboards.

## How It Works

InkBridge lets you reuse your existing Home Assistant dashboards instead of rebuilding them for device-specific eInk firmware. That means you can keep using Home Assistant's UI, cards, and integrations while InkBridge handles the image generation.

InkBridge opens each configured page, captures a screenshot, optimizes it for your eInk display, and serves the result as a BMP image. Images are generated on a schedule and kept ready for your display, so when the device wakes up and requests a new image, it gets an immediate response, renders faster, and can return to sleep sooner to save power.

## Features

- Capture multiple dashboards or pages at once.
- Use global defaults and override `width`, `height`, `colorscheme`, `dither_mode`, `zoom`, `cron_schedule`, and `render_delay` per page when needed.
- Render both Home Assistant dashboards and external URLs.
- Serve pre-generated BMP images over simple HTTP endpoints for low-power eInk displays.
- Choose from these color schemes: `MONO`, `BWR`, `BWY`, `BWRY`, `BWGBRY`, `GRAYSCALE_4`, `GRAYSCALE_8`, `GRAYSCALE_16`
- Choose from these dither modes: `NONE`, `BURKES`, `FLOYD_STEINBERG`, `ATKINSON`, `STUCKI`, `SIERRA`, `JARVIS_JUDICE_NINKE`

## Getting Started

Open the Home Assistant App Store from Settings -> Apps, or use the button below.

[![](https://my.home-assistant.io/badges/supervisor_store.svg)](https://my.home-assistant.io/redirect/supervisor_store/)

1. Open the three-dot menu in the top-right corner and select Repositories.
2. Add this repository: `https://github.com/Skaronator/InkBridge`
3. Return to the overview and install InkBridge.

## Configuration

Configuration is done through the Home Assistant frontend, and each option includes a description there. Most settings are straightforward, but these are the ones worth paying attention to.

- The Global Settings section defines the default values for all pages. Each page can override them individually.
- Set Home Assistant URL to the base URL of your instance, for example `https://homeassistant.local:8123`.
- Home Assistant dashboards require a Long-Lived Access Token so InkBridge can open authenticated pages.
- `language` controls the Home Assistant UI language used while rendering dashboards.
- Each page needs a `slug` and a `url`. The slug becomes the image endpoint path, so a page with the slug `dashboard` will be exposed as `/dashboard`.
- `cron_schedule` controls how often images are regenerated. For example, `*/5 * * * *` refreshes a page every five minutes.
- `zoom` helps fit more or less content into the capture area.
- Increase `render_delay` if a page loads slowly or briefly shows placeholders before the final content appears.

To create a token, open your Home Assistant Profile -> Security, or use the button below.

[![](https://my.home-assistant.io/badges/profile_security.svg)](https://my.home-assistant.io/redirect/profile_security/)

Scroll down to Long-Lived Access Tokens and create one named `InkBridge`, then paste it into InkBridge Settings under Home Assistant API Settings -> Long-Lived Access Token.

## Endpoints

InkBridge exposes a small web server on port `4521`:

- `/` shows an index page with all configured endpoints and their latest generation status. This is useful for checking whether a page has rendered successfully.
- `/<slug>` returns the generated BMP image for that page.

For example, a page with the slug `dashboard` will be available at `http://homeassistant.local:4521/dashboard`.

## Troubleshooting

- If an endpoint returns `Image not ready yet. Try again shortly.`, the first render may still be in progress. Wait a moment and check the index page at `/`.
- If the captured image shows placeholders or incomplete content, increase `render_delay`.
- If a Home Assistant dashboard does not load correctly, verify both the Home Assistant URL and the Long-Lived Access Token.
