#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/ai-usage-card}"
REPO_URL="${REPO_URL:-https://github.com/RoBro92/HACS-ai-usage-banner-card.git}"
PLIST_DIR="$HOME/Library/LaunchAgents"
ENV_FILE="$HOME/.ai-usage-card.env"

if ! command -v git >/dev/null 2>&1; then
  echo "Install Xcode Command Line Tools or Git first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install node
  else
    echo "Install Node.js LTS from https://nodejs.org/ or Homebrew, then rerun." >&2
    exit 1
  fi
fi

if ! command -v codex >/dev/null 2>&1; then
  curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
fi

if ! command -v gemini >/dev/null 2>&1; then
  npm install -g @google/gemini-cli
fi

rm -rf "$INSTALL_DIR"
git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
mkdir -p "$PLIST_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<'ENV'
export MQTT_HOST=homeassistant.local
export MQTT_PORT=1883
export MQTT_USER=
export MQTT_PASSWORD=
ENV
  chmod 0600 "$ENV_FILE"
fi

create_plist() {
  local provider="$1"
  local label="com.robro92.ai-usage-$provider"
  cat >"$PLIST_DIR/$label.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>source "$ENV_FILE"; node "$INSTALL_DIR/examples/collectors/run-ai-usage-collector.mjs" --provider "$provider"</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/$label.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/$label.err</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST_DIR/$label.plist" >/dev/null 2>&1 || true
  launchctl load "$PLIST_DIR/$label.plist"
}

create_plist codex
create_plist gemini

echo "Installed AI usage collector in $INSTALL_DIR."
echo "Edit $ENV_FILE with MQTT credentials, then run launchctl start com.robro92.ai-usage-codex."
