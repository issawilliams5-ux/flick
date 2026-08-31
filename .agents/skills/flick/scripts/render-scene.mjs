#!/usr/bin/env node
import {mkdir, readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const project = resolve(valueAfter('--project') || 'flick-output');
const composition = valueAfter('--composition');
const name = valueAfter('--name');
if (!composition || !name) throw new Error('Usage: node render-scene.mjs --project <flick-output> --composition <scene-id> --name <approved-scene-name>');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error('Use the approved scene name in lowercase kebab-case.');

const spec = JSON.parse(await readFile(resolve(project, 'scene-spec.json'), 'utf8'));
const scene = spec.scenes?.find((s) => s.id === composition);
if (!scene) throw new Error(`No scene with id "${composition}" in scene-spec.json`);
const engine = scene.engine || 'remotion';

const outputDir = resolve(project, 'scenes', name);
await mkdir(outputDir, {recursive: true});
const output = resolve(outputDir, `${name}.mp4`);

if (engine === 'ai-clip') {
  throw new Error(`Scene "${name}" uses engine "ai-clip" — render-scene.mjs cannot call MCP tools. Call generate_video yourself (per step-3-compose.md's ai-clip section), then run finalize-ai-clip.mjs with the resulting URL.`);
}

let result;
if (engine === 'hyperframes') {
  if (!scene.hyperframesCompositionFile) throw new Error(`Scene "${name}" is missing hyperframesCompositionFile in scene-spec.json.`);
  result = spawnSync(
    'npx',
    ['hyperframes', 'render', '-c', scene.hyperframesCompositionFile, '-o', output],
    {cwd: resolve(project, 'hyperframes'), stdio: 'inherit', shell: process.platform === 'win32'},
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`HyperFrames render failed with exit code ${result.status}`);
} else if (engine === 'remotion') {
  result = spawnSync(
    'npx',
    ['remotion', 'render', 'src/index.tsx', composition, output],
    {cwd: resolve(project, 'remotion'), stdio: 'inherit', shell: process.platform === 'win32'},
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Remotion render failed with exit code ${result.status}`);
} else {
  throw new Error(`Unknown engine "${engine}" for scene "${name}". Expected "remotion", "hyperframes", or "ai-clip".`);
}

console.log(output);
