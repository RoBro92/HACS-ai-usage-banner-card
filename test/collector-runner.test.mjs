import test from "node:test";
import assert from "node:assert/strict";

import { buildUsageCommand, normalizeProviderConfig } from "../examples/collectors/run-ai-usage-collector.mjs";

test("normalizeProviderConfig creates provider defaults for codex and gemini", () => {
  const codex = normalizeProviderConfig({ provider: "codex" });
  const gemini = normalizeProviderConfig({ provider: "gemini" });

  assert.equal(codex.modelId, "codex_gpt");
  assert.equal(codex.name, "CODEX Gpt");
  assert.match(codex.command, /codex/);
  assert.match(codex.command, /\/usage/);

  assert.equal(gemini.modelId, "agy_gemini");
  assert.equal(gemini.name, "AGY Gemini");
  assert.match(gemini.command, /gemini/);
  assert.match(gemini.command, /\/usage/);
});

test("buildUsageCommand wraps commands with a pseudo terminal on Unix-like platforms", () => {
  const command = buildUsageCommand("codex /usage", { platform: "linux" });

  assert.match(command, /script/);
  assert.match(command, /codex \/usage/);
});

test("buildUsageCommand uses PowerShell process execution on Windows", () => {
  const command = buildUsageCommand("codex /usage", { platform: "win32" });

  assert.match(command, /powershell/);
  assert.match(command, /codex \/usage/);
});
