# InkBridge

A lightweight App to capture Home-Assistant dashboard screenshots and optimize them for eInk displays.

## Runtime

This addon now runs on Python and uses:

- `playwright` + Chromium for page capture
- `epaper-dithering` for color quantization/dithering
- `Flask` for BMP endpoint serving
- `APScheduler` for cron-based refresh jobs
