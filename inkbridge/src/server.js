import express from 'express';

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function createServer(config, imageCache) {
  const app = express();

  app.get('/', (_, res) => {
    const availableEndpoints = config.pages
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

  config.pages.forEach((page) => {
    app.get(`/${page.slug}`, (_, res) => {
      const cacheEntry = imageCache.get(page.slug);
      if (cacheEntry) {
        res.set('Content-Type', 'image/bmp');
        res.send(cacheEntry.buffer);
      } else {
        res.status(503).send('Image not ready yet. Try again shortly.');
      }
    });
  });

  return app;
}

function startServer(config, imageCache) {
  const app = createServer(config, imageCache);
  const host = config.global.host;
  const port = config.global.port;

  app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
    console.log('Available endpoints:');
    config.pages.forEach((page) => {
      console.log(`- http://${host}:${port}/${page.slug}`);
    });
  });
}

export { createServer, startServer };
