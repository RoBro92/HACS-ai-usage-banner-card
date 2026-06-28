import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPresetToggle,
  clampPercent,
  createPresetModel,
  formatPercent,
  formatResetTime,
  getPresetEnabled,
  logoTypeForModel,
  metricState,
  stateValue,
} from "../ai-usage-card.js";

const hass = {
  states: {
    "sensor.codex_5h_remaining": { state: "98.2" },
    "sensor.codex_5h_reset": { state: "2026-06-20T00:15:42+00:00" },
    "sensor.codex_weekly_remaining": { state: "73" },
    "sensor.codex_weekly_reset": { state: "2026-06-24T21:18:14+00:00" },
  },
};

test("state helpers read and format Home Assistant values safely", () => {
  assert.equal(stateValue(hass, "sensor.codex_5h_remaining"), "98.2");
  assert.equal(stateValue(hass, "sensor.missing"), "unknown");
  assert.equal(clampPercent("-5"), 0);
  assert.equal(clampPercent("101.7"), 100);
  assert.equal(formatPercent("98.2"), "98%");
  assert.equal(formatPercent("not-a-number"), "-");
});

test("formatResetTime returns compact countdown labels", () => {
  const now = new Date("2026-06-19T21:15:42+00:00");

  assert.equal(formatResetTime("2026-06-19T21:35:42+00:00", now), "20m");
  assert.equal(formatResetTime("2026-06-20T00:15:42+00:00", now), "3h");
  assert.equal(formatResetTime("2026-06-24T21:18:14+00:00", now), "5d 0h");
  assert.equal(formatResetTime("invalid", now), "invalid");
});

test("metricState reports missing sensors without throwing", () => {
  const present = metricState(hass, {
    remaining: "sensor.codex_5h_remaining",
    reset: "sensor.codex_5h_reset",
  });
  const missing = metricState(hass, {
    remaining: "sensor.nope",
    reset: "sensor.nope_reset",
  });

  assert.equal(present.percent, 98.2);
  assert.equal(present.hasRemaining, true);
  assert.equal(present.hasReset, true);
  assert.equal(missing.percent, null);
  assert.equal(missing.percentLabel, "-");
  assert.equal(missing.resetLabel, "-");
});

test("logo detection supports known AI providers", () => {
  assert.equal(logoTypeForModel({ name: "Gemini" }), "gemini");
  assert.equal(logoTypeForModel({ name: "Claude" }), "claude");
  assert.equal(logoTypeForModel({ name: "Codex GPT" }), "gpt");
  assert.equal(logoTypeForModel({ name: "Local model" }), "ai");
});

test("createPresetModel returns dashboard-compatible Gemini and Codex rows", () => {
  const gemini = createPresetModel("gemini");
  const codex = createPresetModel("codex");

  assert.equal(gemini.name, "GEMINI");
  assert.equal(gemini.accent, "#54f2ef");
  assert.match(gemini.logo, /Google_Gemini_logo/);
  assert.equal(gemini.five_hour.remaining, "sensor.ai_allowance_monitor_agy_gemini_5h_remaining");
  assert.equal(gemini.weekly.reset, "sensor.ai_allowance_monitor_agy_gemini_weekly_reset");

  assert.equal(codex.name, "CODEX");
  assert.equal(codex.accent, "#76f29b");
  assert.match(codex.logo, /OpenAI_logo/);
  assert.equal(codex.five_hour.remaining, "sensor.ai_allowance_monitor_codex_gpt_5h_remaining");
  assert.equal(codex.weekly.reset, "sensor.ai_allowance_monitor_codex_gpt_weekly_reset");
});

test("applyPresetToggle adds and removes Gemini or Codex rows without disturbing custom rows", () => {
  const config = {
    models: [{ name: "LOCAL", five_hour: { remaining: "sensor.local_5h" }, weekly: { remaining: "sensor.local_week" } }],
  };

  const withGemini = applyPresetToggle(config, "gemini", true);
  const withBoth = applyPresetToggle(withGemini, "codex", true);
  const withoutGemini = applyPresetToggle(withBoth, "gemini", false);

  assert.equal(getPresetEnabled(withGemini, "gemini"), true);
  assert.equal(getPresetEnabled(withGemini, "codex"), false);
  assert.deepEqual(withBoth.models.map((model) => model.name), ["LOCAL", "GEMINI", "CODEX"]);
  assert.deepEqual(withoutGemini.models.map((model) => model.name), ["LOCAL", "CODEX"]);
  assert.equal(config.models.length, 1, "original config should not be mutated");
});
