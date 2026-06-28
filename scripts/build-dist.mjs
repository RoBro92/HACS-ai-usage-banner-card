import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const distDir = "dist";

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyFile("ai-usage-card.js", join(distDir, "HACS-ai-usage-card.js"));

console.log(`Built ${distDir}/HACS-ai-usage-card.js.`);
