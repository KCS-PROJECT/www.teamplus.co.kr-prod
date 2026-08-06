#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { collectMaterialSymbols } from './collect-material-symbols.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');

function parseArguments(argv) {
  const options = { root: DEFAULT_ROOT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--json') {
      options.json = true;
    } else if (argv[index] === '--root' && argv[index + 1]) {
      options.root = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${argv[index]}`);
    }
  }
  return options;
}

function fontDataUrl(fontPath) {
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Font file not found: ${fontPath}`);
  }
  return `data:font/woff2;base64,${fs.readFileSync(fontPath).toString('base64')}`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function compareRenderedLigatures(page, ligatures, originalFontUrl, subsetFontUrl) {
  const samples = ligatures.map((name, index) => {
    const escaped = escapeHtml(name);
    return [
      `<span id="o-on-${index}" class="sample original enabled">${escaped}</span>`,
      `<span id="o-off-${index}" class="sample original disabled">${escaped}</span>`,
      `<span id="s-on-${index}" class="sample subset enabled">${escaped}</span>`,
      `<span id="s-off-${index}" class="sample subset disabled">${escaped}</span>`,
    ].join('');
  }).join('');

  await page.setContent(`<!doctype html>
    <meta charset="utf-8">
    <style>
      @font-face { font-family: "Material Symbols Original"; src: url("${originalFontUrl}") format("woff2"); font-display: block; }
      @font-face { font-family: "Material Symbols Subset"; src: url("${subsetFontUrl}") format("woff2"); font-display: block; }
      body { margin: 0; }
      .sample { display: inline-block; position: absolute; white-space: nowrap; font-size: 24px; line-height: 1; font-weight: 400; font-style: normal; letter-spacing: normal; text-transform: none; font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24; }
      .original { font-family: "Material Symbols Original"; }
      .subset { font-family: "Material Symbols Subset"; }
      .enabled { font-feature-settings: "rlig" 1, "rclt" 1, "liga" 1, "clig" 1; }
      .disabled { font-feature-settings: "rlig" 0, "rclt" 0, "liga" 0, "clig" 0; }
    </style>
    <body>${samples}</body>`);

  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('24px "Material Symbols Original"'),
      document.fonts.load('24px "Material Symbols Subset"'),
      document.fonts.ready,
    ]);
  });

  return page.evaluate((names) => {
    const width = (id) => document.getElementById(id).getBoundingClientRect().width;
    return names.map((name, index) => ({
      name,
      originalEnabled: width(`o-on-${index}`),
      originalDisabled: width(`o-off-${index}`),
      subsetEnabled: width(`s-on-${index}`),
      subsetDisabled: width(`s-off-${index}`),
    }));
  }, ligatures);
}

export async function checkMaterialSymbols({ root = DEFAULT_ROOT } = {}) {
  const projectRoot = path.resolve(root);
  const webRoot = path.join(projectRoot, 'teamplus-web');
  const fullFont = path.join(projectRoot, 'tools/fonts/MaterialSymbolsOutlined.full.woff2');
  const subsetFont = path.join(webRoot, 'public/fonts/MaterialSymbolsOutlined.woff2');
  const collection = collectMaterialSymbols({ root: projectRoot });
  const webRequire = createRequire(path.join(webRoot, 'package.json'));
  const { chromium } = webRequire('playwright');

  const browser = await chromium.launch({ headless: true });
  let measurements;
  try {
    const page = await browser.newPage();
    measurements = await compareRenderedLigatures(
      page,
      collection.ligatures,
      fontDataUrl(fullFont),
      fontDataUrl(subsetFont),
    );
  } finally {
    await browser.close();
  }

  const valid = measurements.filter((item) =>
    Math.abs(item.originalEnabled - 24) <= 1
      && Math.abs(item.originalEnabled - item.originalDisabled) > 0.5,
  );
  const validNames = new Set(valid.map((item) => item.name));
  const invalidCandidates = measurements.filter((item) => !validNames.has(item.name));
  const runtimeLigatureNames = new Set(collection.runtimeLigatures);
  const invalidRuntimeLigatures = invalidCandidates
    .filter((item) => runtimeLigatureNames.has(item.name))
    .map((item) => item.name);
  const missing = valid.filter((item) =>
    Math.abs(item.subsetEnabled - item.subsetDisabled) <= 0.5
      || Math.abs(item.subsetEnabled - item.originalEnabled) > 0.25,
  );

  return {
    candidateCount: collection.ligatures.length,
    validCount: valid.length,
    invalidCandidates: invalidCandidates.map((item) => item.name),
    missing: missing.map((item) => ({
      name: item.name,
      originalWidth: item.originalEnabled,
      subsetWidth: item.subsetEnabled,
      sources: collection.sources[item.name] ?? [],
    })),
    roundedUsages: collection.roundedUsages,
    invalidRuntimeIcons: collection.invalidRuntimeIcons,
    invalidRuntimeLigatures,
    unlistedMenuIcons: collection.unlistedMenuIcons,
    passed: missing.length === 0
      && collection.roundedUsages.length === 0
      && collection.invalidRuntimeIcons.length === 0
      && invalidRuntimeLigatures.length === 0
      && collection.unlistedMenuIcons.length === 0,
  };
}

function printHelp() {
  console.log('Usage: node scripts/check-material-symbols.mjs [--json] [--root <project-root>]');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = await checkMaterialSymbols({ root: options.root });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      console.log(`Candidates: ${result.candidateCount}; valid in full font: ${result.validCount}.`);
      if (result.invalidCandidates.length > 0) {
        console.log(`Ignored ${result.invalidCandidates.length} candidates absent from the full font.`);
      }
      if (result.roundedUsages.length > 0) {
        console.error(`\nFound ${result.roundedUsages.length} material-symbols-rounded usages:`);
        for (const usage of result.roundedUsages) {
          console.error(`  ${usage.file}:${usage.line}`);
        }
      }
      if (result.unlistedMenuIcons.length > 0) {
        console.error(`\nApp-menu icons absent from the runtime allowlist: ${result.unlistedMenuIcons.join(', ')}`);
      }
      if (result.invalidRuntimeIcons.length > 0) {
        console.error(`\nApp-menu icons without a Material mapping: ${result.invalidRuntimeIcons.join(', ')}`);
      }
      if (result.invalidRuntimeLigatures.length > 0) {
        console.error(`\nApp-menu icons absent from the full font: ${result.invalidRuntimeLigatures.join(', ')}`);
      }
      if (result.missing.length > 0) {
        console.error(`\nMissing from subset: ${result.missing.length}.`);
        for (const item of result.missing) {
          const firstSource = item.sources[0];
          console.error(`  ${item.name}${firstSource ? ` (${firstSource.file}:${firstSource.line})` : ''}`);
        }
      }
      if (result.passed) {
        console.log(`All ${result.validCount} valid Material Symbols render as a single glyph.`);
      }
    }
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  }
}
