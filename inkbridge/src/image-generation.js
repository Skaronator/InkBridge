import { ditherImage } from '@opendisplay/epaper-dithering';
import { createIndexedBmpBuffer } from './bmp.js';
import { captureScreenshot } from './screenshot.js';

const imageCache = new Map();

async function generateImage(pageConfig, config, imageCache) {
  const width = pageConfig.width ?? config.global.width;
  const height = pageConfig.height ?? config.global.height;
  const renderDelay = pageConfig.renderDelay ?? config.global.renderDelay;
  const zoom = pageConfig.zoom ?? config.global.zoom;
  const colorscheme = pageConfig.colorscheme ?? config.global.colorscheme;
  const ditherMode = pageConfig.ditherMode ?? config.global.ditherMode;

  console.log(`[${pageConfig.slug}] Capturing Screenshot from ${pageConfig.url}...`);
  const { rawBuffer, info } = await captureScreenshot(
    pageConfig.slug,
    pageConfig.url,
    width,
    height,
    renderDelay,
    zoom,
    config.homeAssistant
  );

  console.log(
    `[${pageConfig.slug}] Starting dithering with colorscheme ${colorscheme} and dither mode ${ditherMode}...`
  );
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

  imageCache.set(pageConfig.slug, { buffer: bmpBuffer, generatedAt: new Date() });
  console.log(`[${pageConfig.slug}] Image ready!`);
}

async function updateAllImages(config, imageCache) {
  for (const page of config.pages) {
    try {
      await generateImage(page, config, imageCache);
    } catch (err) {
      console.error(`[${page.slug}] Failed to generate image:`, err);
    }
  }
}

export { imageCache, generateImage, updateAllImages };
