#!/usr/bin/env sh
set -eu

# Добавляем маршрут к elvira-net через secondary-dns
ip route add 172.20.0.0/16 via 192.168.1.5 || echo "Route already exists or error"

# Запускаем основное приложение (из CMD)
exec "$@"