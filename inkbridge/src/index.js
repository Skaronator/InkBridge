import { chromium } from 'playwright';
import { ditherImage, ColorScheme, DitherMode } from '@opendisplay/epaper-dithering';
import sharp from 'sharp';
import { createIndexedBmpBuffer } from './bmp.js';
import fs from 'fs/promises';
import express from 'express';
import cron from 'node-cron';

const OPTIONS_PATH = '/data/options.json';

let CONFIG;

// Key = slug, Value = { buffer: <Buffer>, generatedAt: Date }
const imageCache = new Map();

function pickString(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function requiredInt(value, optionName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[config] ${optionName} must be a positive integer.`);
  }
  return value;
}

function requiredString(value, optionName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[config] ${optionName} must be a non-empty string.`);
  }
  return value.trim();
}

function parseRequiredEnumByKey(enumObject, configuredValue, optionName) {
  const candidate = requiredString(configuredValue, optionName);
  if (candidate in enumObject) {
    return enumObject[candidate];
  }

  throw new Error(`[config] Invalid ${optionName} '${candidate}'.`);
}

async function loadConfig() {
  let rawOptions;
  try {
    const fileContent = await fs.readFile(OPTIONS_PATH, 'utf8');
    rawOptions = JSON.parse(fileContent);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`[config] ${OPTIONS_PATH} not found.`);
    } else if (err instanceof SyntaxError) {
      throw new Error(`[config] Invalid JSON in ${OPTIONS_PATH}: ${err.message}`);
    } else {
      throw err;
    }
  }

  const rawGlobal = rawOptions?.global;
  const rawHomeAssistant = rawOptions?.['home-assistant'];
  const rawPages = rawOptions?.pages;

  if (!rawGlobal || typeof rawGlobal !== 'object') {
    throw new Error('[config] Missing required object: global');
  }
  if (!rawHomeAssistant || typeof rawHomeAssistant !== 'object') {
    throw new Error('[config] Missing required object: home-assistant');
  }
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    throw new Error('[config] pages must be a non-empty array.');
  }

  const global = {
    host: requiredString(rawGlobal.host, 'global.host'),
    port: requiredInt(rawGlobal.port, 'global.port'),
    width: requiredInt(rawGlobal.width, 'global.width'),
    height: requiredInt(rawGlobal.height, 'global.height'),
    colorscheme: parseRequiredEnumByKey(ColorScheme, rawGlobal.colorscheme, 'global.colorscheme'),
    ditherMode: parseRequiredEnumByKey(DitherMode, rawGlobal.dither_mode, 'global.dither_mode'),
    cronSchedule: requiredString(rawGlobal.cron_schedule, 'global.cron_schedule'),
  };

  const homeAssistant = {
    url: requiredString(rawHomeAssistant.url, 'home-assistant.url'),
    token: requiredString(rawHomeAssistant.token, 'home-assistant.token'),
    language: requiredString(rawHomeAssistant.language, 'home-assistant.language'),
  };

  const pages = rawPages
    .map((rawPage, index) => {
      if (!rawPage || typeof rawPage !== 'object') {
        console.warn(`[config] Ignoring non-object pages[${index}] entry.`);
        return null;
      }

      const slug = pickString(rawPage.slug, '');
      const url = pickString(rawPage.url, '');

      if (!slug || !url) {
        console.warn(`[config] Ignoring pages[${index}] because slug or url is missing.`);
        return null;
      }

      return {
        slug,
        url,
        width: Number.isInteger(rawPage.width) && rawPage.width > 0 ? rawPage.width : undefined,
        height: Number.isInteger(rawPage.height) && rawPage.height > 0 ? rawPage.height : undefined,
        colorscheme:
          rawPage.colorscheme === undefined
            ? undefined
            : parseRequiredEnumByKey(ColorScheme, rawPage.colorscheme, `pages[${index}].colorscheme`),
        ditherMode:
          rawPage.dither_mode === undefined
            ? undefined
            : parseRequiredEnumByKey(DitherMode, rawPage.dither_mode, `pages[${index}].dither_mode`),
      };
    })
    .filter(Boolean);

  if (pages.length === 0) {
    throw new Error('[config] No valid pages configured. Add at least one pages entry in /data/options.json.');
  }

  return { global, homeAssistant, pages };
}

async function captureScreenshot(slug, url, width, height, homeAssistantConfig) {
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

    console.log(hassTokens);

    await context.addInitScript(
      (hassTokens, selectedLanguage) => {
        window.localStorage.setItem('hassTokens', hassTokens);
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
      timeout: 30000,
    });
  }

  await page.waitForTimeout(5000);

  const buffer = await page.screenshot({ type: 'png' });
  const { data: rawBuffer, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  await browser.close();
  return { rawBuffer, info };
}

async function generateImage(pageConfig) {
  // Merge global config with page-specific overrides.
  const width = pageConfig.width || CONFIG.global.width;
  const height = pageConfig.height || CONFIG.global.height;
  const colorscheme = pageConfig.colorscheme || CONFIG.global.colorscheme;
  const ditherMode = pageConfig.ditherMode || CONFIG.global.ditherMode;

  console.log(`[${pageConfig.slug}] Capturing Screenshot from ${pageConfig.url}...`);
  const { rawBuffer, info } = await captureScreenshot(
    pageConfig.slug,
    pageConfig.url,
    width,
    height,
    CONFIG.homeAssistant
  );

  console.log(`[${pageConfig.slug}] Starting dithering...`);
  const dithered = ditherImage(
    {
      width: info.width,
      height: info.height,
      data: rawBuffer,
    },
    colorscheme,
    ditherMode
  );

  console.log(`[${pageConfig.slug}] Generating indexed BMP in RAM...`);
  const bmpBuffer = await createIndexedBmpBuffer(dithered);

  // Store the buffer in memory mapped to its slug
  imageCache.set(pageConfig.slug, { buffer: bmpBuffer, generatedAt: new Date() });
  console.log(`[${pageConfig.slug}] Image ready!`);
}

async function updateAllImages() {
  for (const page of CONFIG.pages) {
    try {
      await generateImage(page);
    } catch (err) {
      console.error(`[${page.slug}] Failed to generate image:`, err);
    }
  }
}

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function start() {
  CONFIG = await loadConfig();

  const app = express();

  app.get('/', (req, res) => {
    const availableEndpoints = CONFIG.pages
      .map((page) => {
        const cacheEntry = imageCache.get(page.slug);
        const generatedAt = cacheEntry
          ? `Generated at ${formatTimestamp(cacheEntry.generatedAt)}`
          : 'Not generated yet';
        return `<li><a href="/${page.slug}">/${page.slug} - ${generatedAt}</a></li>`;
      })
      .join('');

    const responseHtml = `<h1>InkBridge</h1><p>Available endpoints:</p><ul>${availableEndpoints}</ul>`;

    res.send(responseHtml);
  });

  CONFIG.pages.forEach((page) => {
    app.get(`/${page.slug}`, (req, res) => {
      const cacheEntry = imageCache.get(page.slug);
      if (cacheEntry) {
        res.set('Content-Type', 'image/bmp');
        res.send(cacheEntry.buffer);
      } else {
        res.status(503).send('Image not ready yet. Try again shortly.');
      }
    });
  });

  const HOST = CONFIG.global.host;
  const PORT = CONFIG.global.port;
  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log('Available endpoints:');
    CONFIG.pages.forEach((page) => {
      console.log(`- http://${HOST}:${PORT}/${page.slug}`);
    });
  });

  console.log('Starting initial image generation...');
  updateAllImages();

  cron.schedule(CONFIG.global.cronSchedule, () => {
    console.log('Cron: Regenerating images...');
    updateAllImages();
  });
}

start().catch((err) => {
  console.error('Failed to start InkBridge:', err);
  process.exit(1);
});
