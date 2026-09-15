#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {access, mkdir, readFile, rename, rm, stat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureFfmpeg} from './ffmpeg.mjs';

const CHARACTER_BY_VOICE = new Map([
  ['fdffd3722cd040fcb3f95eec5a7f29f3', {file: 'Stewie.png', side: 'left'}],
  ['e34b4e061b874623a08f41e5c4fecfb9', {file: 'Peter.png', side: 'right'}],
  ['3d445d095ba04681bcba7177faedf55a', {file: 'Morty.png', side: 'left'}],
  ['d2e75a3e3fd6419893057c02a375a113', {file: 'Rick.png', side: 'right'}],
]);
const ENTRANCE_SECONDS = 0.18;

const usage = 'Usage: add-characters.mjs --video <minecraft-video.mp4> --audio-dir <audio-topic-directory> --topic <topic-slug> --output <faceless-output-directory>';

function parseArguments(argumentList) {
  const options = {};
  for (let index = 0; index < argumentList.length; index += 2) {
    const key = argumentList[index];
    const value = argumentList[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(usage);
    options[key.slice(2)] = value;
  }
  return options;
}

function run(executable, argumentList, {captureStderr = false} = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    // stdin is always 'ignore', never 'inherit'. ffmpeg reads stdin by default
    // for interactive q-to-quit control; inherited from a non-interactive
    // parent (this script's own process, itself spawned non-interactively),
    // that produced a genuine stall for the 9-input overlay filtergraph below
    // — output froze at frame 0 or 1 indefinitely, confirmed across multiple
    // clean re-runs, while the identical command run directly in a shell
    // never stalled. `-nostdin` on the invocation is redundant with this but
    // kept as defense in depth.
    const child = spawn(executable, argumentList, {stdio: captureStderr ? ['ignore', 'ignore', 'pipe'] : ['ignore', 'inherit', 'inherit']});
    let stderr = '';
    if (captureStderr) child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => rejectPromise(new Error('FFmpeg is required to create the character preview.')));
    child.on('exit', (code) => resolvePromise({code, stderr}));
  });
}

async function getDuration(executable, filePath) {
  const {stderr} = await run(executable, ['-hide_banner', '-i', filePath], {captureStderr: true});
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not read the duration of ${filePath}.`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function completed(filePath) {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

function timestamp(value) {
  return Number(value.toFixed(3));
}

const options = parseArguments(process.argv.slice(2));
if (!options.video || !options['audio-dir'] || !options.topic || !options.output) throw new Error(usage);
if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,2}$/.test(options.topic)) {
  throw new Error('Topic must be a lowercase two- or three-word slug, for example claude-video.');
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = dirname(scriptDirectory);
const characterDirectory = join(skillDirectory, 'Characters');
const sourceVideo = resolve(options.video);
const audioDirectory = resolve(options['audio-dir']);
const outputDirectory = resolve(options.output);
const videoDirectory = join(outputDirectory, 'video', options.topic);
const finalVideo = join(videoDirectory, 'final-faceless-reel.mp4');
const temporaryVideo = `${finalVideo}.part.mp4`;

await access(sourceVideo);
const manifest = JSON.parse(await readFile(join(audioDirectory, 'audio-manifest.json'), 'utf8'));
if (!Array.isArray(manifest.lines) || manifest.lines.length === 0) {
  throw new Error('audio-manifest.json does not contain any dialogue lines.');
}

const executable = await ensureFfmpeg();
const videoDuration = await getDuration(executable, sourceVideo);
let currentTime = 0;
const timeline = [];

for (const line of [...manifest.lines].sort((first, second) => first.index - second.index)) {
  const character = CHARACTER_BY_VOICE.get(line.voiceId);
  if (!character) throw new Error(`Audio line ${line.index} uses an unsupported voice ID.`);
  const audioFile = join(audioDirectory, line.file);
  await access(audioFile);
  const duration = await getDuration(executable, audioFile);
  const start = timestamp(currentTime);
  currentTime += duration;
  timeline.push({...character, index: line.index, start, end: timestamp(Math.min(currentTime, videoDuration))});
}

if (timeline.at(-1).end <= 0) throw new Error('No usable audio duration was found.');
timeline.at(-1).end = timestamp(videoDuration);

await mkdir(videoDirectory, {recursive: true});
await rm(temporaryVideo, {force: true});

// Rendered as N sequential single-overlay passes, not one filter_complex
// chaining all N speaker turns. A single filtergraph combining the base video
// with all nine -loop character-image inputs at once produced a genuine,
// non-deterministic ffmpeg/x264 deadlock: confirmed to make partial real
// progress (output growing for over a minute) and then permanently stall with
// zero further output, at a different point on different runs, independent
// of preset or lookahead settings. A plain two-input overlay (base video +
// one character image) never stalled in any test, across many runs — so each
// pass here only ever has two video inputs, matching that proven-safe shape.
// Local change, not upstream — re-apply if this script is refreshed from
// Creatorberry/faceless.
const stepPath = (index) => join(videoDirectory, `.character-step-${index}.mp4`);
let inputVideo = sourceVideo;
console.log(`Adding ${timeline.length} speaker turns to ${finalVideo}`);
try {
  for (const [offset, entry] of timeline.entries()) {
    const isLast = offset === timeline.length - 1;
    const outputPath = isLast ? temporaryVideo : stepPath(offset);
    const arrivalEnd = timestamp(entry.start + ENTRANCE_SECONDS);
    const progress = `(1-pow(1-min(1\\,max(0\\,(t-${entry.start})/${ENTRANCE_SECONDS}))\\,3))`;
    const x = entry.side === 'left'
      ? `if(lt(t\\,${arrivalEnd})\\,-w+(w+50)*${progress}\\,50)`
      : `if(lt(t\\,${arrivalEnd})\\,W-(w+50)*${progress}\\,W-w-50)`;
    const enable = `gte(t,${entry.start})*lt(t,${entry.end})`;
    const filter = `[0:v]format=rgba[v0];[1:v]scale=-1:860[c0];[v0][c0]overlay=x=${x}:y=H-h:enable='${enable}'[out]`;

    console.log(`Speaker turn ${offset + 1} of ${timeline.length} (${entry.file}, ${entry.start}s-${entry.end}s)`);
    const {code} = await run(executable, [
      '-y',
      '-nostdin',
      '-i', inputVideo,
      '-loop', '1', '-framerate', '30', '-i', join(characterDirectory, entry.file),
      '-filter_complex', filter,
      '-map', '[out]',
      '-map', '0:a:0',
      '-c:v', 'libx264',
      '-crf', '18',
      '-preset', 'veryfast',
      '-x264-params', 'rc-lookahead=0:mbtree=0',
      '-c:a', 'copy',
      '-shortest',
      ...(isLast ? ['-movflags', '+faststart'] : []),
      outputPath,
    ]);
    if (code !== 0 || !(await completed(outputPath))) {
      throw new Error(`FFmpeg did not produce speaker turn ${offset + 1} of ${timeline.length}.`);
    }
    if (inputVideo !== sourceVideo) await rm(inputVideo, {force: true});
    inputVideo = outputPath;
  }
  await rename(temporaryVideo, finalVideo);
} finally {
  await rm(temporaryVideo, {force: true});
  for (const entry of timeline) await rm(stepPath(timeline.indexOf(entry)), {force: true});
}

console.log(`Characters added: ${finalVideo}`);
