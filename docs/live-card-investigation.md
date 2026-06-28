# Live Card Investigation

Read-only Home Assistant MCP investigation found:

- Dashboard: `desk-display`, title `Desk Display`.
- AI tab/view: `AI Agents`, path `ai-agents`, panel view.
- Card type: `custom:ai-usage-card`.
- Card location: `config['views'][1]['cards'][0]`.
- Resource type: inline Lovelace ES module.
- Registered custom element: `ai-usage-card`.
- Data source: MQTT sensors from the `mqtt` platform.

The live card config contains three rows:

| Row | 5h remaining | 5h reset | Weekly remaining | Weekly reset |
| --- | --- | --- | --- | --- |
| GEMINI | `sensor.ai_allowance_monitor_agy_gemini_5h_remaining` | `sensor.ai_allowance_monitor_agy_gemini_5h_reset` | `sensor.ai_allowance_monitor_agy_gemini_weekly_remaining` | `sensor.ai_allowance_monitor_agy_gemini_weekly_reset` |
| CLAUDE | `sensor.ai_allowance_monitor_agy_claude_gpt_5h_remaining` | `sensor.ai_allowance_monitor_agy_claude_gpt_5h_reset` | `sensor.ai_allowance_monitor_agy_claude_gpt_weekly_remaining` | `sensor.ai_allowance_monitor_agy_claude_gpt_weekly_reset` |
| CODEX | `sensor.ai_allowance_monitor_codex_gpt_5h_remaining` | `sensor.ai_allowance_monitor_codex_gpt_5h_reset` | `sensor.ai_allowance_monitor_codex_gpt_weekly_remaining` | `sensor.ai_allowance_monitor_codex_gpt_weekly_reset` |

MQTT entity registry details:

- Platform: `mqtt`.
- Shared device identifier in HA: `AI Allowance Monitor`.
- Percent sensors use `%` and `mdi:timer-outline`.
- Reset sensors use timestamp device class and `mdi:clock-outline`.

No Home Assistant config was changed during this investigation.
