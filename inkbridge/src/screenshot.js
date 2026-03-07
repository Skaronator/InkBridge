import { chromium } from 'playwright';
import sharp from 'sharp';

let browserPromise;
let shutdownHooksRegistered = false;

function registerShutdownHooks() {
  if (shutdownHooksRegistered) {
    return;
  }

  shutdownHooksRegistered = true;

  const shutdown = async () => {
    if (!browserPromise) {
      return;
    }

    try {
      const browser = await browserPromise;
      await browser.close();
    } catch (error) {
      console.error(`[browser] Failed to close Chromium during shutdown: ${error.message}`);
    } finally {
      browserPromise = undefined;
    }
  };

  process.once('beforeExit', shutdown);
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      .catch((error) => {
        browserPromise = undefined;
        throw error;
      });

    registerShutdownHooks();
  }

  return browserPromise;
}

async function captureScreenshot(slug, url, width, height, renderDelay, zoom, homeAssistantConfig) {
  const browser = await getBrowser();

  const context = await browser.newContext({
    viewport: { width, height },
  });

  try {
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

    await page.evaluate((pageZoom) => {
      document.body.style.zoom = String(pageZoom);
    }, zoom);

    if (isHomeAssistant) {
      await page.waitForSelector('home-assistant, ha-panel-lovelace', {
        state: 'visible',
        timeout: 2500,
      });
    }

    if (renderDelay > 0) {
      await page.waitForTimeout(renderDelay);
    }

    const buffer = await page.screenshot({ type: 'png' });
    const { data: rawBuffer, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    return { rawBuffer, info };
  } finally {
    await context.close();
  }
}

export { captureScreenshot };
