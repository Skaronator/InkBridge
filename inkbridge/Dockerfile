FROM golang:1.27.0-trixie@sha256:ae28539d2ef595b9a2930dd7f031d9592376829dc0eae7cb869559f7d5812c3a AS builder
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$(go env GOARCH) go build -o /out/inkbridge ./cmd/inkbridge

FROM debian:trixie-slim@sha256:4ffb3a1511099754cddc70eb1b12e50ffdb67619aa0ab6c13fcd800a78ef7c7a

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
