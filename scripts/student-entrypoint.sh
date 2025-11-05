#!/usr/bin/env sh
set -eu

# Добавляем маршрут к elvira-net через secondary-dns
ip route add 10.50.0.0/16 via 10.50.1.5 || echo "Route already exists or error"

# Запускаем основное приложение (из CMD)
exec "$@"