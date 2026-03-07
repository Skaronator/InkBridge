import cron from 'node-cron';
import { loadConfig } from './config.js';
import { startServer } from './server.js';
import { imageCache, updateAllImages } from './image-generation.js';

async function start() {
  const config = await loadConfig();
  startServer(config, imageCache);

  console.log('Starting initial image generation...');
  updateAllImages(config, imageCache);

  cron.schedule(config.global.cronSchedule, () => {
    console.log('Cron: Regenerating images...');
    updateAllImages(config, imageCache);
  });
}

start().catch((err) => {
  console.error('Failed to start InkBridge:', err);
  process.exit(1);
});
