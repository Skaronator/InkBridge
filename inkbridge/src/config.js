import fs from 'fs/promises';
import { ColorScheme, DitherMode } from '@opendisplay/epaper-dithering';

const OPTIONS_PATH = '/data/options.json';

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
  const rawHomeAssistant = rawOptions?.['home_assistant'] ?? rawOptions?.home_assistant;
  const rawPages = rawOptions?.pages;

  if (!rawGlobal || typeof rawGlobal !== 'object') {
    throw new Error('[config] Missing required object: global');
  }
  if (!rawHomeAssistant || typeof rawHomeAssistant !== 'object') {
    throw new Error('[config] Missing required object: home_assistant');
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
    renderDelay: requiredInt(rawGlobal.render_delay, 'global.render_delay'),
    zoom: requiredInt(rawGlobal.zoom, 'global.zoom'),
  };

  const homeAssistant = {
    url: requiredString(rawHomeAssistant.url, 'home_assistant.url'),
    token: requiredString(rawHomeAssistant.token, 'home_assistant.token'),
    language: requiredString(rawHomeAssistant.language, 'home_assistant.language'),
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
        renderDelay:
          Number.isInteger(rawPage.render_delay) && rawPage.render_delay >= 0 ? rawPage.render_delay : undefined,
        zoom:
          typeof rawPage.zoom === 'number' && Number.isFinite(rawPage.zoom) && rawPage.zoom > 0
            ? rawPage.zoom
            : undefined,
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

export { loadConfig };
