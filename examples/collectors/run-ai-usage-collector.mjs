#!/usr/bin/env node

import { execFile } from "node:child_process";
import net from "node:net";
import tls from "node:tls";
import { promisify } from "node:util";
import { parseUsage } from "./parse-ai-usage.mjs";

const execFileAsync = promisify(execFile);

const PROVIDER_DEFAULTS = {
  codex: {
    modelId: "codex_gpt",
    name: "CODEX Gpt",
    command: "codex /usage",
  },
  gemini: {
    modelId: "agy_gemini",
    name: "AGY Gemini",
    command: "gemini /usage",
  },
};

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function mqttString(value) {
  const buffer = Buffer.from(String(value));
  return Buffer.concat([Buffer.from([buffer.length >> 8, buffer.length & 0xff]), buffer]);
}

function mqttRemainingLength(length) {
  const bytes = [];
  let value = length;
  do {
    let encoded = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) encoded |= 128;
    bytes.push(encoded);
  } while (value > 0);
  return Buffer.from(bytes);
}

function mqttPacket(type, payload) {
  return Buffer.concat([Buffer.from([type]), mqttRemainingLength(payload.length), payload]);
}

function mqttConnectPacket({ clientId, username, password }) {
  let flags = 0b00000010;
  const parts = [mqttString("MQTT"), Buffer.from([4])];
  const payload = [mqttString(clientId)];

  if (username) flags |= 0b10000000;
  if (password) flags |= 0b01000000;
  parts.push(Buffer.from([flags, 0, 60]));
  if (username) payload.push(mqttString(username));
  if (password) payload.push(mqttString(password));

  return mqttPacket(0x10, Buffer.concat([...parts, ...payload]));
}

function mqttPublishPacket(topic, message, retain = true) {
  const header = retain ? 0x31 : 0x30;
  return mqttPacket(header, Buffer.concat([mqttString(topic), Buffer.from(String(message))]));
}

function mqttDisconnectPacket() {
  return Buffer.from([0xe0, 0x00]);
}

export function normalizeProviderConfig(options = {}) {
  const provider = options.provider || "codex";
  const defaults = PROVIDER_DEFAULTS[provider] || {};
  return {
    provider,
    modelId: options.modelId || defaults.modelId || provider,
    name: options.name || defaults.name || provider,
    command: options.command || defaults.command || `${provider} /usage`,
  };
}

export function buildUsageCommand(command, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === "win32") {
    return `powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replaceAll('"', '\\"')}"`;
  }
  return `script -q -e -c "${command.replaceAll('"', '\\"')}" /dev/null`;
}

export async function runUsageCommand(command, options = {}) {
  const wrapped = buildUsageCommand(command, options);
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", wrapped] : ["-lc", wrapped];
  const { stdout, stderr } = await execFileAsync(shell, args, { timeout: Number(options.timeoutMs || 60000), maxBuffer: 1024 * 1024 });
  return `${stdout || ""}\n${stderr || ""}`;
}

export function buildDiscoveryAndStateMessages(parsed, options = {}) {
  const baseTopic = options.baseTopic || "ai_allowance_monitor";
  const discoveryPrefix = options.discoveryPrefix || "homeassistant";
  const deviceId = options.deviceId || "ai_allowance_monitor";
  const deviceName = options.deviceName || "AI Allowance Monitor";
  const modelId = parsed.model_id;
  const modelName = parsed.name || modelId;
  const device = {
    identifiers: [deviceId],
    name: deviceName,
    manufacturer: "Local CLI collector",
  };
  const specs = [
    ["5h_remaining", "5H Remaining", parsed.five_hour?.remaining, { unit_of_measurement: "%", icon: "mdi:timer-outline" }],
    ["5h_reset", "5H Reset", parsed.five_hour?.reset, { device_class: "timestamp", icon: "mdi:clock-outline" }],
    ["weekly_remaining", "Weekly Remaining", parsed.weekly?.remaining, { unit_of_measurement: "%", icon: "mdi:timer-outline" }],
    ["weekly_reset", "Weekly Reset", parsed.weekly?.reset, { device_class: "timestamp", icon: "mdi:clock-outline" }],
  ];

  return specs.flatMap(([suffix, label, value, config]) => {
    const stateTopic = `${baseTopic}/${modelId}/${suffix}/state`;
    const discoveryTopic = `${discoveryPrefix}/sensor/ai_usage_${modelId}_${suffix}/config`;
    const discovery = {
      name: `${modelName} ${label}`,
      unique_id: `ai_usage_${modelId}_${suffix}`,
      state_topic: stateTopic,
      ...config,
      device,
    };
    const messages = [{ topic: discoveryTopic, message: JSON.stringify(discovery), retain: true }];
    if (value !== null && value !== undefined && value !== "") {
      messages.push({ topic: stateTopic, message: String(value), retain: true });
    }
    return messages;
  });
}

export async function publishMqttMessages(messages, options = {}) {
  const host = options.host || process.env.MQTT_HOST || "homeassistant.local";
  const port = Number(options.port || process.env.MQTT_PORT || 1883);
  const username = options.username || process.env.MQTT_USER || "";
  const password = options.password || process.env.MQTT_PASSWORD || "";
  const useTls = String(options.tls || process.env.MQTT_TLS || "false").toLowerCase() === "true";
  const clientId = `ai-usage-${process.pid}-${Date.now()}`;
  const socket = useTls ? tls.connect({ host, port }) : net.connect({ host, port });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  socket.write(mqttConnectPacket({ clientId, username, password }));
  await new Promise((resolve, reject) => {
    socket.once("data", (chunk) => (chunk[0] === 0x20 && chunk[3] === 0 ? resolve() : reject(new Error("MQTT connection refused"))));
    socket.once("error", reject);
  });

  for (const item of messages) {
    socket.write(mqttPublishPacket(item.topic, item.message, item.retain !== false));
  }
  socket.write(mqttDisconnectPacket());
  socket.end();
}

async function main() {
  const providerConfig = normalizeProviderConfig({
    provider: argValue("--provider", process.env.AI_USAGE_PROVIDER || "codex"),
    modelId: argValue("--model-id", process.env.AI_USAGE_MODEL_ID || null),
    name: argValue("--name", process.env.AI_USAGE_NAME || null),
    command: argValue("--command", process.env.AI_USAGE_COMMAND || null),
  });

  const output = await runUsageCommand(providerConfig.command);
  const parsed = parseUsage(output, { modelId: providerConfig.modelId, name: providerConfig.name });
  const messages = buildDiscoveryAndStateMessages(parsed, {
    baseTopic: process.env.BASE_TOPIC || "ai_allowance_monitor",
    discoveryPrefix: process.env.MQTT_DISCOVERY_PREFIX || "homeassistant",
  });

  await publishMqttMessages(messages);
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
