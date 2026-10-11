# CLAUDE.md — Ball & Chain

Pinball roguelike (Vite + TypeScript strict + Three.js + Planck). See DESIGN.md for the
design, milestone checklist and decisions log; update both as you work.

## Commands

- `npm run dev` — dev server (append `?dev` to the URL for the Tweakpane dev panel)
- `npm run build` — typecheck + production build
- `npm run typecheck` — `tsc` for browser and Node-safe projects
- `npm run lint` / `npm run format`
- `npm test` — Vitest (rules, sim scenarios, replay determinism, property tests)
- `npm run feel` — physics feel targets report
- `npm run soak -- --balls 10000` — bot physics soak (parallel workers)
- `npm run botstats` — per-ball stat distributions at three bot skill levels
- `npm run economy` — Monte Carlo economy sim (clear rates per deadline)
- `npm run e2e` — Playwright smoke (builds, serves, plays a bot ball, screenshots)

## Architecture rules

- `src/core`, `src/sim`, `src/rules`, `src/content`, `src/bot` are **Node-safe**: no DOM,
  no Three.js, no imports from `present/` or `app/`. `tsconfig.node.json` (no DOM lib)
  and ESLint enforce it. These run headless in tools and tests.
- Flow: Sim emits `SimEvent`s -> `rules` consume them and emit `GameEvent`s / issue
  machine commands -> `present` reacts. Presentation never mutates game state.
- **Every tunable lives in `src/content/balance.ts`.** No magic numbers for gameplay
  values elsewhere (geometry lives in `src/content/table.ts`).
- Determinism: sim and rules use only `Rng` from `core/rng.ts` (never `Math.random`,
  `Date.now`, `performance.now`). Fixed 240 Hz step. Iteration order must be stable.
- Never create/destroy Planck bodies or change body state inside contact callbacks;
  queue and apply after `world.step`.
- Hot loop (sim step, bot, render frame): no per-step allocations; reuse scratch
  vectors and pooled event objects.
- Content (charms, contraband, sentences, jobs, inmates, dialogue) is data in
  `src/content/`; behaviour hooks are small pure functions on that data.

## Conventions

- TypeScript strict, ES modules, named exports. 2-space indent, Prettier (printWidth 100).
- Files: kebab-case. Types/classes PascalCase, functions/vars camelCase, constants
  UPPER_SNAKE only for true constants.
- Tests next to the domain in `tests/` mirroring `src/` (e.g. `tests/rules/combo.test.ts`).
- Comments explain _why_; keep them sparse.
- Commit per milestone (or meaningful sub-step) after build + tests pass.
