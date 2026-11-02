FROM ghcr.io/home-assistant/devcontainer:6-apps@sha256:9c08de75a4d91938dab76d44846a2d297d4ce92bf80024ff15a4f6dff766855e

# renovate: datasource=docker depName=golang versioning=semver
ARG GO_VERSION=1.27.3
RUN curl -L -o go.tar.gz https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && rm go.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
