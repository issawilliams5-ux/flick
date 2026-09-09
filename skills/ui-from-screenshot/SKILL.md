---
name: ui-from-screenshot
description: Turn a screenshot, mockup, or text description of an interface into HTML/Tailwind you can adapt into a Flick scene, using the locally installed screenshot-to-code or OpenUI. Use when a scene has to show a real UI — an app screen, dashboard, terminal, landing page, chat window — and you would otherwise hand-write that markup from a reference image.
---

# ui-from-screenshot

Two open-source tools that turn a screenshot or a prompt into UI code, installed on demand and run locally. Neither is vendored into this repository.

## When this helps Flick — and when it does not

Flick's **HyperFrames** engine builds each scene as HTML/CSS animated with GSAP. When a scene has to show a believable interface, the slow part is not the motion, it is the static markup: recreating a dashboard, an editor, a chat thread, a settings panel. These tools produce exactly that markup — HTML plus Tailwind classes — from a reference screenshot or a written description, which you then lay out and animate yourself.

Use it when:

- a scene in `flick-plan.md` calls for a UI that does not exist in `saved-animations/`, and the user supplied a screenshot of it in `brand-assets/`;
- the user describes a screen in words ("a pricing page with three cards") and no reference image exists — OpenUI's prompt mode covers this;
- a Remotion scene needs a static UI block whose CSS you would otherwise author by hand.

Do not use it when:

- a `saved-animations/` template already fits — reuse beats regenerate;
- the scene is typographic, illustrative, or B-roll — there is no UI to reconstruct;
- the source screenshot is not the user's to reproduce. Flick's creative laws apply unchanged: only user-supplied assets and source material the user has the right to use.

Honest limits: both tools emit a **static** page. They do not produce Remotion components, GSAP timelines, or Flick's scene structure, and the generated Tailwind is usually verbose. Treat the output as a starting layout to trim and restructure, never as a finished scene. Neither tool runs at all without a vision-capable LLM API key.

## Install

```text
node <ui-from-screenshot-skill>/scripts/setup-ui-tools.mjs --tool all
```

Both repositories are cloned into `~/ui-tools/` (override with `--home <dir>` or `UI_TOOLS_HOME`) — outside this repository, because they are large and separately licensed. The installer is idempotent: an existing clone is left in place and dependency installs are safe to repeat. A tool whose prerequisites are missing is reported and skipped, never force-installed.

Install just one with `--tool screenshot-to-code` or `--tool openui`.

## screenshot-to-code (MIT)

[abi/screenshot-to-code](https://github.com/abi/screenshot-to-code) — FastAPI backend plus a React/Vite frontend. Screenshot or mockup in, HTML/Tailwind (or React, Vue, Bootstrap, SVG) out.

Prerequisites: `git`, `poetry`, Python 3.10+, `node`.

Run both halves, in two shells:

```text
cd ~/ui-tools/screenshot-to-code/backend && poetry run uvicorn main:app --reload --port 7001
cd ~/ui-tools/screenshot-to-code/frontend && npm run dev
```

Backend listens on **7001**; the frontend dev server on **5173** and proxies `/generate-code`, `/api`, and `/local-assets` to the backend. Open `http://localhost:5173`.

Keys go in `~/ui-tools/screenshot-to-code/backend/.env` (git-ignored by upstream) or the process environment — at least one of `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`; `GEMINI_API_KEY` and `REPLICATE_API_KEY` unlock the video and image-editing modes. The backend starts and serves without a key; generation fails until one is set.

Screenshot import for the paste-a-URL mode also needs `poetry run playwright install chromium` once.

## OpenUI (Apache-2.0)

[wandb/openui](https://github.com/wandb/openui) — a Python backend serving a prebuilt React frontend. Describe an interface in words, render it live, and iterate on it.

Prerequisites: `git`, `uv`, Python 3.9+.

```text
cd ~/ui-tools/openui/backend && .venv/bin/python -m openui
```

One process serves both API and UI on **7878**. Open `http://localhost:7878`.

Keys come from the environment: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `COHERE_API_KEY`, or `MISTRAL_API_KEY`; `OLLAMA_HOST` (default `http://127.0.0.1:11434`) points at a local Ollama for a key-free vision model. The server starts and serves the UI without any key; generation fails until one is set.

## Using the output in a scene

1. Generate the markup in either tool's browser UI and copy the HTML.
2. For a HyperFrames scene, paste it into the scene's composition under `<output-directory>/hyperframes/compositions/`, strip whatever the scene does not show, then write the GSAP timeline. For a Remotion scene, port the layout into the component's JSX.
3. Replace every placeholder image and every string with the approved assets and transcript copy from `flick-plan.md`. Generated markup often carries invented brand names, lorem text, and remote image URLs — none of those ship in a scene.
4. Keep the scene's approved name and file paths. This skill changes how the markup gets written, not Flick's workflow or gates.

## Guardrails

- Both tools are third-party services running locally, but every generation is a **paid API call** to whichever provider's key is set. Test on one screenshot and check the bill before doing a batch.
- Never commit a key. Keys belong in the environment or in the tool's own git-ignored `.env` — never in this repository, a scene file, or `scene-spec.json`. See `.env.example` for the variable names.
- screenshot-to-code is MIT, OpenUI is Apache-2.0. Both stay outside this tree; review their licenses before redistributing anything derived from them.
- Screenshots sent to these tools leave the machine and go to the model provider. Do not upload a screenshot containing customer data, credentials, or anything under NDA.
- Generated markup is untrusted output: read it before pasting. Drop any `<script>` block, remote `src`, or tracking pixel it invents — a Flick scene renders locally and needs none of them.
