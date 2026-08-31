#!/usr/bin/env node
import {access, cp} from 'node:fs/promises';
import {resolve} from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const project = resolve(valueAfter('--project') || 'flick-output');

// Only Remotion's React components read scene-spec.json via a bundler import
// (resolveJsonModule) — HyperFrames scenes are authored as plain HTML with
// data-* attributes and ai-clip scenes have no local project at all, so
// there is nothing to sync into for either. Skip quietly when there's no
// remotion/ subproject to sync into, rather than failing.
const remotionProject = resolve(project, 'remotion');
try {
  await access(remotionProject);
} catch {
  console.log('No remotion/ project in this run — nothing to sync.');
  process.exit(0);
}

await cp(resolve(project, 'scene-spec.json'), resolve(remotionProject, 'src', 'data', 'scene-spec.json'));
console.log('Synced approved scene spec into the Remotion project.');
