# InkBridge

InkBridge captures Home Assistant dashboards or other web pages, optimizes them for eInk displays, and serves them as BMP images over HTTP.

## Quick Setup

After installing the addon, open the configuration page in Home Assistant and set:

1. `home_assistant.url`
   The base URL of your Home Assistant instance, for example `https://homeassistant.local:8123`

2. `home_assistant.token`
   A Long-Lived Access Token so InkBridge can open authenticated dashboards

3. At least one page entry under `pages`
   Each page needs:
   - `slug`: the endpoint name
   - `url`: the page to capture

## Important Settings

- Global settings define the default values for all pages.
- Each page can override `width`, `height`, `colorscheme`, `dither_mode`, `zoom`, `cron_schedule`, and `render_delay`.
- `cron_schedule` defines how often an image is regenerated.
- `render_delay` is useful for slow pages that need extra time before the screenshot is taken.
- `zoom` can help fit more or less content into the image.
- `language` controls the Home Assistant UI language used while rendering dashboards.

## Long-Lived Access Token

To create a token, open your Home Assistant Profile -> Security, or use the button below.

[![](https://my.home-assistant.io/badges/profile_security.svg)](https://my.home-assistant.io/redirect/profile_security/)

Scroll down to Long-Lived Access Tokens, create one named `InkBridge`, and paste it into the addon settings.

## Output

InkBridge serves images on port `4521`.

- `/` shows all configured endpoints and their render status
- `/<slug>` returns the generated BMP image for that page

Example:
A page with the slug `dashboard` will be available at `http://homeassistant.local:4521/dashboard`

## Troubleshooting

- If you see `Image not ready yet. Try again shortly.`, the first render may still be running.
- If the captured image shows placeholders or incomplete content, increase `render_delay`.
- If a Home Assistant dashboard does not load correctly, verify `home_assistant.url` and the access token.

## Support InkBridge

If InkBridge is useful to you, consider starring the project on GitHub:

[https://github.com/Skaronator/InkBridge](https://github.com/Skaronator/InkBridge)

If you run into a problem or want to request an improvement, open an issue here:

[https://github.com/Skaronator/InkBridge/issues](https://github.com/Skaronator/InkBridge/issues)
