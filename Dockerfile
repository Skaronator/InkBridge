FROM ghcr.io/home-assistant/devcontainer:6-apps@sha256:4e2d6efd9ac472c27f5cc522672ea9bbfdf35a897266ff4b1ac1f21ee611a4a9

# renovate: datasource=docker depName=golang versioning=semver
ARG GO_VERSION=1.27.2
RUN curl -L -o go.tar.gz https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && rm go.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
