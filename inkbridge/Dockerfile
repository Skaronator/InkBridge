FROM golang:1.27.4-trixie@sha256:b54b2639de8c1bfe538ec5ffc45f29b1932235ac5f6d63c059853646677112d9 AS builder
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$(go env GOARCH) go build -o /out/inkbridge ./cmd/inkbridge

FROM debian:trixie-slim@sha256:f6b08b09a05725f9431502d3b5714f5c4576e82c1a84fa1debe0c24a7e0c3ec4

ARG VERSION
ARG ARCH

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

LABEL \
  io.hass.version="${VERSION}" \
  io.hass.type="addon" \
  io.hass.arch="${ARCH}" \
  org.opencontainers.image.title="InkBridge" \
  org.opencontainers.image.description="Capture Home-Assistant dashboard screenshots and optimize them for eInk displays" \
  org.opencontainers.image.source="https://github.com/Skaronator/InkBridge" \
  org.opencontainers.image.licenses="AGPL v3"

COPY --from=builder /out/inkbridge /app/inkbridge

CMD ["/app/inkbridge"]
