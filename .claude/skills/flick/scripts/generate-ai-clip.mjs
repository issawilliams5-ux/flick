#!/usr/bin/env node
// ai-clip engine — MuAPI provider (https://muapi.ai).
//
// Unlike the HIGGSFIELD provider (whose generation runs through MCP tools that
// only Claude can call), MuAPI is a plain REST API, so this whole path is
// scriptable: submit -> poll -> download, in one command, like every other
// Flick render script.
//
// Usage:
//   node generate-ai-clip.mjs --project <flick-output> --name <approved-scene-name> \
//     --model <muapi-model> --prompt "..." [--duration 5] [--aspect-ratio 9:16] \
//     [--resolution 720p] [--no-audio] [--timeout 600] [--dry-run]
//
// Requires MUAPI_KEY in the environment. Never hardcode it, and never write it
// into the project — it is read from the environment only.
import {downloadClip, writeSourceRecord, assertSceneName, parseArgs} from './ai-clip-lib.mjs';
import {resolve} from 'node:path';

const MUAPI_BASE = 'https://api.muapi.ai/api/v1';
const POLL_INTERVAL_MS = 5000;

const {valueAfter, has} = parseArgs(process.argv);
const project = resolve(valueAfter('--project') || 'flick-output');
const name = valueAfter('--name');
const model = valueAfter('--model');
const prompt = valueAfter('--prompt');
const duration = Number(valueAfter('--duration') || 5);
const aspectRatio = valueAfter('--aspect-ratio') || '9:16';
const resolution = valueAfter('--resolution');
const generateAudio = !has('--no-audio');
const timeoutMs = Number(valueAfter('--timeout') || 600) * 1000;
const dryRun = has('--dry-run');

if (!name || !model || !prompt) {
  throw new Error('Usage: node generate-ai-clip.mjs --project <flick-output> --name <approved-scene-name> --model <muapi-model> --prompt "..." [--duration 5] [--aspect-ratio 9:16] [--resolution 720p] [--no-audio]');
}
assertSceneName(name);

const apiKey = process.env.MUAPI_KEY;
if (!apiKey) {
  throw new Error('MUAPI_KEY is not set. Export it in the environment before generating an ai-clip scene (get a key at https://muapi.ai). Flick never stores this key in the project.');
}

// MuAPI's model name doubles as its endpoint path. Only the parameters a model
// actually declares should be sent, but Flick sends the common set and lets
// MuAPI reject anything unsupported rather than shipping a copy of its schema.
const payload = {prompt, aspect_ratio: aspectRatio, duration};
if (resolution) payload.resolution = resolution;
if (!generateAudio) payload.generate_audio = false;

if (dryRun) {
  console.log(JSON.stringify({endpoint: `${MUAPI_BASE}/${model}`, payload}, null, 2));
  process.exit(0);
}

const headers = {'x-api-key': apiKey, 'Content-Type': 'application/json'};

const submit = await fetch(`${MUAPI_BASE}/${model}`, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
});
const submitBody = await submit.json().catch(() => ({}));
if (!submit.ok || submitBody.error || submitBody.detail) {
  throw new Error(`MuAPI submit failed (HTTP ${submit.status}): ${submitBody.error || submitBody.detail || JSON.stringify(submitBody)}`);
}
const requestId = submitBody.request_id;
if (!requestId) throw new Error(`MuAPI did not return a request_id: ${JSON.stringify(submitBody)}`);
console.error(`Submitted to MuAPI (${model}). Request ID: ${requestId}`);

const deadline = Date.now() + timeoutMs;
let url;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  const poll = await fetch(`${MUAPI_BASE}/predictions/${requestId}/result`, {headers});
  const result = await poll.json().catch(() => ({}));
  if (result.status === 'completed') {
    url = Array.isArray(result.outputs) ? result.outputs[0] : undefined;
    if (!url) throw new Error(`MuAPI reported completed but returned no output URL: ${JSON.stringify(result)}`);
    break;
  }
  if (result.status === 'failed') {
    throw new Error(`MuAPI generation failed: ${result.output?.error || JSON.stringify(result)}`);
  }
  console.error(`  status: ${result.status || 'pending'}…`);
}
if (!url) throw new Error(`MuAPI generation did not finish within ${timeoutMs / 1000}s (request ${requestId}). Check it later with: curl -H "x-api-key: $MUAPI_KEY" ${MUAPI_BASE}/predictions/${requestId}/result`);

const output = await downloadClip({url, project, name});
await writeSourceRecord({project, name, provider: 'muapi', model, prompt, url, jobId: requestId, extra: {aspectRatio, duration}});
console.log(output);
