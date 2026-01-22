#!/usr/bin/env node
/**
 * Export nine-slice configs from scene editor to static JSON file
 *
 * Usage: node scripts/export-nine-slices.mjs
 *
 * Requires scene editor to be running at http://localhost:5174
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCENE_EDITOR_URL = process.env.SCENE_EDITOR_URL || 'http://localhost:5174';
const OUTPUT_PATH = path.resolve(__dirname, '../public/assets/data/nine-slice-configs.json');

async function main() {
  console.log('Exporting nine-slice configs from scene editor...');
  console.log(`  Source: ${SCENE_EDITOR_URL}/api/nine-slice-export`);
  console.log(`  Target: ${OUTPUT_PATH}`);

  try {
    const response = await fetch(`${SCENE_EDITOR_URL}/api/nine-slice-export`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const configs = await response.json();
    const configCount = Object.keys(configs).length;

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write with pretty formatting
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(configs, null, 2) + '\n');

    console.log(`\nSuccess! Exported ${configCount} nine-slice config(s).`);

  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      console.error('\nError: Could not connect to scene editor.');
      console.error('Make sure the scene editor is running:');
      console.error('  cd /Users/datamole/SimpleGame/scene-editor && npm run dev');
      process.exit(1);
    }

    console.error('\nError exporting nine-slice configs:', error.message);
    process.exit(1);
  }
}

main();
