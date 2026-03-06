import { chromium } from 'playwright';
import { ditherImage, ColorScheme, DitherMode } from '@opendisplay/epaper-dithering';
import sharp from 'sharp';
import { createIndexedBmpBuffer } from './bmp.js'; // Assuming bmp.js is refactored as you mentioned
import fs from 'fs/promises';
import express from 'express';
import cron from 'node-cron';

const CONFIG = {
  global: {
    host: '0.0.0.0',
    port: 4521,
    width: 1600,
    height: 1200,
    colorscheme: ColorScheme.BWGBRY,
    ditherMode: DitherMode.FLOYD_STEINBERG,
    cronSchedule: '* * * * *', // Every minute
  },
  pages: [
    {
      slug: 'home', // Webserver endpoint path
      url: 'https://home.wagner.gg',
      // Optional overrides:
      // width: 800,
      // height: 600,
      // colorscheme: ColorScheme.BWGBRY,
      // ditherMode: DitherMode.FLOYD_STEINBERG,
    },
    // Add more pages here later!
  ],
};

// Map to hold our generated buffers in RAM. Key = slug, Value = { buffer: <Buffer>, generatedAt: Date }
const imageCache = new Map();

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
  // Merge global config with page-specific overrides
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

// --- Express Webserver Setup ---
const app = express();

app.get('/', (req, res) => {
  const availableEndpoints = CONFIG.pages
    .map((page) => {
      const cacheEntry = imageCache.get(page.slug);
      const generatedAt = cacheEntry ? `Generated at ${formatTimestamp(cacheEntry.generatedAt)}` : 'Not generated yet';
      return `<li><a href="/${page.slug}">/${page.slug} - ${generatedAt}</a></li>`;
    })
    .join('');

  const responseHtml = `<h1>InkBridge</h1><p>Available endpoints:</p><ul>${availableEndpoints}</ul>`;

  res.send(responseHtml);
});

// Dynamically create endpoints based on the config
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
