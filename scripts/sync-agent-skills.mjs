#!/usr/bin/env node
import {cp, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['flick', 'ui-from-screenshot'];

// node_modules (e.g. skills/flick/node_modules from its own package.json)
// is excluded: copying an installed tree on every sync is wasteful, and any
// mirror that needs it installs its own fresh via bootstrap.mjs.
const filter = (source) => !source.split(/[/\\]/).includes('node_modules');

for (const agentPath of ['.agents/skills', '.claude/skills']) {
  for (const name of names) {
    const target = resolve(root, agentPath, name);
    await rm(target, {recursive: true, force: true});
    await cp(resolve(root, 'skills', name), target, {recursive: true, filter});
  }
}

console.log('Synced canonical skills to Codex and Claude Code discovery paths.');
