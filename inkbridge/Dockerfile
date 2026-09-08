FROM golang:1.27.1-trixie@sha256:9baa6b4187bbb98d240372a8a235ac0bb6b5ddd52bba1431dc2f7c0705862728 AS builder
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$(go env GOARCH) go build -o /out/inkbridge ./cmd/inkbridge

FROM debian:trixie-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132

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
