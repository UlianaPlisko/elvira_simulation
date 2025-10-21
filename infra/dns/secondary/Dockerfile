FROM golang:1.23 as builder

RUN git clone https://github.com/coredns/coredns.git /go/src/github.com/coredns/coredns

WORKDIR /go/src/github.com/coredns/coredns

# Fetch PR #7047 as local branch pr7047 (still open as of Aug 2025; adds ECS support)
RUN git fetch origin pull/7047/head:pr7047
RUN git checkout pr7047

# Disable kubernetes plugin to avoid heavy deps
RUN sed -i '/^kubernetes:/d' plugin.cfg

# Generate and build (force static linking)
RUN go mod download
RUN go generate
RUN rm -rf /tmp/go-build*  # Cleanup temp dirs
ENV CGO_ENABLED=0
RUN go build -v -ldflags="-w -X github.com/coredns/coredns/coremain.GitCommit=$(git rev-parse --short HEAD)" -o /coredns
RUN /coredns --version  # Verify binary works in builder

FROM scratch  

COPY --from=builder /coredns /coredns

# Expose DNS (TCP/UDP) and metrics

EXPOSE 53 53/udp 9153

ENTRYPOINT ["/coredns"]
CMD ["-conf", "/Corefile"]