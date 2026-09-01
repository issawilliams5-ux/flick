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
