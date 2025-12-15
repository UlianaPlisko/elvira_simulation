# ================ Builder stage (same as before) ================
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git
RUN git clone https://github.com/coredns/coredns.git /go/src/github.com/coredns/coredns
WORKDIR /go/src/github.com/coredns/coredns
RUN git fetch origin pull/7047/head:pr7047 && git checkout pr7047
COPY scripts/ecs.go plugin/ecs/ecs.go
RUN sed -i '/^kubernetes:/d' plugin.cfg
RUN go mod download
ENV CGO_ENABLED=0
RUN go build -ldflags="-w -s" -o /coredns

# ================ Runtime stage ================
FROM alpine:3.20

RUN apk --no-cache add iproute2 ca-certificates

COPY --from=builder /coredns /usr/bin/coredns

# Copy both Corefiles
COPY infra/dns/secondary/Corefile.edge /etc/coredns/Corefile.edge
COPY infra/dns/secondary/Corefile.central /etc/coredns/Corefile.central

# Copy simple entrypoint
COPY scripts/dns-entrypoint.sh /usr/bin/dns-entrypoint.sh
RUN chmod +x /usr/bin/dns-entrypoint.sh

EXPOSE 53 53/udp 9153/tcp

ENTRYPOINT ["/usr/bin/dns-entrypoint.sh"]