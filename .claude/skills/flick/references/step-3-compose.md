# Step 3: Hand off to the scene's engine

After approval, run the engine-scaffold bootstrap for every engine used by the approved plan (see [SKILL.md](../SKILL.md)'s "Workspace setup"), then read [composition-brief-template.md](composition-brief-template.md) and write two files:

```text
<output-directory>/composition-brief.md
<output-directory>/scene-spec.json
```

`composition-brief.md` is the build handoff. Use the bundled template exactly: it states the approved format, selected assets, scene names, transcript timing, visual animation requirements, and sound-effect requirements, plus each scene's engine and engine-specific build instructions. It does not add new creative direction.

`scene-spec.json` is the structured technical version of the approved plan. Every scene requires an `engine` field (`"remotion"`, `"hyperframes"`, or `"ai-clip"`) plus the fields universal to every engine; only the block matching that scene's engine is populated:

```json
{
  "id": "approved-kebab-name",
  "name": "Approved scene name",
  "engine": "remotion",
  "transcript": "Exact transcript line(s)",
  "startMs": 0,
  "endMs": 0,
  "assets": [],
  "visualDescription": "",
  "soundEffects": [],

  "from": 0,
  "durationInFrames": 0,
  "componentName": "ApprovedSceneName",

  "hyperframesCompositionFile": "compositions/approved-kebab-name.html",
  "hyperframesCompositionId": "approved-kebab-name",

  "aiClip": {
    "model": "seedance_2_5",
    "prompt": "",
    "durationSeconds": 0,
    "aspectRatio": "9:16",
    "sourceMediaIds": []
  }
}
```

- `id`, `name`, `transcript`, `startMs`, `endMs`, `assets`, `visualDescription`, `soundEffects` are populated for every scene regardless of engine.
- `from`, `durationInFrames`, `componentName` are populated only when `engine` is `"remotion"`.
- `hyperframesCompositionFile`, `hyperframesCompositionId` are populated only when `engine` is `"hyperframes"`.
- `aiClip` is populated only when `engine` is `"ai-clip"` — see the ai-clip section below for how its fields are filled and gated.
- If a scene has no `engine` field (a pre-existing project from before engines existed), treat it as `"remotion"`.

Sync the approved spec:

```text
node <flick-skill>/scripts/sync-scene-spec.mjs --project <output-directory>
```

Flick owns the approved transcript, plan, composition brief, and scene specification regardless of engine. Each engine owns its own build artifact, motion or generation mechanism, and preview surface: Remotion owns the component code, frame-driven motion, composition registration, and Studio preview; HyperFrames owns the HTML/GSAP composition, second-based timing, and its own preview server; ai-clip owns nothing hand-authored — the HIGGSFIELD-generated clip is itself the artifact, gated by cost approval before it's ever requested.

## If Remotion

Build components in `<output-directory>/remotion/src/scenes/`. Use frame-driven Remotion motion only. Copy only selected user assets into `remotion/public/brand-assets/` when needed. Bundled sound effects are in `remotion/public/sounds/`.

Create one dedicated composition per approved Remotion scene. Register each component in `Root.tsx` and do not create an all-scenes composition. Do not add background music.

1. Build one custom React component for every approved Remotion scene under `<output-directory>/remotion/src/scenes/`.
2. Register every component as its own named Remotion composition in `<output-directory>/remotion/src/Root.tsx`.
3. Copy only selected brand assets into `remotion/public/brand-assets/`.
4. Use the approved transcript timing, visual direction, interaction order, and SFX triggers. Do not add new creative direction.
5. Render each named scene with `node <flick-skill>/scripts/render-scene.mjs --project <output-directory> --composition <scene-id> --name <approved-scene-name>` before presenting it to the user.

## If HyperFrames

Build one **standalone** composition file per approved HyperFrames scene under `<output-directory>/hyperframes/compositions/<scene-id>.html` — a full `<!doctype html>` document, not a `<template>`-wrapped fragment. HyperFrames' `-c <file>` render flag substitutes that whole document for `index.html`; it does not mount a fragment into a host. (The `data-composition-src`/`<template>` sub-composition mechanism exists to combine several scenes into one continuous timeline — that's not what Flick wants, since each scene renders to its own independent MP4.) Use `<flick-skill>/assets/starter-hyperframes/compositions/EXAMPLE-scene.html.txt` as the shape to copy. Copy only selected user assets into `hyperframes/brand-assets/`. Bundled sound effects are in `hyperframes/sounds/`.

1. Reference GSAP from the vendored local copy — `<script src="../vendor/gsap.min.js"></script>` — never a CDN URL. A live CDN fetch during render is unnecessary and can fail depending on network policy; the vendored copy always works.
2. Give the composition root a `data-composition-id` matching the scene's approved kebab-case id, and register a paused `gsap.timeline({paused: true})` at `window.__timelines["<scene-id>"]` using that same id.
3. Author timing in **seconds** against `data-start`/`data-duration` on the composition root and each clip, not frames. Clips must be direct children of the composition root — nesting breaks registration.
4. Use `class="clip"` on visible div/img elements only (omit on `<video>`/`<audio>`); prefer `gsap.fromTo()` over `gsap.from()` for entrance tweens.
5. Sound effects are plain `<audio>` clips, direct children of the composition root, on a high `data-track-index` (10+) to stay clear of visual tracks, with `data-volume` around 0.35 (SFX must sit under narration/BGM). Do not add background music.
6. Render each named scene with `node <flick-skill>/scripts/render-scene.mjs --project <output-directory> --composition <scene-id> --name <approved-scene-name>` before presenting it to the user.

## If ai-clip

An ai-clip scene has no hand-authored code — it's a real HIGGSFIELD `generate_video` call. This costs the user real credits (or a free-trial "unlim" allowance), so it is gated, and the gate cannot be skipped:

1. Derive a `generate_video` prompt from the scene's approved `visualDescription`, transcript context, and creative direction. Store it in `scene-spec.json`'s `aiClip.prompt` for that scene, along with `model`, `durationSeconds`, `aspectRatio`, and any `sourceMediaIds` (reference images/video the user supplied, uploaded via `media_upload_widget`/`media_import_url` first).
2. Call `generate_video` with `get_cost: true` using those same params — this returns the cost **without submitting a job**.
3. Show the user the exact model, duration, aspect ratio, and cost, and ask verbatim:

   > This will generate "[scene name]" as an AI clip using [model] (~[duration]s, [aspect ratio]) for [cost]. Approve, or tell me what to change first?

4. Only on explicit approval, call the real `generate_video` (or, when more than one ai-clip scene was approved together, `generate_video_batch` followed by `jobs_wait` for all of them, then `show_generation_by_ids`).
5. Once a scene's job is terminal and its downloadable URL is known, run:
   ```text
   node <flick-skill>/scripts/finalize-ai-clip.mjs --project <output-directory> --name <approved-scene-name> --url <downloadable-video-url> --job-id <job-id>
   ```
   This downloads the clip to `<output-directory>/scenes/<approved-scene-name>/<approved-scene-name>.mp4` — the same convention every engine uses — and records the job/prompt for traceability.

`render-scene.mjs` cannot render an ai-clip scene itself (it has no MCP tool access) — do not call it for an `ai-clip` scene; it will throw and point back to this flow.

## Self-review checklist

Before presenting any scene, verify — using the items that apply to that scene's engine:

- [ ] `flick-plan.md` was approved.
- [ ] `composition-brief.md` and `scene-spec.json` agree on the scene ID, engine, transcript timing, assets, SFX, and output name.
- [ ] Only approved brand assets are used and all on-screen text is readable.
- [ ] There is no background music; every SFX supports a visible approved action.
- [ ] `<output-directory>/scenes/[approved-scene-name]/[approved-scene-name].mp4` exists.
- [ ] Opening, middle, and ending frames were inspected for timing, visual continuity, and text readability (skip for ai-clip — inspect the generated clip as a whole instead).

**Remotion scenes additionally:**
- [ ] The component is registered as an independent named composition in `Root.tsx`.
- [ ] The composition uses the approved aspect ratio, dimensions, FPS, and transcript-derived frame duration.
- [ ] `npx tsc --noEmit` passes from `<output-directory>/remotion/`.
- [ ] The named Remotion composition renders successfully.
- [ ] Remotion Studio starts successfully before its URL is shared.

**HyperFrames scenes additionally:**
- [ ] The scene file is a standalone `<!doctype html>` document (not `<template>`-wrapped), and its `data-composition-id` matches its `window.__timelines[...]` key.
- [ ] GSAP is loaded from `../vendor/gsap.min.js`, not a CDN URL.
- [ ] Every clip is a direct child of the composition root; `class="clip"` is present on visible div/img elements.
- [ ] `npx hyperframes preview` starts successfully before its URL is shared.

**ai-clip scenes additionally:**
- [ ] The cost was shown and the user explicitly approved it before `generate_video` was called for real.
- [ ] `finalize-ai-clip.mjs` ran successfully and the downloaded file exists at the standard path.
