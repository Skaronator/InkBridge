import { chromium } from 'playwright';
import { ditherImage, ColorScheme, DitherMode } from '@opendisplay/epaper-dithering';
import sharp from 'sharp';
import { createIndexedBmpBuffer } from './bmp.js';
import fs from 'fs/promises';
import express from 'express';
import cron from 'node-cron';

const OPTIONS_PATH = '/data/options.json';

const DEFAULT_CONFIG = {
  global: {
    host: '0.0.0.0',
    port: 4521,
    width: 1600,
    height: 1200,
    colorscheme: 'BWGBRY',
    ditherMode: 'FLOYD_STEINBERG',
    cronSchedule: '* * * * *',
  },
  pages: [
    {
      slug: 'home',
      url: 'https://home.wagner.gg',
    },
  ],
};

let CONFIG;

// Key = slug, Value = { buffer: <Buffer>, generatedAt: Date }
const imageCache = new Map();

function pickInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pickString(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function parseEnumByKey(enumObject, configuredValue, fallbackKey, optionName) {
  const candidate = pickString(configuredValue, fallbackKey);
  if (candidate in enumObject) {
    return enumObject[candidate];
  }

  console.warn(`[config] Invalid ${optionName} '${candidate}'. Falling back to '${fallbackKey}'.`);
  return enumObject[fallbackKey];
}

async function loadConfig() {
  let rawOptions = {};

  try {
    const fileContent = await fs.readFile(OPTIONS_PATH, 'utf8');
    rawOptions = JSON.parse(fileContent);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[config] ${OPTIONS_PATH} not found. Using default settings.`);
    } else if (err instanceof SyntaxError) {
      throw new Error(`[config] Invalid JSON in ${OPTIONS_PATH}: ${err.message}`);
    } else {
      throw err;
    }
  }

  const rawGlobal = rawOptions.global && typeof rawOptions.global === 'object' ? rawOptions.global : {};
  const rawPages =
    Array.isArray(rawOptions.pages) && rawOptions.pages.length > 0 ? rawOptions.pages : DEFAULT_CONFIG.pages;

  const global = {
    host: pickString(rawGlobal.host, DEFAULT_CONFIG.global.host),
    port: pickInt(rawGlobal.port, DEFAULT_CONFIG.global.port),
    width: pickInt(rawGlobal.width, DEFAULT_CONFIG.global.width),
    height: pickInt(rawGlobal.height, DEFAULT_CONFIG.global.height),
    colorscheme: parseEnumByKey(
      ColorScheme,
      rawGlobal.colorscheme,
      DEFAULT_CONFIG.global.colorscheme,
      'global.colorscheme'
    ),
    ditherMode: parseEnumByKey(
      DitherMode,
      rawGlobal.dither_mode,
      DEFAULT_CONFIG.global.ditherMode,
      'global.dither_mode'
    ),
    cronSchedule: pickString(rawGlobal.cron_schedule, DEFAULT_CONFIG.global.cronSchedule),
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
            : parseEnumByKey(
                ColorScheme,
                rawPage.colorscheme,
                DEFAULT_CONFIG.global.colorscheme,
                `pages[${index}].colorscheme`
              ),
        ditherMode:
          rawPage.dither_mode === undefined
            ? undefined
            : parseEnumByKey(
                DitherMode,
                rawPage.dither_mode,
                DEFAULT_CONFIG.global.ditherMode,
                `pages[${index}].dither_mode`
              ),
      };
    })
    .filter(Boolean);

  if (pages.length === 0) {
    throw new Error('[config] No valid pages configured. Add at least one pages entry in /data/options.json.');
  }

  return { global, pages };
}

async function captureScreenshot(url, width, height) {
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

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

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
  const { rawBuffer, info } = await captureScreenshot(pageConfig.url, width, height);

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
