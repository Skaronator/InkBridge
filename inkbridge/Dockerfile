FROM golang:1.27.2-trixie@sha256:e58d6f83b3416618d8bcac2b3dde1b7f7e3c4a77d25e88637f8bbae81536c48d AS builder
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$(go env GOARCH) go build -o /out/inkbridge ./cmd/inkbridge

FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

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
