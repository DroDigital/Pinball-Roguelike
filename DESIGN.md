# Ball & Chain — Design Document

Living document. The brief is the source of intent; this file records how it is
being realised, what is done, and every call that deviates from or interprets it.

## Pitch

You wake chained to a stool in a rusted cell. Bolted in front of you is
**DEBTOR'S PRISON**, a battered late-70s pinball machine. An ATM shows what you
owe. Bank enough coins before each Deadline or the trapdoor under the stool
opens. Pure pinball roguelike: no reels, no slot symbols.

## Pillars (in priority order when they conflict)

1. **Pinball first.** Instant flippers, controllable shots, fair drains, real
   technique (cradle, post pass, live catch, nudge save).
2. **Every ball has a goal.** Lit shots, Jobs, multiball.
3. **Builds change how you play.** Yard / Chute / Riot builds feel different.
4. **Dread, then payoff.** Quiet oppressive cell; explosive table.
5. **Cruel but fair.** Losses are your mistake or your gamble, never physics.

## Architecture

```
src/
  core/     Node-safe utilities: seeded RNG, hashing, math, event queue
  sim/      Planck physics, table builder, flippers, triggers, watchdog, replay
  rules/    Table rules (scoring, modes), run/economy, charms, jobs, sentences, shop, phone
  content/  Data: table, balance (ALL tunables), charms, contraband, sentences, jobs, inmates, dialogue
  bot/      Heuristic bot (headless in Node; also drives attract mode)
  present/  Three.js scene, shaders, DMD, lamps, audio, cameras, UI overlays
  app/      State machine, input, saves, settings, entry point
tools/      Node CLIs: feel test, physics soak, bot stats, economy Monte Carlo
tests/      Vitest unit + property tests; e2e/ Playwright smoke
```

Data flow per fixed step (240 Hz):

```
input -> Sim.step() -> SimEvents (switch hits, drains, contacts)
      -> TableGame.consume(events) -> commands back to Sim (eject, kickback, multiball)
                                   -> GameEvents (payouts, callouts, lamp/DMD cues)
      -> presentation reacts (interpolated render at display rate)
```

`core/`, `sim/`, `rules/`, `content/` and `bot/` never import DOM, Three.js or
`present/`/`app/`; enforced by `tsconfig.node.json` (no DOM lib) and ESLint.

## Units and physics

- 1 world unit = 1 ball diameter (27 mm). Ball radius 0.5. Box2D tolerances
  (linearSlop 0.005) are tiny relative to that.
- Playfield is 20 x 40 units (main field 0..18.4, shooter lane 18.6..19.9).
  y points up the table; gravity is the slope component `(0, -slopeGravity)`.
- Fixed step 1/240 s, 8 velocity / 3 position iterations. Max ball speed is
  clamped well below `maxTranslation * 240` (= 480 u/s).
- Ball: dynamic bullet (CCD), high angular damping so 2D spin never dominates.
- Flippers: dynamic bodies on motorised revolute joints with limits. Stroke
  torque until end-of-stroke, then a weaker hold torque (EOS switch), and a
  return spring torque. Never teleported.
- Flipper rubber restitution is interpolated by contact position: dead at the
  base, livelier at the tip (pre-solve override).
- Pops / slings: on contact, an impulse along the contact normal is queued and
  applied after the step (never mutate the world in callbacks).
- Switches/rollovers/gates use custom line-crossing triggers (directional, can't
  be tunnelled) instead of Planck sensors.
- Chute: commit trigger at the top of an incline zone (weak shots roll back);
  committed balls leave the 2D world and ride a 3D spline, then are set down at
  the left inlane.
- Watchdog: any ball slower than a threshold outside a known hold for too long
  gets a rescue kick (and finally a re-serve).

## Economy units

Coins in the Pocket, Bank and debt are integers. Table payouts are fractional
(+50% per shot level makes this unavoidable): each ball accumulates fractional
"ball earnings" that are committed on drain as `floor(earnings + looseChange)`,
with the remainder carried as loose change. Number pops show one decimal under 10.

## Milestones

Each must meet its checks before the next begins.

### M1 — Vertical slice
- [x] Project scaffold, strict TS, lint, tests, docs
- [x] Table data: flippers, plunger, top lanes, Yard pops, slings, Cell Block drops,
      Chute, Perimeter orbits + Searchlight spinner, Hole, inlanes/outlanes, kickback, drain
- [x] Sim: fixed step, flippers, plunger, triggers, Chute transport, Hole capture/eject,
      nudge + tilt, ball save, watchdog, events
- [x] Coins on hits, number pops
- [x] One deadline of 3 rounds, ball buying, ATM deposits, trapdoor
- [x] Renderer: 3D table from data, Play cam, ball interpolation, HUD
- [x] Bot (3 skill levels) + headless runner
- [x] Feel targets met (`npm run feel`):
  - [x] flipper responds next step (20 rad/s after 1 step), upswing 50 ms
  - [x] full tip shot reaches top in 0.72 s (median)
  - [x] competent bot 45-90 s/ball on deadline 1 (average bot: mean ~83 s, median ~60 s)
  - [x] <25% centre drains (average bot 11-17%)
  - [x] cradle -> major shot 70%+ on each flipper (left Perimeter 100%; right Chute/Hole 100%)
- [x] Technique scenarios: cradle, post pass, live catch, nudge save (both sides, in tests)
- [x] 10,000-ball soak clean (no tunnelling, escapes, missed stuck balls): 225 simulated hours
      in 16 min; drains outlane L 47%, outlane R 32%, centre 19%; 0.2 watchdog rescues/ball
- [x] Playwright smoke + screenshots (`npm run e2e`, `screenshots/`)
- [x] Balance tools: `npm run botstats`, `npm run economy` (sampled + physics modes)
- [x] Dev panel (`?dev`): live tuning, spawn / shift-click spawn, collider + trigger
      overlay, slow-mo, frame step, frame-time graph, bot autoplay, top-down cam

M1 baseline numbers (deadline-1 rules, 90 balls per skill):

| bot | coins/ball | secs/ball | skill shot | drains (L/R/centre) |
| --- | --- | --- | --- | --- |
| novice | 15.8 | 77 | 26% | 51/34/14% |
| average | 22.2 | 102 | 80% | 47/42/11% |
| expert | 23.0 | 98 | 98% | 56/29/16% |

Economy at M1 (sampled, average bot): deadlines 1-3 clear 97-100% (deadline 1 ends with
~370c against a 75c debt: no dread), deadline 4 clears 4%, nobody passes 5. Flat scoring
cannot keep up with x2.4 debt; M2 (shot levels, multipliers, PAYDAY) and M4 (charms) are
the growth, and M2 must also cut deadline-1 earnings so the first deadline is tense.

### M2 — Scoring depth
- [ ] Combos, Bonus + count-up tally, Bonus multiplier
- [ ] Cell Block -> Lockup -> RIOT multiball, PAYDAY / SUPER PAYDAY
- [ ] Hole award ladder, kickback lighting, shot levels, luck + lucky bounces, sparks
- [ ] Jobs (incl. Key Jobs)

### M3 — The run
- [ ] 8 deadlines, debt curve, Sentences (14), interest, loans, pay early
- [ ] Phone perks, red calls

### M4 — Build-crafting
- [ ] Vending cabinet shop (rarity, tags glow, reroll, sell), full charm roster
- [ ] Contraband, legendaries, devil charms, hardware mounts, active charms

### M5 — The cell
- [ ] Retro renderer (low-res, vertex snap, affine wobble, dither, palette, fog, grain)
- [ ] Cameras (Play, Seated, look-around), DMD + animations, lamp shows
- [ ] Cell decay, audio + adaptive music, juice, Warden lines

### M6 — Story and meta
- [ ] Neighbor, Keys, JAILBREAK, three endings, inmates, Hard Time
- [ ] Unlocks, Rap Sheet, saves with migrations

### M7 — Polish
- [ ] Onboarding, accessibility, settings, touch + gamepad
- [ ] Phone performance, replays, balance pass

### M8 — Stretch
- [ ] Daily Sentence, seed sharing, offline PWA

## Decisions log

Format: date — decision — why.

- 2026-10-11 — Units: 1 unit = ball diameter, radius 0.5, table 20x40. — Brief asks for
  radius ~0.5; real table is ~19x39 ball diameters.
- 2026-10-11 — Flippers are motorised revolute joints (dynamic bodies), not kinematic. —
  Gives real coil behaviour for free: weaker hold lets a held flipper give under impact
  (live catches, flipper bounce), Greased Flippers / Brawler / Lead Ball map onto torque
  and mass instead of special cases.
- 2026-10-11 — Custom line-crossing triggers instead of Planck sensors. — Directional
  (orbit up vs down), deterministic and cannot be skipped by fast balls.
- 2026-10-11 — Fractional ball earnings, integer purse (see Economy units). — +50%/level
  shot values are inherently fractional; the brief's small coin scale (debt 75, ball 3)
  needs sub-coin hit values.
- 2026-10-11 — Super skill shot: holding the left flipper during the plunge flips a
  diverter that sends the ball over a wire ramp to the right inlane; the super skill
  shot is then a right-flipper shot up the left Perimeter within 5 s. — The brief's
  "up the left Perimeter" reads best as the target; a cross-field flipper shot is real
  skill and keeps the plunger lane simple.
- 2026-10-11 — Locks are virtual (the Hole kicks a new ball to the plunger and stores the
  lock count). — Simpler, deterministic, and Lockpick/Spare Key map cleanly.
- 2026-10-11 — Tilt forfeits the ball's uncommitted earnings and Bonus; earnings are held
  per ball and committed on a clean drain. — Matches "the ball is lost with its Bonus and
  everything it earned".
- 2026-10-11 — Heuristic bot lives in `src/bot/` (Node-safe). — Shared by tools and attract mode.
- 2026-10-11 — Slope gravity 20 u/s² (real 6.5° slope is ~41). — At real gravity shots
  curved visibly and orbits died; 20 keeps the 0.7 s tip shot and makes shots readable at
  low resolution. Kick speeds and the plunger curve are scaled to match.
- 2026-10-11 — Constant rolling resistance (2.2 u/s²) plus tiny linear damping (0.03)
  instead of heavy damping. — Proportional damping never let a cradled ball settle and
  bled fast shots; a constant decel matches a rolling ball.
- 2026-10-11 — Slings kick with ±12% seeded speed variance, ±5° jitter and a 12° downward
  tilt. — Without them two slings formed a deterministic infinite ping-pong; the tilt
  also matches real slings (they send the ball down-field).
- 2026-10-11 — The right Perimeter funnels into the top of the shooter lane (a one-way
  gate keeps plunged balls out of it). Weak plunges and orbit returns that fall back down
  the column are caught by a return wire (`colWire`) to the right inlane. — Every earlier
  right-orbit layout either died on the arch shoulder or fed the right outlane.
- 2026-10-11 — Shield faces below each flank and a steep `cellRoof` over the Cell Block. —
  Flanks were funnelling cross-table traffic straight into the outlanes; the roof removes
  a dead spot where balls balanced on the drop bank.
- 2026-10-11 — Plunger exit curve reshaped so each top lane gets a ~0.08-0.1 pull window
  (C 0.55-0.66, B 0.67-0.76, A 0.78-0.84; full plunge orbits). The HUD meter marks the
  lit lane's pull. — Lanes B and A were ~20 ms windows, effectively luck.
- 2026-10-11 — Excess Bank carries over after paying a deadline. — Overpaying early should
  feel like a cushion, not a waste; pay-early tickets (M3) still reward skipping.
- 2026-10-11 — Extra nudge bindings C / V (left / right) beside X (up). — The brief's
  single nudge key can't save both outlanes; directional nudges are standard.
- 2026-10-11 — Cabinet body and lockbar are children of the tilted table group. — A
  level cabinet box cut through the lower playfield.
- 2026-10-11 — Landscape HUD puts the DMD and stats in a left column beside the table;
  portrait puts the DMD on top and the camera fits width as well as height. — Keeps the
  arch visible on every aspect.

