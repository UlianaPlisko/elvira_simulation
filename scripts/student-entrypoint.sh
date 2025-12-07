#!/usr/bin/env sh
set -e

echo "Waiting for network to be fully up (IP + default gateway)..."

timeout=60
elapsed=0
MY_IP=""
DEFAULT_GW=""

while [ $elapsed -lt $timeout ]; do
    MY_IP=$(hostname -i | awk '{print $1}' 2>/dev/null || echo "")
    DEFAULT_GW=$(ip route show default | awk '{print $3}' 2>/dev/null | head -n1 || echo "")

    if [ -n "$MY_IP" ] && [ "$MY_IP" != "127.0.0.1" ] && [ -n "$DEFAULT_GW" ] && echo "$DEFAULT_GW" | grep -q "^192\.168\."; then
        echo "Network ready → IP=$MY_IP, default gateway=$DEFAULT_GW"
        break
    fi

    sleep 1
    elapsed=$((elapsed + 1))
done

if [ $elapsed -ge $timeout ]; then
    echo "ERROR: Network did not come up in time!"
    MY_IP=${MY_IP:-unknown}
fi

# Auto-detect correct faculty gateway from our own IP
case "$MY_IP" in
    192.168.1.50) GATEWAY="192.168.1.5" ;;
    192.168.2.50) GATEWAY="192.168.2.5" ;;
    192.168.3.50) GATEWAY="192.168.3.5" ;;
    192.168.4.50) GATEWAY="192.168.4.5" ;;
    192.168.5.50) GATEWAY="192.168.5.5" ;;
    *) echo "WARNING: Cannot detect faculty, falling back to 192.168.1.5"; GATEWAY="192.168.1.5" ;;
esac

echo "Adding route to elvira-net via $GATEWAY (with retries)"

added=0
for i in $(seq 1 10); do
    if ip route replace 172.20.0.0/16 via "$GATEWAY" > /dev/null 2>&1; then
        echo "Route successfully added/replaced"
        added=1
        break
    else
        echo "Attempt $i failed (Nexthop has invalid gateway or File exists) – retrying in 2s..."
        sleep 2
    fi
done

if [ $added -eq 0 ]; then
    echo "WARNING: Could not add route – continuing anyway (may work later)"
fi

# Quick DNS sanity check
echo "Testing DNS resolution of elvira.lib..."
if nslookup elvira.lib 172.20.0.3 >/dev/null 2>&1; then
    echo "DNS test OK"
else
    echo "DNS test failed – but simulator will still start"
fi

echo "Starting simulator..."
exec node dist/sim.js