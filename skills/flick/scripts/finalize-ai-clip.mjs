#!/usr/bin/env node
// ai-clip engine — finalizer for provider paths whose generation cannot be
// scripted, currently HIGGSFIELD (its generate_video / jobs_wait /
// show_generation_by_ids are MCP tools only Claude can call).
//
// This script deliberately never calls a generation API and never parses a
// provider's job payload: Claude reads the finished clip's URL out of the live
// tool response and passes it in here. That keeps the one genuinely
// provider-specific detail — which field of the response holds the URL — where
// it can be read from the real payload at runtime, instead of hardcoding a
// guess into shipped code.
//
// Usage:
//   node finalize-ai-clip.mjs --project <flick-output> --name <approved-scene-name> \
//     --url <downloadable-video-url> [--provider higgsfield] [--model seedance_2_5] \
//     [--prompt "..."] [--job-id <id>]
import {downloadClip, writeSourceRecord, assertSceneName, parseArgs} from './ai-clip-lib.mjs';
import {resolve} from 'node:path';

const {valueAfter} = parseArgs(process.argv);
const project = resolve(valueAfter('--project') || 'flick-output');
const name = valueAfter('--name');
const url = valueAfter('--url');
const provider = valueAfter('--provider') || 'higgsfield';
const model = valueAfter('--model') || null;
const prompt = valueAfter('--prompt') || null;
const jobId = valueAfter('--job-id') || null;

if (!name || !url) {
  throw new Error('Usage: node finalize-ai-clip.mjs --project <flick-output> --name <approved-scene-name> --url <downloadable-video-url> [--provider higgsfield] [--model ...] [--prompt "..."] [--job-id ...]');
}
assertSceneName(name);

const output = await downloadClip({url, project, name});
await writeSourceRecord({project, name, provider, model, prompt, url, jobId});
console.log(output);
