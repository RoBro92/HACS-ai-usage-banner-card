# Collector Setup

This guide mirrors the working deployment pattern used for the original dashboard card:

1. Install the AI CLI tools on an LXC or other small Linux host.
2. Run their usage commands in a headless terminal session.
3. Parse percentages and reset timestamps.
4. Publish the values over MQTT.
5. Let Home Assistant MQTT discovery create the sensors.

## Linux/LXC Installer

For a Debian or Ubuntu LXC, use the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/RoBro92/HACS-ai-usage-banner-card/main/examples/install/install-linux-lxc.sh | sudo bash
```

The installer:

- Installs Node.js, Git, `util-linux`, Codex CLI, and Gemini CLI.
- Clones this repo to `/opt/ai-usage-card`.
- Creates `/etc/ai-usage-card/mqtt.env` for MQTT settings.
- Creates systemd services and timers for Codex and Gemini every 15 minutes.

Edit MQTT settings after install:

```bash
sudo nano /etc/ai-usage-card/mqtt.env
sudo systemctl start ai-usage-codex.service ai-usage-gemini.service
```

## macOS Installer

Run:

```bash
curl -fsSL https://raw.githubusercontent.com/RoBro92/HACS-ai-usage-banner-card/main/examples/install/install-macos.sh | bash
```

The installer clones the repo to `~/ai-usage-card`, creates `~/.ai-usage-card.env`, and installs LaunchAgents that run the collector every 15 minutes.

## Windows Installer

Run PowerShell as your normal user:

```powershell
iwr https://raw.githubusercontent.com/RoBro92/HACS-ai-usage-banner-card/main/examples/install/install-windows.ps1 -UseB | iex
```

The installer clones the repo to `%USERPROFILE%\ai-usage-card`, creates `.env.ps1`, and registers Scheduled Tasks for Codex and Gemini every 15 minutes.

## Manual LXC Packages

Debian or Ubuntu example:

```bash
sudo apt update
sudo apt install -y nodejs npm util-linux
```

`util-linux` provides `script`, which is useful for CLIs that render differently unless they think they are attached to a terminal.

Install whichever CLIs you use, then confirm the usage command works interactively before automating it.

## Headless Command Pattern

Some CLIs need a TTY. Use `script` to provide one:

```bash
script -q -e -c "codex /usage" /dev/null
script -q -e -c "gemini /usage" /dev/null
```

If your CLI is interactive rather than command-based, wrap it with `timeout` and pipe the command:

```bash
printf '/usage\n/quit\n' | timeout 45s script -q -e -c "codex" /dev/null
```

CLI output formats can change. Keep the parser outside Home Assistant so breakage does not affect dashboard loading.

## Unified Runner

`examples/collectors/run-ai-usage-collector.mjs` is the preferred entrypoint on Linux/LXC, macOS, and Windows. It runs the terminal command, parses the usage output, publishes MQTT discovery config, and publishes state values.

Examples:

```bash
node examples/collectors/run-ai-usage-collector.mjs --provider codex
node examples/collectors/run-ai-usage-collector.mjs --provider gemini
```

Override the command when a CLI changes its usage command:

```bash
node examples/collectors/run-ai-usage-collector.mjs --provider codex --command "codex /usage"
```

MQTT environment variables:

```text
MQTT_HOST=homeassistant.local
MQTT_PORT=1883
MQTT_USER=
MQTT_PASSWORD=
MQTT_TLS=false
```

## Parser Example

`examples/collectors/parse-ai-usage.mjs` accepts raw CLI text on stdin and returns normalized JSON:

```bash
script -q -e -c "codex /usage" /dev/null | node examples/collectors/parse-ai-usage.mjs --model codex_gpt
```

Expected JSON shape:

```json
{
  "model_id": "codex_gpt",
  "five_hour": {
    "remaining": 98,
    "reset": "2026-06-20T00:15:42+00:00"
  },
  "weekly": {
    "remaining": 73,
    "reset": "2026-06-24T21:18:14+00:00"
  }
}
```

## Legacy MQTT Publish Example

`examples/collectors/publish-ai-usage.sh` is still available for users who prefer `jq` and `mosquitto_pub` pipelines. The unified Node runner above is recommended for new installs.

```bash
export MQTT_HOST=homeassistant.local
export MQTT_USER=homeassistant
export MQTT_PASSWORD='change-me'

script -q -e -c "codex /usage" /dev/null \
  | node examples/collectors/parse-ai-usage.mjs --model codex_gpt --name "CODEX Gpt" \
  | examples/collectors/publish-ai-usage.sh
```

## systemd Timer

Install the service and timer examples from `examples/systemd/`, adjusting paths and user names first.

Run every 15 minutes:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-usage-codex.timer
```

The card updates as soon as the MQTT sensor states change.
