ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    npm

WORKDIR /app

LABEL \
  io.hass.version="1.0.0" \
  io.hass.type="addon" \
  io.hass.arch="amd64"

COPY package.json package-lock.json src ./

RUN npm ci --omit=dev

CMD ["node", "index.js"]
