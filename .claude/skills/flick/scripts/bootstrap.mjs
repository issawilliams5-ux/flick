#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findPython, pythonInstallGuidance} from './python.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const skillRoot = resolve(here, '..');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const project = resolve(valueAfter('--project') || 'flick-output');
const packageManager = valueAfter('--package-manager') || process.env.FLICK_PACKAGE_MANAGER || (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const run = (command, commandArgs, options = {}) => {
  const useShell = process.platform === 'win32' && /\.cmd$/i.test(command);
  const result = spawnSync(command, commandArgs, {stdio: 'inherit', shell: useShell, ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
};

if (Number(process.versions.node.split('.')[0]) < 20) {
  const help = process.platform === 'win32' ? 'Install Node.js 20+ with winget install OpenJS.NodeJS.LTS.' : 'Install Node.js 20+ with your platform package manager.';
  throw new Error(`Flick needs Node.js 20+. ${help}`);
}

const python = findPython();
if (!python) {
  throw new Error(`Flick needs Python 3.9+. ${pythonInstallGuidance()}`);
}

// Call 1 (before Step 1's engine question is answered): no --engines flag.
// Engine-agnostic preflight only — everything every engine needs regardless
// of which one gets picked later.
if (!args.includes('--engines')) {
  run(packageManager, ['install'], {cwd: skillRoot});
  run(python.command, [...python.prefix, '-m', 'pip', 'install', '--user', '--upgrade', 'pip']);
  run(python.command, [...python.prefix, '-m', 'pip', 'install', '--user', 'openai-whisper', 'yt-dlp']);
  console.log(`Flick preflight ready: ${project}`);
  console.log('Installed: ffmpeg-static (for posters), openai-whisper, yt-dlp, and bundled sound effects.');
  console.log('Run again with --engines <comma-separated-list> once scene-spec.json is known to scaffold engine-specific dependencies.');
  process.exit(0);
}

// Call 2 (top of Step 3, once scene-spec.json's engines are known): scaffold
// and install only the engine(s) actually used by approved scenes. Safe to
// call more than once — each engine's scaffold step is skipped if already
// present.
const engines = (valueAfter('--engines') || '').split(',').map((e) => e.trim()).filter(Boolean);
if (engines.length === 0) {
  throw new Error('Usage: node bootstrap.mjs --project <flick-output> --engines <comma-separated-list, e.g. remotion,hyperframes>');
}

if (engines.includes('remotion')) {
  try {
    await access(resolve(project, 'remotion', 'package.json'));
  } catch {
    run(process.execPath, [resolve(here, 'setup-workspace.mjs'), '--project', project, '--engine', 'remotion']);
  }
  const remotion = resolve(project, 'remotion');
  if (/pnpm(?:\.cmd)?$/i.test(packageManager)) {
    run(packageManager, ['install', '--ignore-scripts'], {cwd: remotion});
    run(packageManager, ['approve-builds', 'esbuild', 'ffmpeg-static'], {cwd: remotion});
    run(packageManager, ['rebuild', 'esbuild', 'ffmpeg-static'], {cwd: remotion});
  } else {
    run(packageManager, ['install'], {cwd: remotion});
  }
}

if (engines.includes('hyperframes')) {
  try {
    await access(resolve(project, 'hyperframes', 'index.html'));
  } catch {
    run(process.execPath, [resolve(here, 'setup-workspace.mjs'), '--project', project, '--engine', 'hyperframes']);
  }
  // No install step: `npx hyperframes render/preview` fetches the CLI on
  // demand, same as this skill already relies on `npx remotion` doing.
}

const unknown = engines.filter((e) => !['remotion', 'hyperframes', 'ai-clip'].includes(e));
if (unknown.length > 0) {
  throw new Error(`Unknown engine(s) in --engines: ${unknown.join(', ')}. Expected remotion, hyperframes, and/or ai-clip.`);
}

console.log(`Flick engine scaffold ready: ${project}`);
console.log(`Engines: ${engines.join(', ')}`);
