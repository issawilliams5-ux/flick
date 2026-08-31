#!/usr/bin/env node
import {cp, mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const project = resolve(valueAfter('--project') || 'flick-output');
const engine = valueAfter('--engine') || 'remotion';
if (!['remotion', 'hyperframes'].includes(engine)) {
  throw new Error('Usage: node setup-workspace.mjs --project <flick-output> --engine <remotion|hyperframes>');
}
const template = resolve(here, `../assets/starter-${engine}`);
const engineDir = resolve(project, engine);

// Scope the "don't overwrite" guard to this engine's own subdirectory, not
// the whole project — a mixed-engine project legitimately calls this once
// per engine, and by the second call the project directory already has
// content from the first.
try {
  const contents = await readdir(engineDir);
  if (contents.length) throw new Error(`Refusing to overwrite non-empty directory: ${engineDir}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(project, {recursive: true});
await mkdir(resolve(project, 'brand-assets'), {recursive: true});
await mkdir(resolve(project, 'scenes'), {recursive: true});
await cp(template, engineDir, {recursive: true});

const configPath = resolve(project, 'flick.config.json');
let config = {version: 2, transcript: 'transcript.json', plan: 'flick-plan.md', brief: 'composition-brief.md', sceneSpec: 'scene-spec.json', engines: []};
try {
  const existing = JSON.parse(await readFile(configPath, 'utf8'));
  config = {...config, ...existing, engines: existing.engines || []};
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!config.engines.includes(engine)) config.engines.push(engine);
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

console.log(`Flick ${engine} workspace created: ${engineDir}`);
console.log(`Add brand files to: ${resolve(project, 'brand-assets')}`);
