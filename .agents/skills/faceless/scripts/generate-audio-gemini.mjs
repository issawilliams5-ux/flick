#!/usr/bin/env node
// Alternate audio backend for the faceless skill: Google Gemini TTS instead of
// Fish Audio. Added locally, not upstream — Fish Audio remains the vendored
// default (generate-audio.mjs); use this only when Fish's API host is
// unreachable (network policy) or the user prefers Gemini's billing.
//
// Voice identity note: Gemini TTS has no Rick/Morty/Peter/Stewie voice clones.
// This maps each of the four fixed voiceIds from dialogue-json-schema.md to a
// distinct prebuilt Gemini voice so the pair still alternates two different
// voices — they will not sound like the show.
//
// Output contract matches generate-audio.mjs exactly, so add-characters.mjs
// and add-captions.mjs work unmodified: <output>/audio/<topic>/NNN.mp3,
// full-dialogue.mp3, and audio-manifest.json with the ORIGINAL Fish voiceId
// values preserved (add-captions.mjs checks dialogue.json's voiceId against
// the manifest's, so it must round-trip unchanged even though Gemini never
// sees it as anything but a lookup key here).
import {spawn} from 'node:child_process';
import {access, mkdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {ensureFfmpeg} from './ffmpeg.mjs';

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;
const CONFIG_PATH = join(process.env.FACELESS_CONFIG_DIR || join(homedir(), '.faceless'), 'gemini-config.json');

const PETER_VOICE_ID = 'e34b4e061b874623a08f41e5c4fecfb9';
const STEWIE_VOICE_ID = 'fdffd3722cd040fcb3f95eec5a7f29f3';
const RICK_VOICE_ID = 'd2e75a3e3fd6419893057c02a375a113';
const MORTY_VOICE_ID = '3d445d095ba04681bcba7177faedf55a';
const ALLOWED_VOICE_IDS = new Set([PETER_VOICE_ID, STEWIE_VOICE_ID, RICK_VOICE_ID, MORTY_VOICE_ID]);
const CASTS = [
  {name: 'Peter & Stewie', first: PETER_VOICE_ID, second: STEWIE_VOICE_ID},
  {name: 'Rick & Morty', first: RICK_VOICE_ID, second: MORTY_VOICE_ID},
];

// Prebuilt Gemini TTS voices, distinct per character so the two speakers in a
// pair never share a voice. The Rick/Morty pair was chosen by audition rather
// than arbitrarily; Peter/Stewie have not been auditioned.
const GEMINI_VOICE_BY_ID = {
  [PETER_VOICE_ID]: 'Puck',
  [STEWIE_VOICE_ID]: 'Charon',
  [RICK_VOICE_ID]: 'Algenib',
  [MORTY_VOICE_ID]: 'Achird',
};

// Gemini TTS honors a natural-language tone instruction prepended to the text.
// These describe a character archetype only — they never name a show, actor, or
// performance to imitate. A voice with no entry is sent as plain text.
const STYLE_BY_ID = {
  [RICK_VOICE_ID]: 'a gravelly-voiced, cynical, impatient older scientist, fast and clipped and a little manic',
  [MORTY_VOICE_ID]: 'a nervous, high-strung teenage boy, higher pitched and hesitant and anxious',
};

async function loadGeminiApiKey() {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    return typeof config.geminiApiKey === 'string' && config.geminiApiKey.trim() ? config.geminiApiKey.trim() : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error('Could not read local Gemini configuration.');
  }
}

function parseArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error('Usage: generate-audio-gemini.mjs --script <dialogue.json> --topic <topic-slug> --output <faceless-output-directory>');
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function validateLines(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Dialogue JSON must be a non-empty array.');
  }
  const lines = [...value].sort((a, b) => a.index - b.index);
  for (let expectedIndex = 0; expectedIndex < lines.length; expectedIndex += 1) {
    const line = lines[expectedIndex];
    if (!line || line.index !== expectedIndex || typeof line.text !== 'string' || !line.text.trim()) {
      throw new Error(`Dialogue line ${expectedIndex} is invalid.`);
    }
    if (!ALLOWED_VOICE_IDS.has(line.voiceId)) {
      throw new Error(`Dialogue line ${expectedIndex} has an unsupported voice ID.`);
    }
    if (expectedIndex > 0 && line.voiceId === lines[expectedIndex - 1].voiceId) {
      throw new Error(`Dialogue line ${expectedIndex} does not alternate speakers.`);
    }
  }
  const cast = CASTS.find(({first, second}) => lines.every((line) => line.voiceId === first || line.voiceId === second));
  if (!cast) {
    throw new Error('Dialogue JSON must use exactly one approved character pair.');
  }
  if (!lines.some((line) => line.voiceId === cast.first) || !lines.some((line) => line.voiceId === cast.second)) {
    throw new Error(`Dialogue JSON must include both ${cast.name} voices.`);
  }
  if (lines.at(-1).voiceId !== cast.second) {
    throw new Error(`The final dialogue line must use the second ${cast.name} voice.`);
  }
  return lines;
}

async function isCompletedAudioFile(filePath) {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

// Gemini TTS returns raw 16-bit PCM at 24kHz mono, base64-encoded, never a
// container format. Wrap it in a WAV header ourselves rather than depending on
// ffmpeg for this one step, so the failure mode on a malformed response is a
// clear assertion here, not an opaque ffmpeg exit code.
function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

// The dialogue schema puts a leading emotion tag on each line, e.g. "(excited)".
// It must never be spoken aloud, so it is stripped from the text either way, but
// it is folded into the tone instruction rather than discarded.
function buildPrompt(line) {
  const emotion = line.text.match(/^\(([a-z]+)\)\s*/i)?.[1];
  const spokenText = line.text.replace(/^\([a-z]+\)\s*/i, '');
  const persona = STYLE_BY_ID[line.voiceId];
  if (!persona) return spokenText;
  return `Read this as ${persona}${emotion ? `, sounding ${emotion.toLowerCase()}` : ''}: ${spokenText}`;
}

async function generateLine({geminiApiKey, line, filePath}) {
  const voiceName = GEMINI_VOICE_BY_ID[line.voiceId];
  const spokenText = buildPrompt(line);
  const response = await fetch(`${GEMINI_TTS_URL}?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      contents: [{parts: [{text: spokenText}]}],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName}}},
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini TTS could not generate line ${line.index} (HTTP ${response.status}). ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  const inlineData = payload?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const base64Audio = inlineData?.data;
  if (!base64Audio) {
    throw new Error(`Gemini TTS returned no audio for line ${line.index}.`);
  }
  const pcm = Buffer.from(base64Audio, 'base64');
  if (pcm.length === 0) {
    throw new Error(`Gemini TTS returned empty audio for line ${line.index}.`);
  }
  const wav = pcmToWav(pcm);

  const temporaryPath = `${filePath}.part`;
  await writeFile(temporaryPath, wav);
  await rename(temporaryPath, filePath);
}

async function runFfmpeg(argumentsList) {
  const executable = await ensureFfmpeg();
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, argumentsList, {stdio: 'inherit'});
    child.on('error', () => rejectPromise(new Error('FFmpeg is required to create full-dialogue.mp3.')));
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`FFmpeg failed while creating full-dialogue.mp3 (exit ${code}).`));
    });
  });
}

function toConcatEntry(filePath) {
  return `file '${filePath.replace(/\\/g, '/').replace(/'/g, "'\\\\''")}'`;
}

const options = parseArguments(process.argv.slice(2));
if (!options.script || !options.topic || !options.output) {
  throw new Error('Usage: generate-audio-gemini.mjs --script <dialogue.json> --topic <topic-slug> --output <faceless-output-directory>');
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,2}$/.test(options.topic)) {
  throw new Error('Topic must be a lowercase two- or three-word slug, for example claude-video.');
}

const geminiApiKey = await loadGeminiApiKey();
if (!geminiApiKey) {
  throw new Error(`Gemini API key not configured. Set GEMINI_API_KEY or write {"geminiApiKey":"..."} to ${CONFIG_PATH}.`);
}

const scriptPath = resolve(options.script);
const outputDirectory = resolve(options.output);
const audioDirectory = join(outputDirectory, 'audio', options.topic);
const lines = validateLines(JSON.parse(await readFile(scriptPath, 'utf8')));
await ensureFfmpeg();
await mkdir(audioDirectory, {recursive: true});

// .wav files even though the pipeline's naming convention is NNN.mp3 elsewhere
// — the extension here matches actual content (see pcmToWav); ffmpeg concat
// reads container format, not the file extension, and downstream scripts only
// use the filename recorded in audio-manifest.json, never assume ".mp3".
for (const line of lines) {
  const file = `${String(line.index).padStart(3, '0')}.wav`;
  const filePath = join(audioDirectory, file);
  if (await isCompletedAudioFile(filePath)) {
    console.log(`Keeping existing ${file}.`);
    continue;
  }
  console.log(`Generating line ${line.index + 1} of ${lines.length} (Gemini voice: ${GEMINI_VOICE_BY_ID[line.voiceId]}).`);
  await generateLine({geminiApiKey, line, filePath});
  console.log(`Saved ${file}.`);
}

const audioFiles = lines.map((line) => `${String(line.index).padStart(3, '0')}.wav`);
for (const file of audioFiles) {
  await access(join(audioDirectory, file));
}

const concatFile = join(audioDirectory, 'ffmpeg-concat.txt');
const combinedAudio = join(audioDirectory, 'full-dialogue.mp3');
await writeFile(concatFile, `${audioFiles.map((file) => toConcatEntry(join(audioDirectory, file))).join('\n')}\n`);
try {
  // Re-encode to mp3 here (unlike Fish's -c copy) since inputs are wav, not mp3.
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c:a', 'libmp3lame', '-q:a', '2', combinedAudio]);
} finally {
  await rm(concatFile, {force: true});
}

await writeFile(
  join(audioDirectory, 'audio-manifest.json'),
  `${JSON.stringify({
    topic: options.topic,
    combinedAudio: 'full-dialogue.mp3',
    ttsProvider: 'gemini',
    lines: lines.map((line) => ({
      index: line.index,
      voiceId: line.voiceId,
      file: `${String(line.index).padStart(3, '0')}.wav`,
    })),
  }, null, 2)}\n`,
);

console.log(`Audio complete (Gemini TTS): ${audioDirectory}`);
