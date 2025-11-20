FROM golang:1.23 as builder

RUN git clone https://github.com/coredns/coredns.git /go/src/github.com/coredns/coredns

WORKDIR /go/src/github.com/coredns/coredns

RUN git fetch origin pull/7047/head:pr7047
RUN git checkout pr7047

RUN sed -i '/^import (/,$ { /"github.com\/coredns\/coredns\/plugin\/metadata"/d; /"strconv"/d; }' plugin/ecs/ecs.go || true
COPY scripts/ecs.go /tmp/ecs.go
RUN rm plugin/ecs/ecs.go
RUN mv /tmp/ecs.go plugin/ecs/ecs.go

RUN sed -i '/^kubernetes:/d' plugin.cfg

RUN go mod download
RUN go generate
RUN rm -rf /tmp/go-build*
ENV CGO_ENABLED=0
RUN go build -v -ldflags="-w -X github.com/coredns/coredns/coremain.GitCommit=$(git rev-parse --short HEAD)" -o /coredns
RUN /coredns --version

FROM scratch  

COPY --from=builder /coredns /coredns

EXPOSE 53 53/udp 9153

ENTRYPOINT ["/coredns"]
CMD ["-conf", "/Corefile"]