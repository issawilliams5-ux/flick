#!/usr/bin/env node
// On-demand installer for MarkItDown (https://github.com/microsoft/markitdown),
// Microsoft's document-to-Markdown converter (MIT). Not vendored into Flick and
// not part of any render: it is installed into a work directory OUTSIDE this
// repository, the same way the UI-codegen tools are.
//
//   node scripts/install-markitdown.mjs [--home <dir>]
//
// Use it when a source arrives as a document rather than a video or transcript
// — a pitch deck, a whitepaper PDF, a spreadsheet of figures — and a scene needs
// the words inside it. It converts; it does not animate.
//
// Idempotent: an existing venv is reused and the install re-runs in place. A
// missing prerequisite is reported and the install is skipped, never installed
// system-wide on the user's behalf.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {resolve, join} from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const home = resolve(valueAfter('--home') || process.env.UI_TOOLS_HOME || resolve(homedir(), 'ui-tools'));
const dest = join(home, 'markitdown');
const venv = join(dest, '.venv');
const python = join(venv, 'bin', 'python');

const run = (cmd, cmdArgs, opts = {}) =>
  spawnSync(cmd, cmdArgs, {stdio: 'inherit', ...opts});

const have = (cmd) => spawnSync(cmd, ['--version'], {stdio: 'ignore'}).status === 0;

if (!have('uv')) {
  console.error('SKIP: missing prerequisite: uv (https://astral.sh/uv/install.sh)');
  process.exit(0);
}

mkdirSync(dest, {recursive: true});

// MarkItDown needs Python >=3.10. No pinned version: uv picks the interpreter on
// PATH, and the check below fails loudly rather than pinning one this machine
// may not have.
if (!existsSync(venv) && run('uv', ['venv'], {cwd: dest}).status !== 0) {
  console.error('FAIL: could not create venv');
  process.exit(1);
}

const versionOk = spawnSync(python, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)']);
if (versionOk.status !== 0) {
  console.error('FAIL: venv Python is older than 3.10');
  process.exit(1);
}

// [all] pulls ~48 packages (onnxruntime, numpy, pandas). Its own venv keeps that
// out of the UI-codegen tools' environments.
if (run('uv', ['pip', 'install', 'markitdown[all]'], {cwd: dest, env: {...process.env, VIRTUAL_ENV: venv}}).status !== 0) {
  console.error('FAIL: markitdown install failed');
  process.exit(1);
}

// Audio transcription shells out to ffmpeg, which pip cannot supply. Flick
// already wants ffmpeg for video work, so this is usually already satisfied.
if (!have('ffmpeg')) {
  console.error('NOTE: ffmpeg not found - wav/mp3 transcription unavailable. Every other format works.');
}

// Round-trip a real file: proves the converter registry loaded, not just that
// the import resolved.
const probeDir = mkdtempSync(join(tmpdir(), 'markitdown-probe-'));
const probe = join(probeDir, 'probe.html');
writeFileSync(probe, '<h1>ok</h1><table><tr><th>a</th></tr><tr><td>1</td></tr></table>');
const check = spawnSync(python, ['-c', `
import warnings; warnings.filterwarnings('ignore')
from markitdown import MarkItDown
out = MarkItDown(enable_plugins=False).convert(${JSON.stringify(probe)}).markdown
assert '# ok' in out and '| a |' in out, out
`]);
if (check.status !== 0) {
  console.error('FAIL: conversion probe did not round-trip');
  process.exit(1);
}

console.log(`OK  markitdown -> ${join(venv, 'bin', 'markitdown')} (no port, no key)`);
