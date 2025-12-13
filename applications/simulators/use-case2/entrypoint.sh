#!/bin/bash
ip route add 172.20.0.0/16 via 192.168.1.1 || true
exec /opt/bin/start-selenium-standalone.sh