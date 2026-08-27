FROM ghcr.io/home-assistant/devcontainer:6-apps@sha256:a8cbd4a1c05dfebaf92dec384ffaf112af95dfcbd6d9465ca2252a7866b44942

# renovate: datasource=docker depName=golang versioning=semver
ARG GO_VERSION=1.27.0
RUN curl -L -o go.tar.gz https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && rm go.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
