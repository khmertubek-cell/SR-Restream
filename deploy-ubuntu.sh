#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with: sudo bash deploy-ubuntu.sh"
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  PASSWORD="$(openssl rand -base64 36 | tr -d '\n')"
  sed -i "s|REPLACE_WITH_A_LONG_RANDOM_PASSWORD|${PASSWORD}|" .env
  echo "Created .env with a random admin password. Save it securely."
fi

if grep -q 'relay.example.com' .env; then
  echo "ERROR: Edit .env and set DOMAIN and PUBLIC_BASE_URL to your real DNS hostname."
  echo "Create an A record pointing that hostname to this VPS public IP first."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "Types: deb" > /etc/apt/sources.list.d/docker.sources
  echo "URIs: https://download.docker.com/linux/ubuntu" >> /etc/apt/sources.list.d/docker.sources
  echo "Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}" >> /etc/apt/sources.list.d/docker.sources
  echo "Components: stable" >> /etc/apt/sources.list.d/docker.sources
  echo "Architectures: $(dpkg --print-architecture)" >> /etc/apt/sources.list.d/docker.sources
  echo "Signed-By: /etc/apt/keyrings/docker.asc" >> /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

mkdir -p data hls
chmod 750 data hls

docker compose up -d --build

echo
echo "Deployment started. Check status with: docker compose ps"
echo "Logs: docker compose logs -f relay"
echo "Dashboard: https://$(grep '^DOMAIN=' .env | cut -d= -f2-)"
echo "Credentials are in: $APP_DIR/.env"
