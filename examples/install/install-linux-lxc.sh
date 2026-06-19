#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ai-usage-card}"
SERVICE_USER="${SERVICE_USER:-aiusage}"
REPO_URL="${REPO_URL:-https://github.com/RoBro92/HACS-ai-usage-banner-card.git}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo or as root." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git nodejs npm util-linux

if ! command -v codex >/dev/null 2>&1; then
  curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
fi

if ! command -v gemini >/dev/null 2>&1; then
  npm install -g @google/gemini-cli
fi

id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
rm -rf "$INSTALL_DIR"
git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" /etc/ai-usage-card

if [[ ! -f /etc/ai-usage-card/mqtt.env ]]; then
  cat >/etc/ai-usage-card/mqtt.env <<'ENV'
MQTT_HOST=homeassistant.local
MQTT_PORT=1883
MQTT_USER=
MQTT_PASSWORD=
ENV
  chown "$SERVICE_USER:$SERVICE_USER" /etc/ai-usage-card/mqtt.env
  chmod 0640 /etc/ai-usage-card/mqtt.env
fi

cat >/etc/systemd/system/ai-usage-codex.service <<EOF
[Unit]
Description=Publish Codex AI usage to Home Assistant MQTT
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=$SERVICE_USER
EnvironmentFile=-/etc/ai-usage-card/mqtt.env
ExecStart=/usr/bin/node $INSTALL_DIR/examples/collectors/run-ai-usage-collector.mjs --provider codex
EOF

cat >/etc/systemd/system/ai-usage-gemini.service <<EOF
[Unit]
Description=Publish Gemini AI usage to Home Assistant MQTT
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=$SERVICE_USER
EnvironmentFile=-/etc/ai-usage-card/mqtt.env
ExecStart=/usr/bin/node $INSTALL_DIR/examples/collectors/run-ai-usage-collector.mjs --provider gemini
EOF

cat >/etc/systemd/system/ai-usage-codex.timer <<'EOF'
[Unit]
Description=Run Codex AI usage publisher every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/ai-usage-gemini.timer <<'EOF'
[Unit]
Description=Run Gemini AI usage publisher every 15 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=15min
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now ai-usage-codex.timer ai-usage-gemini.timer

echo "Installed AI usage collector in $INSTALL_DIR."
echo "Edit /etc/ai-usage-card/mqtt.env, then run: systemctl start ai-usage-codex.service ai-usage-gemini.service"
