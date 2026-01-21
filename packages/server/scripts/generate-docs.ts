#!/usr/bin/env tsx
/**
 * Generate static API documentation from OpenAPI spec
 *
 * This script:
 * 1. Generates the OpenAPI spec JSON file
 * 2. Runs Redocly to generate static HTML
 *
 * The static HTML is fully readable by LLMs and search engines.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(__dirname, "..");
const outputDir = join(serverRoot, "public");
const specPath = join(outputDir, "openapi.json");
const htmlPath = join(outputDir, "docs.html");

async function main() {
  console.log("[generate-docs] Starting documentation generation...");

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(`[generate-docs] Created output directory: ${outputDir}`);
  }

  // Import the swagger spec (dynamic import for ESM)
  console.log("[generate-docs] Loading OpenAPI spec...");
  const { swaggerSpec } = await import("../src/lib/openapi.js");

  // Write spec to JSON file
  writeFileSync(specPath, JSON.stringify(swaggerSpec, null, 2));
  console.log(`[generate-docs] Wrote OpenAPI spec to: ${specPath}`);

  // Generate static HTML using Redocly
  console.log("[generate-docs] Generating static HTML with Redocly...");
  try {
    execSync(
      `npx @redocly/cli build-docs ${specPath} --output ${htmlPath} --title "Swarm Vault API Documentation"`,
      {
        cwd: serverRoot,
        stdio: "inherit",
      }
    );
    console.log(`[generate-docs] Wrote static HTML to: ${htmlPath}`);
  } catch (error) {
    console.error("[generate-docs] Failed to generate static HTML:", error);
    process.exit(1);
  }

  console.log("[generate-docs] Documentation generation complete!");
  console.log(`  - OpenAPI JSON: ${specPath}`);
  console.log(`  - Static HTML:  ${htmlPath}`);
}

main().catch((err) => {
  console.error("[generate-docs] Error:", err);
  process.exit(1);
});
