#!/usr/bin/env node
import {appendFile, cp, mkdir, stat} from 'node:fs/promises';
import {basename, resolve} from 'node:path';

const REUSABLE_EXT = /\.(?:ts|tsx|html)$/i;

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const library = valueAfter('--library');
const name = valueAfter('--name');
const component = valueAfter('--component');
const componentExport = valueAfter('--export');
const pattern = valueAfter('--pattern');
const useFor = valueAfter('--use-for');
const avoidFor = valueAfter('--avoid-for');
const includes = args.flatMap((arg, index) => arg === '--include' ? [args[index + 1]] : []).filter(Boolean);

if (!library || !name || !component || !pattern?.trim() || !useFor?.trim() || !avoidFor?.trim()) {
  throw new Error('Usage: node save-animation.mjs --library <saved-animations> --name <kebab-name> --component <file.tsx-or-.html> [--export <component-export>] [--include <local-helper-file>] --pattern <visual-pattern> --use-for <strong-fit-use-cases> --avoid-for <mismatched-use-cases>');
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
  throw new Error('Use a lowercase kebab-case animation name.');
}
if (!REUSABLE_EXT.test(component)) {
  throw new Error(`Only .ts, .tsx, or .html components can be saved: ${component}`);
}
const isReactComponent = /\.tsx?$/i.test(component);
if (isReactComponent && !componentExport?.trim()) {
  throw new Error('--export is required when --component is .ts/.tsx (the React export name). Omit --export for a HyperFrames .html save.');
}
if (!(await stat(component)).isFile()) {
  throw new Error(`Component not found: ${component}`);
}
for (const included of includes) {
  if (!REUSABLE_EXT.test(included)) {
    throw new Error(`Only local .ts, .tsx, or .html helpers can be saved: ${included}`);
  }
  if (!(await stat(included)).isFile()) {
    throw new Error(`Included helper not found: ${included}`);
  }
}

const target = resolve(library, name);
await mkdir(target, {recursive: true});
await cp(component, resolve(target, basename(component)));
for (const included of includes) {
  await cp(included, resolve(target, basename(included)));
}

const entry = [
  '',
  `## ${name}`,
  `**Kind:** ${isReactComponent ? 'Remotion component' : 'HyperFrames composition'}`,
  `**File:** \`${name}/${basename(component)}\``,
  ...(isReactComponent ? [`**Export:** \`${componentExport.trim()}\``] : []),
  `**Pattern:** ${pattern.trim()}`,
  `**Use for:** ${useFor.trim()}`,
  `**Avoid for:** ${avoidFor.trim()}`,
  '',
].join('\n');
await appendFile(resolve(library, 'README.md'), entry);
console.log(`Saved editable animation ${isReactComponent ? 'component' : 'composition'}: ${target}`);
