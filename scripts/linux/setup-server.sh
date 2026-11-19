#!/usr/bin/env bash
#
# One-time setup of a fresh Ubuntu Server / Debian machine (for example a
# Proxmox VM) to run Simmer. Safe to re-run: every step checks first.
#
# Run it from inside the cloned repo, as your normal user (it uses sudo):
#   git clone https://github.com/<you>/<repo>.git ~/simmer
#   cd ~/simmer && scripts/linux/setup-server.sh
#
# What it does:
#   1. Installs updates, git, curl, automatic security updates, and the QEMU
#      guest agent (lets Proxmox shut the VM down cleanly and show its IP).
#   2. Installs Docker and lets your user run it without sudo.
#   3. Installs Tailscale and starts the login (prints a link to open).
#   4. Schedules the nightly backup at 3 AM with cron.
# It does NOT create .env, start the app, or restore data; SELF-HOSTING.md
# section 8 has those steps, because they need your secrets and backup file.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
say() { printf '\n==> %s\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as your normal user, not root. It calls sudo where needed."
  exit 1
fi
if ! command -v apt-get > /dev/null; then
  echo "This script expects Ubuntu or Debian (apt-get not found)."
  exit 1
fi

say "Installing updates and base packages"
sudo apt-get update -q
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yq \
  git curl ca-certificates unattended-upgrades qemu-guest-agent
# Security updates install themselves daily from here on.
echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' \
  | sudo debconf-set-selections
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
# Only does anything inside a VM with the agent enabled in Proxmox
# (VM -> Options -> QEMU Guest Agent); harmless elsewhere.
sudo systemctl enable --now qemu-guest-agent 2> /dev/null || true

say "Installing Docker"
if command -v docker > /dev/null; then
  echo "Docker already installed: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker
if ! id -nG "$USER" | grep -qw docker; then
  sudo usermod -aG docker "$USER"
  NEED_RELOGIN=1
fi

say "Installing Tailscale"
if command -v tailscale > /dev/null; then
  echo "Tailscale already installed: $(tailscale version | head -1)"
else
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if tailscale status > /dev/null 2>&1; then
  echo "Tailscale is already logged in."
else
  echo "Open the link below to add this machine to your tailnet:"
  sudo tailscale up
fi

say "Scheduling the nightly backup (3 AM)"
mkdir -p "$REPO/backups"
CRON_LINE="0 3 * * * cd \"$REPO\" && scripts/backup.sh >> backups/backup.log 2>&1"
if crontab -l 2> /dev/null | grep -Fq "scripts/backup.sh"; then
  echo "Backup cron entry already present."
else
  ( crontab -l 2> /dev/null || true; echo "$CRON_LINE" ) | crontab -
  echo "Added: $CRON_LINE"
fi

say "Done"
if [ -n "${NEED_RELOGIN:-}" ]; then
  echo "Log out and back in first, so your user can run docker without sudo."
fi
cat <<EOF
Next steps (details in SELF-HOSTING.md, section 8):
  1. Copy your .env into $REPO and add this machine's addresses to CLIENT_URL.
  2. docker compose up -d --build
  3. Restore your latest backup with scripts/restore.sh
  4. sudo tailscale serve --bg --https=443 http://127.0.0.1:3000
EOF
