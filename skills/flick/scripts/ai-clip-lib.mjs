// Shared helpers for the ai-clip engine, used by both providers:
//   - generate-ai-clip.mjs (MuAPI — fully scriptable REST: submit, poll, download)
//   - finalize-ai-clip.mjs (HIGGSFIELD — Claude drives the MCP calls, this only downloads)
// Both land the finished clip at the same path every other engine writes to:
//   <project>/scenes/<name>/<name>.mp4
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSceneName(name) {
  if (!name || !KEBAB.test(name)) {
    throw new Error('Use the approved scene name in lowercase kebab-case.');
  }
}

export function sceneDir(project, name) {
  return resolve(project, 'scenes', name);
}

/**
 * Download a finished clip to the standard per-scene output path.
 * Returns the absolute output path.
 */
export async function downloadClip({url, project, name}) {
  assertSceneName(name);
  if (!/^https?:\/\//i.test(url || '')) {
    throw new Error(`Expected an http(s) URL for the generated clip, got: ${url}`);
  }
  const dir = sceneDir(project, name);
  await mkdir(dir, {recursive: true});
  const output = resolve(dir, `${name}.mp4`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Downloading the generated clip failed: HTTP ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error('The generated clip downloaded as an empty file.');
  await writeFile(output, buffer);
  return output;
}

/**
 * Record how a generated scene was produced. ai-clip scenes are regenerated,
 * never hand-edited, so a later revision needs the provider/model/prompt.
 */
export async function writeSourceRecord({project, name, provider, model, prompt, url, jobId, extra = {}}) {
  const record = {
    provider,
    model,
    prompt,
    sourceUrl: url,
    jobId: jobId || null,
    generatedAt: new Date().toISOString(),
    ...extra,
    note: 'This scene is generated, not authored. To revise it, regenerate with an adjusted prompt (re-running the cost gate) — there is no component to edit.',
  };
  const path = resolve(sceneDir(project, name), 'ai-clip-source.json');
  await writeFile(path, JSON.stringify(record, null, 2) + '\n');
  return path;
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const valueAfter = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  return {args, valueAfter, has: (flag) => args.includes(flag)};
}
