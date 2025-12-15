#!/bin/sh
set -e

# Default to edge mode
MODE="${DNS_MODE:-edge}"

if [ "$MODE" = "central" ]; then
    ACTIVE_COREFILE="/etc/coredns/Corefile.central"
    echo "[dns-entrypoint] Starting in CENTRAL mode"
else
    ACTIVE_COREFILE="/etc/coredns/Corefile.edge"
    echo "[dns-entrypoint] Starting in EDGE mode"
fi

# Create symlink to active config
ln -sf "$ACTIVE_COREFILE" /etc/coredns/Corefile

echo "[dns-entrypoint] Using Corefile: $ACTIVE_COREFILE → /etc/coredns/Corefile"

# Start CoreDNS
exec /usr/bin/coredns -conf /etc/coredns/Corefile -quiet