FROM python:3.14.3-trixie

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    fonts-freefont-ttf \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV VENV_PATH=/opt/venv
ENV PATH="${VENV_PATH}/bin:${PATH}"
ENV PYTHONUNBUFFERED=1

LABEL \
  io.hass.version="1.0.0" \
  io.hass.type="addon" \
  io.hass.arch="amd64" \
  org.opencontainers.image.title="InkBridge" \
  org.opencontainers.image.description="Capture Home-Assistant dashboard screenshots and optimize them for eInk displays" \
  org.opencontainers.image.source="https://github.com/Skaronator/InkBridge" \
  org.opencontainers.image.licenses="AGPL v3"


COPY requirements.txt ./
RUN python3 -m venv "${VENV_PATH}" \
  && "${VENV_PATH}/bin/pip" install --no-cache-dir --upgrade pip \
  && "${VENV_PATH}/bin/pip" install --no-cache-dir -r requirements.txt

COPY src ./src

CMD ["/opt/venv/bin/python", "-u", "src/main.py"]
