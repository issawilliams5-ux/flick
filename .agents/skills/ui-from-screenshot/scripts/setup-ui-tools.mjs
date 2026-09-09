#!/usr/bin/env node
// On-demand installer for the two screenshot/prompt -> UI code tools this skill
// documents. Neither tool is vendored into Flick: both are cloned into a work
// directory OUTSIDE this repository and installed there.
//
//   node setup-ui-tools.mjs [--tool screenshot-to-code|openui|all] [--home <dir>]
//
// Idempotent: an existing clone is left alone, and each dependency install is
// re-runnable. Missing prerequisites are reported and that tool is skipped —
// they are never installed system-wide on the user's behalf.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const TOOLS = {
  'screenshot-to-code': {
    dir: 'screenshot-to-code',
    url: 'https://github.com/abi/screenshot-to-code.git',
    license: 'MIT',
    needs: ['git', 'poetry', 'node'],
  },
  openui: {
    dir: 'openui',
    url: 'https://github.com/wandb/openui.git',
    license: 'Apache-2.0',
    needs: ['git', 'uv'],
  },
};

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const requested = valueAfter('--tool') || 'all';
if (requested !== 'all' && !Object.hasOwn(TOOLS, requested)) {
  throw new Error(`Unknown --tool "${requested}". Use one of: ${Object.keys(TOOLS).join(', ')}, all.`);
}
const selected = requested === 'all' ? Object.keys(TOOLS) : [requested];

const home = resolve(valueAfter('--home') || process.env.UI_TOOLS_HOME || resolve(homedir(), 'ui-tools'));
const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
if (home === repoRoot || home.startsWith(`${repoRoot}/`)) {
  throw new Error(`Refusing to install into the Flick repository (${home}). These tools are large and must not be vendored; pick a --home outside ${repoRoot}.`);
}

const has = (command) => spawnSync(command, ['--version'], {stdio: 'ignore'}).status === 0;
const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {stdio: 'inherit', ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed with exit code ${result.status}`);
};

const skipped = [];
for (const name of selected) {
  const tool = TOOLS[name];
  const missing = tool.needs.filter((command) => !has(command));
  if (missing.length > 0) {
    skipped.push(`${name}: missing ${missing.join(', ')}`);
    console.warn(`Skipping ${name} — missing prerequisite(s): ${missing.join(', ')}. Install them and re-run.`);
    continue;
  }

  const target = resolve(home, tool.dir);
  if (existsSync(resolve(target, '.git'))) {
    console.log(`${name}: clone already present at ${target} (leaving it as-is).`);
  } else {
    run('git', ['clone', '--depth', '1', tool.url, target]);
  }

  if (name === 'screenshot-to-code') {
    run('poetry', ['install', '--no-root'], {cwd: resolve(target, 'backend')});
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], {cwd: resolve(target, 'frontend'), shell: process.platform === 'win32'});
  } else {
    run('uv', ['sync', '--frozen', '--extra', 'litellm'], {cwd: resolve(target, 'backend')});
  }
  console.log(`${name} installed (${tool.license}) at ${target}`);
}

console.log('');
console.log(`Work directory: ${home}`);
console.log('Run instructions and required API keys: see this skill\'s SKILL.md.');
console.log('No API key is read, written, or copied by this installer.');
if (skipped.length > 0) {
  console.log(`Skipped: ${skipped.join('; ')}`);
}
