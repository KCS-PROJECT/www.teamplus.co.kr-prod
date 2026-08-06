#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const LIGATURE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

function listSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function propertyNameText(ts, name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function jsxTagName(ts, tagName) {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return tagName.name.text;
  return tagName.getText();
}

function isIconValueName(name) {
  if (!/(?:icon|material|symbol)/i.test(name)) return false;
  if (/^(?:is|has|show|hide|enable|disable)[A-Z_]/.test(name)) return false;
  return !/(?:color|colour|class|style|size|background|position|spacing|margin|padding|aria|component)$/i.test(name);
}

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

function collectDeclaredMenuIcons(projectRoot) {
  const sources = [
    {
      file: path.join(projectRoot, 'shared/constants/app-menu-spec.ts'),
      pattern: /\bicon\s*:\s*["']([a-z][a-z0-9_-]+)["']/g,
    },
    {
      file: path.join(projectRoot, 'teamplus-admin/src/app/dashboard/app/menus/page.tsx'),
      pattern: /\bvalue\s*:\s*["']([a-z][a-z0-9_-]+)["']/g,
    },
  ];
  const icons = new Set();
  for (const source of sources) {
    if (!fs.existsSync(source.file)) continue;
    const content = fs.readFileSync(source.file, 'utf8');
    for (const match of content.matchAll(source.pattern)) icons.add(match[1]);
  }
  return [...icons].sort();
}

export function collectMaterialSymbols({ root = DEFAULT_ROOT } = {}) {
  const projectRoot = path.resolve(root);
  const webRoot = path.join(projectRoot, 'teamplus-web');
  const sourceRoot = path.join(webRoot, 'src');
  const webRequire = createRequire(path.join(webRoot, 'package.json'));
  const ts = webRequire('typescript');

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Web source directory not found: ${sourceRoot}`);
  }

  const parsedFiles = listSourceFiles(sourceRoot).map((filePath) => {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    return { filePath, sourceFile };
  });

  const materialAliases = new Map();
  const symbolsByFile = new Map();

  for (const { filePath, sourceFile } of parsedFiles) {
    const initializers = new Map();
    const functions = new Map();
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        initializers.set(node.name.text, node.initializer);
        if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
          functions.set(node.name.text, node.initializer);
        }
        if (/_TO_MATERIAL$/i.test(node.name.text) && ts.isObjectLiteralExpression(node.initializer)) {
          for (const property of node.initializer.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = propertyNameText(ts, property.name);
            if (key && ts.isStringLiteralLike(property.initializer)) {
              materialAliases.set(key.toLowerCase(), property.initializer.text);
            }
          }
        }
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        functions.set(node.name.text, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    symbolsByFile.set(filePath, { initializers, functions });
  }

  const sourceMap = new Map();
  const roundedUsages = [];

  const addCandidate = (rawName, sourceFile, node, kind, normalize = false) => {
    const trimmed = rawName.trim();
    const name = normalize ? (materialAliases.get(trimmed.toLowerCase()) ?? trimmed) : trimmed;
    if (!LIGATURE_PATTERN.test(name)) return;
    if (!sourceMap.has(name)) sourceMap.set(name, []);
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    sourceMap.get(name).push({
      file: path.relative(projectRoot, sourceFile.fileName).replaceAll('\\', '/'),
      line: position.line + 1,
      kind,
    });
  };

  for (const { filePath, sourceFile } of parsedFiles) {
    const { initializers, functions } = symbolsByFile.get(filePath);

    const extractStrings = (expression, seen = new Set()) => {
      if (!expression) return [];
      if (ts.isStringLiteralLike(expression)) return [expression.text];
      if (ts.isJsxExpression(expression)) return extractStrings(expression.expression, seen);
      if (ts.isParenthesizedExpression(expression)) return extractStrings(expression.expression, seen);
      if (ts.isConditionalExpression(expression)) {
        return [...extractStrings(expression.whenTrue, seen), ...extractStrings(expression.whenFalse, seen)];
      }
      if (ts.isBinaryExpression(expression)) {
        return [...extractStrings(expression.left, seen), ...extractStrings(expression.right, seen)];
      }
      if (ts.isArrayLiteralExpression(expression)) {
        return expression.elements.flatMap((element) => extractStrings(element, seen));
      }
      if (ts.isObjectLiteralExpression(expression)) {
        return expression.properties.flatMap((property) => {
          if (ts.isPropertyAssignment(property)) return extractStrings(property.initializer, seen);
          if (ts.isShorthandPropertyAssignment(property)) return extractStrings(property.name, seen);
          return [];
        });
      }
      if (ts.isCallExpression(expression) || ts.isNewExpression(expression)) {
        const values = (expression.arguments ?? []).flatMap((argument) => extractStrings(argument, seen));
        const calleeName = ts.isIdentifier(expression.expression)
          ? expression.expression.text
          : ts.isPropertyAccessExpression(expression.expression)
            ? expression.expression.name.text
            : undefined;
        if (calleeName && functions.has(calleeName) && !seen.has(`fn:${calleeName}`)) {
          values.push(...extractStrings(functions.get(calleeName), new Set(seen).add(`fn:${calleeName}`)));
        }
        return values;
      }
      if (ts.isTemplateExpression(expression)) {
        return expression.templateSpans.flatMap((span) => extractStrings(span.expression, seen));
      }
      if (ts.isIdentifier(expression) && initializers.has(expression.text) && !seen.has(expression.text)) {
        return extractStrings(initializers.get(expression.text), new Set(seen).add(expression.text));
      }
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression) || ts.isFunctionDeclaration(expression)) {
        if (ts.isBlock(expression.body)) {
          const values = [];
          const collectReturns = (node) => {
            if (ts.isReturnStatement(node)) {
              values.push(...extractStrings(node.expression, seen));
              return;
            }
            ts.forEachChild(node, collectReturns);
          };
          collectReturns(expression.body);
          return values;
        }
        return extractStrings(expression.body, seen);
      }
      return [];
    };

    const addExpression = (expression, node, kind, normalize = false) => {
      for (const value of extractStrings(expression)) {
        addCandidate(value, sourceFile, node, kind, normalize);
      }
    };

    const inspectMaterialSpan = (opening, children) => {
      const classAttribute = opening.attributes.properties.find(
        (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'className',
      );
      if (!classAttribute?.initializer) return;
      const classValues = extractStrings(classAttribute.initializer);
      if (!classValues.some((value) => value.includes('material-symbols-outlined'))) return;

      for (const child of children) {
        if (ts.isJsxText(child)) {
          addCandidate(child.text, sourceFile, child, 'material-symbols-span');
        } else if (ts.isJsxExpression(child)) {
          addExpression(child.expression, child, 'material-symbols-span');
        }
      }
    };

    const visit = (node) => {
      if (ts.isStringLiteralLike(node) && node.text.includes('material-symbols-rounded')) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        roundedUsages.push({
          file: path.relative(projectRoot, sourceFile.fileName).replaceAll('\\', '/'),
          line: position.line + 1,
        });
      }

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isIconValueName(node.name.text)) {
          addExpression(node.initializer, node, 'icon-mapping');
        }
      }

      if (ts.isFunctionDeclaration(node) && node.name && isIconValueName(node.name.text)) {
        addExpression(node, node, 'icon-function');
      }

      if (ts.isPropertyAssignment(node)) {
        const name = propertyNameText(ts, node.name);
        if (name && isIconValueName(name)) {
          addExpression(node.initializer, node, 'icon-property');
        }
      }

      if (ts.isBindingElement(node)) {
        const name = propertyNameText(ts, node.propertyName ?? node.name);
        if (name && isIconValueName(name) && node.initializer) {
          addExpression(node.initializer, node, 'icon-default');
        }
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = jsxTagName(ts, node.tagName);
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
          const attributeName = attribute.name.text;
          if (tagName === 'Icon' && attributeName === 'name') {
            addExpression(attribute.initializer, attribute, 'Icon.name', true);
          } else if (isIconValueName(attributeName)) {
            addExpression(attribute.initializer, attribute, 'icon-prop');
          }
        }
      }

      if (ts.isJsxElement(node)) {
        inspectMaterialSpan(node.openingElement, node.children);
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const runtimeIconFile = path.join(
    projectRoot,
    'teamplus-backend/src/menus/constants/app-menu-icons.json',
  );
  if (!fs.existsSync(runtimeIconFile)) {
    throw new Error(`Runtime app-menu icon allowlist not found: ${runtimeIconFile}`);
  }
  const runtimeIcons = JSON.parse(fs.readFileSync(runtimeIconFile, 'utf8'));
  if (!Array.isArray(runtimeIcons) || runtimeIcons.some((name) => typeof name !== 'string')) {
    throw new Error(`Runtime app-menu icon allowlist must be a string array: ${runtimeIconFile}`);
  }
  const invalidRuntimeIcons = [];
  const runtimeLigatures = [];
  for (const [index, rawName] of runtimeIcons.entries()) {
    const name = materialAliases.get(rawName.toLowerCase()) ?? rawName;
    if (!LIGATURE_PATTERN.test(name)) {
      invalidRuntimeIcons.push(rawName);
      continue;
    }
    runtimeLigatures.push(name);
    if (!sourceMap.has(name)) sourceMap.set(name, []);
    sourceMap.get(name).push({
      file: path.relative(projectRoot, runtimeIconFile).replaceAll('\\', '/'),
      line: index + 2,
      kind: 'runtime-app-menu-allowlist',
    });
  }

  const runtimeIconSet = new Set(runtimeIcons);
  const unlistedMenuIcons = collectDeclaredMenuIcons(projectRoot).filter(
    (name) => !runtimeIconSet.has(name),
  );

  const ligatures = [...sourceMap.keys()].sort();
  const sources = Object.fromEntries(
    ligatures.map((name) => [
      name,
      sourceMap.get(name).sort((left, right) =>
        left.file.localeCompare(right.file) || left.line - right.line || left.kind.localeCompare(right.kind),
      ),
    ]),
  );

  return {
    schemaVersion: 1,
    projectRoot,
    sourceRoot,
    ligatures,
    sources,
    runtimeIcons: [...new Set(runtimeIcons)].sort(),
    runtimeLigatures: [...new Set(runtimeLigatures)].sort(),
    invalidRuntimeIcons: [...new Set(invalidRuntimeIcons)].sort(),
    unlistedMenuIcons,
    roundedUsages: roundedUsages.sort((left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
    ),
  };
}

function printHelp() {
  console.log('Usage: node scripts/collect-material-symbols.mjs [--json] [--root <project-root>]');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = collectMaterialSymbols({ root: options.root });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      console.log(`Collected ${result.ligatures.length} Material Symbols candidates.`);
      console.log(result.ligatures.join('\n'));
      if (result.roundedUsages.length > 0) {
        console.error(`Found ${result.roundedUsages.length} material-symbols-rounded usages.`);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
