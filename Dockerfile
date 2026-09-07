FROM ghcr.io/home-assistant/devcontainer:6-apps@sha256:91cfc04eaf96b4844b397418781413e2dc4dd8b6f0d6669bb754fa8497b289fc

# renovate: datasource=docker depName=golang versioning=semver
ARG GO_VERSION=1.27.1
RUN curl -L -o go.tar.gz https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && rm go.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
