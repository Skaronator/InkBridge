import { chromium } from 'playwright';
import fs from 'fs/promises';
import sharp from 'sharp';

async function captureScreenshot(slug, url, width, height, renderDelay, zoom, homeAssistantConfig) {
  const executionPath = await fs
    .access('/usr/bin/chromium')
    .then(() => '/usr/bin/chromium')
    .catch(() => undefined);

  const browser = await chromium.launch({
    executablePath: executionPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width, height },
  });

  const pageHostname = new URL(url).hostname;
  const homeAssistantHostname = new URL(homeAssistantConfig.url).hostname;
  const isHomeAssistant = pageHostname === homeAssistantHostname;

  if (isHomeAssistant) {
    console.log(`[${slug}] Home Assistant hostnames match. Injecting authentication tokens into localStorage.`);

    const hassTokens = {
      hassUrl: homeAssistantConfig.url,
      access_token: homeAssistantConfig.token,
      token_type: 'Bearer',
    };

    await context.addInitScript(
      (serializedTokens, selectedLanguage) => {
        window.localStorage.setItem('hassTokens', serializedTokens);
        window.localStorage.setItem('selectedLanguage', selectedLanguage);
      },
      JSON.stringify(hassTokens),
      JSON.stringify(homeAssistantConfig.language)
    );
  }

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });

  if (isHomeAssistant) {
    await page.waitForSelector('home-assistant, ha-panel-lovelace', {
      state: 'visible',
      timeout: 15000,
    });
  }

  await page.evaluate((pageZoom) => {
    document.body.style.zoom = String(pageZoom);
  }, zoom);

  if (renderDelay > 0) {
    await page.waitForTimeout(renderDelay);
  }

  const buffer = await page.screenshot({ type: 'png' });
  const { data: rawBuffer, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  await browser.close();
  return { rawBuffer, info };
}

export { captureScreenshot };
