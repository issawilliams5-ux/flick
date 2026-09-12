# Ponytail ruleset (always on)

Adapted for this repo from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) — that repo is outside this session's GitHub access scope, so this is a manual port of the published ladder/philosophy, not the plugin itself. No `/ponytail lite|full|ultra|off` mode switching and no `/ponytail-review|-audit|-debt|-gain` commands here — those are plugin skill files this port doesn't include. If the real plugin ever becomes installable in your environment (`/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail`), prefer that over this file.

The rule was never "fewest tokens." It is: **write only what the task needs, and never cut validation, error handling, security, or accessibility.** Code ends up small because it's necessary, not golfed.

## The ladder

Before writing code, stop at the first rung that holds:

1. Does this need to exist? → no: skip it (YAGNI)
2. Already in this codebase? → reuse it, don't rewrite
3. Stdlib does it? → use it
4. Native platform feature? → use it (e.g. reach for a native `<input>` before reaching for a component)
5. Installed dependency? → use it
6. One line? → one line
7. Only then: the minimum that works

Run the ladder *after* understanding the problem, not instead of it — read the code the change touches and trace the real flow before picking a rung. Lazy about the solution, never about reading.

## Never on the chopping block

Trust-boundary validation, data-loss handling, security, and accessibility are never cut for brevity, no matter what rung you land on.

# Terse output mode: caveman skill (opt-in)

[caveman](https://github.com/JuliusBrussee/caveman) (MIT) is a skill that
answers in compressed, technical-but-terse prose to cut output tokens —
complementary to the Ponytail ruleset above, which targets code volume rather
than wording. Vendored here as the "small rock" only: `.claude/skills/caveman/`
(a plain Markdown rule file, no hooks, no proxy, nothing executed).

- Opt-in per session — say `/caveman` or "talk like caveman" to activate,
  `/caveman off` or "normal mode" to revert. It does not change default
  behavior on its own.
- Never applies to persisted text: code, comments, commit messages, PR/issue
  bodies, or docs stay normal prose regardless of mode.
- The project's bigger "proxy" component (`@caveman-ai/cli`, BSL-1.1) is
  **not installed** — it needs `npm install -g` of an unreviewed package and
  is out of scope for this repo; the skill alone covers terse replies.

# Screenshot/prompt → UI code: screenshot-to-code and OpenUI (installed on demand)

[screenshot-to-code](https://github.com/abi/screenshot-to-code) (MIT) and
[OpenUI](https://github.com/wandb/openui) (Apache-2.0) turn a screenshot or a
text prompt into HTML/Tailwind. They are **not vendored** here and are not part
of any Flick run; `skills/ui-from-screenshot/scripts/setup-ui-tools.mjs` clones
and installs them into `~/ui-tools/` (override with `UI_TOOLS_HOME`) on demand.

Use them for the one thing they are good at here: producing the *static* markup
for a scene that must show a believable interface, which you then lay out and
animate yourself with GSAP (HyperFrames) or JSX (Remotion). Reach for a
`saved-animations/` template first — reuse beats regenerate. Skip both tools
entirely for typographic, illustrative, or B-roll scenes; there is no UI to
reconstruct.

- screenshot-to-code: backend on **7001**, Vite frontend on **5173**.
  OpenUI: one process on **7878**.
- Both need a vision-capable LLM key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  and friends — see `.env.example`). They boot and serve without one;
  generation fails until a key is set. Never commit a key.
- Every generation is a paid API call. Test one screenshot and check the bill
  before doing a batch.
- Screenshots leave the machine for the model provider — never upload customer
  data, credentials, or anything under NDA, and only reproduce a UI the user
  has the right to reproduce.
- Generated markup is untrusted output: read it, strip invented brand names,
  lorem text, `<script>` blocks, and remote `src`/tracking URLs before it
  reaches a scene.
- Full run instructions and guardrails: `skills/ui-from-screenshot/SKILL.md`.
