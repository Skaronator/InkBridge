FROM ghcr.io/home-assistant/devcontainer:4-apps@sha256:1a1d3c3f1e770ae32620e2711c8925c124d78745e8e36fcf1aface661f86aab0

# renovate: datasource=docker depName=golang versioning=semver
ARG GO_VERSION=1.26.2
RUN curl -L -o go.tar.gz https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && rm go.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
