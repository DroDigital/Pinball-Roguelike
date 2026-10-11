# Ball & Chain

A single-player pinball roguelike for the browser. You wake chained to a stool in a rusted
cell in front of **DEBTOR'S PRISON**, a battered late-70s pinball machine. An ATM shows what
you owe the Warden. Bank enough coins before each Deadline, or the trapdoor opens.

Built with Vite, TypeScript (strict), Three.js and Planck.js. Work in progress: see
[DESIGN.md](DESIGN.md) for the milestone checklist and the decisions log.

## Play

```sh
npm install
npm run dev        # open http://localhost:5173
```

| Action   | Keys                                 | Gamepad                    | Touch                                |
| -------- | ------------------------------------ | -------------------------- | ------------------------------------ |
| Flippers | Z / Slash, Shift L / R, arrows       | bumpers / triggers         | left / right half of the screen      |
| Plunger  | hold Space or Down, release to fire  | A (right stick for analog) | drag down in the bottom-right corner |
| Nudge    | X (up), C (left), V (right)          | Y, d-pad left / right      | three fingers                        |
| Lockbar  | B (first charged active charm), 1-5  |                            | lockbar button                       |
| Look     | A / D between balls                  |                            |                                      |
| Menus    | flippers move, Space / Enter selects |                            | tap                                  |

Skill shot: tap a flipper while the ball sits in the shooter lane to move the lit top lane,
then pull the plunger to the mark on the meter.

Pick an inmate from the lineup (more unlock as you play, along with Hard Time levels and
Endless). Your run autosaves at the start of every round; **Continue** picks it up. The
title's **Rap sheet** keeps your lifetime stats, endings and everything you've found.

URL options: `?seed=ABC` (fixed run seed), `?bot=novice|average|expert` (the bot plays your
balls), `?dev` (dev panel).

## Develop

See [CLAUDE.md](CLAUDE.md) for commands, architecture rules and conventions. In short:

```sh
npm run build      # typecheck + production build
npm test           # unit, scenario, replay-determinism and property tests
npm run feel       # physics feel targets
npm run soak -- --balls 10000
npm run botstats   # per-ball stats at three bot skill levels
npm run economy    # Monte Carlo run economy
npm run e2e        # Playwright smoke test, writes screenshots/
```
