#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const project = resolve(valueAfter('--project') || 'flick-output');
const name = valueAfter('--name');
const timestamp = Number(valueAfter('--timestamp'));

if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
  throw new Error('Usage: node create-poster.mjs --project <flick-output> --name <approved-scene-name> --timestamp <settled-seconds>');
}
if (!Number.isFinite(timestamp) || timestamp < 0) {
  throw new Error('Use a non-negative settled timestamp in seconds.');
}

const sceneDir = resolve(project, 'scenes', name);
const video = resolve(sceneDir, `${name}.mp4`);
const poster = resolve(sceneDir, 'poster.jpg');
await access(video);

// Resolve ffmpeg-static from the flick skill's own package.json, not the
// project's remotion/ subproject — a HyperFrames-only or ai-clip-only
// project has no remotion/node_modules to piggyback on, and posters are
// needed regardless of engine.
const skillRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const skillRequire = createRequire(resolve(skillRoot, 'package.json'));
const ffmpeg = skillRequire('ffmpeg-static');
const result = spawnSync(ffmpeg, ['-y', '-i', video, '-ss', String(timestamp), '-frames:v', '1', '-update', '1', '-q:v', '2', poster], {stdio: 'inherit'});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Poster extraction failed with exit code ${result.status}`);
console.log(poster);
