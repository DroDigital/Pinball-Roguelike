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

| bot     | coins/ball | secs/ball | skill shot | drains (L/R/centre) |
| ------- | ---------- | --------- | ---------- | ------------------- |
| novice  | 15.8       | 77        | 26%        | 51/34/14%           |
| average | 22.2       | 102       | 80%        | 47/42/11%           |
| expert  | 23.0       | 98        | 98%        | 56/29/16%           |

Economy at M1 (sampled, average bot): deadlines 1-3 clear 97-100% (deadline 1 ends with
~370c against a 75c debt: no dread), deadline 4 clears 4%, nobody passes 5. Flat scoring
cannot keep up with x2.4 debt; M2 (shot levels, multipliers, PAYDAY) and M4 (charms) are
the growth, and M2 must also cut deadline-1 earnings so the first deadline is tense.

### M2 — Scoring depth

- [x] Combos: Chute / Perimeter / Hole within 3 s chain x2, x3... (callouts, DMD timer bar,
      coin pitch rises); window/start/step are ctx values for Short Fuse, Long Fuse,
      Cracked Mirror, Chain Link
- [x] Bonus: 30% of every paid hit (excluding the combo part); top lane sets and the Hole
      award raise the multiplier (cap 5); count-up tally at the drain, both flippers
      fast-forward; Taxman / Hellfire / Last Rites hooks (bonusKeep, bonusTimes)
- [x] Cell Block -> Lockup -> 2 locks -> RIOT (3-ball multiball, 8 s multiball save, balls
      released one by one from the Hole and the plunger)
- [x] PAYDAY at the Chute during RIOT (grows +0.25 per hit, collecting resets it) lights
      SUPER PAYDAY (3x the collected value) at the Hole
- [x] Hole award ladder: Bonus X, kickback, 15 s Chute hurry-up, level up, extra ball
- [x] Kickback lit at round start and by the Hole; lucky bounces (4% + 2%/luck); sparks on
      plunge (+3 luck that ball, 10%)
- [x] Shot levels: insert ladders behind each major arrow; Hole award and Jobs raise them
- [x] Jobs: 13 regular + 4 Key Jobs as data, three posted per round, live progress in the HUD,
      rewards tickets / coins / levels / Keys
- [x] Rules tests (combos, Bonus, Lockup/RIOT/PAYDAY, awards, kickback, luck, Jobs) and an
      updated economy calibration
- [x] Dev panel: luck, tickets/Keys, force a Job, light Lockup, skip a deadline

M2 calibration (`npm run economy -- --mode physics --runs 64`, average bot, no charms):
deadline 1 clears 94%, deadline 2 42%, deadline 3 11%, deadline 4 0%: Sentences, perks and
charms (M3/M4) must supply the growth for later deadlines.

Feel after M2 (200 balls per bot): novice median 63 s / mean 83 s, average median 66 s /
mean ~95-100 s, expert median 76 s / mean ~120 s; centre drains 12% (average).

### M3 — The run

- [x] 8 deadlines on the x2.4 debt curve; Last Call (deadline 8) stacks two Sentences
- [x] 14 Sentences as data (tiers 1-3, harsher later), revealed at deadline start, in force
      on the last round; physics ones soak-tested (`npm run soak -- --sentences`)
- [x] Interest at round end (10% + perks); loans up to half the debt, 150% added to the next
      debt, none on Last Call
- [x] Pay early at a round start once the Bank covers the debt: +2 tickets per skipped round
- [x] The phone after each paid deadline: 3 permanent perks, or a red call (25%, 40% once
      one is accepted) with 2 bargains or hang up; shop-only perks wait for M4
- [x] Warden dialogue (5+ lines per trigger) for intro, Sentences, calls, loans, early pay,
      the fall; Blackout presentation (dark room, each ball carries a light)
- [x] Rules tests (Sentences, Inflation, Head Count, loans, pay early, perks, bargains, Last
      Call) + property test over loans / early pays / calls; economy tool models the policy

M3 calibration (`npm run economy -- --mode physics --runs 64`, average bot, perk policy,
no charms): deadline 1 94%, deadline 2 53%, deadline 3 14%, deadline 4 3%. The brief's
targets (deadline 4 ~35%, focused builds win ~20%) need M4's charms.

### M4 — Build-crafting

- [x] Vending cabinet: restocks each deadline with 5 charms (rarity 60/30/9/1, legendaries
      from deadline 3, never one you own), 2 contraband, sometimes an Oil Can; rerolls get
      dearer; sell for half; items glow when they share a tag with your charms
- [x] Full charm roster (54) as data: static effects folded per ball / run, behaviour hooks
      by id (hit, set complete, PAYDAY, lucky bounce, outlane, RIOT save; run-level drain,
      round end, early pay, deposit, loan, Job reward)
- [x] Contraband (10), legendaries (4), devil charms (3, red calls only, can't be sold),
      hardware mounts (Bent Nail, Spare Bumper, Gold Filling, Third Arm) that change the
      physical table, active charms on the lockbar (B) and number keys, recorded as inputs
      so replays stay exact
- [x] A test per charm and per contraband item; physics variants in the soak
- [x] Economy: archetype shop policies (`--arch`), win rates and charm frequency in
      winning builds

M4 calibration (`npm run economy -- --mode physics --runs 24 --arch <a>`, average bot):

| build            | d1  | d4  | d6  | wins | notes                                                   |
| ---------------- | --- | --- | --- | ---- | ------------------------------------------------------- |
| none (no charms) | 96% | 33% | 13% | 0%   |                                                         |
| yard             | 96% | 42% | 25% | 8%   | Jar of Teeth + Gold Filling + Spare Bumper in every win |
| chute            | 92% | 33% | 8%  | 0%   | the bot barely combos or aims ramps (~0.7 Chutes/ball)  |
| riot             | 92% | 50% | 33% | 17%  | Notched Spoon in all 4 wins (small sample)              |
| random           | 96% | 62% | 29% | 8%   |                                                         |

Close to the brief's targets (average d1 ~90%, d4 ~35%; focused wins ~20%). Open for the
M7 balance pass: Chute builds need a bot that chains ramps to be measured; Notched Spoon may
dominate Riot wins; samples are small (24 runs).

### M5 — The cell

- [x] Retro renderer: 240p internal resolution, ordered dither, palette crush, grain and
      vignette for the frame; room surfaces get vertex snapping to the pixel grid, affine
      texture wobble, a hard-falloff bare-bulb light and fog. The machine keeps standard
      materials so the playfield always reads
- [x] The cell: brick and concrete walls, tiled floor, ATM with a live LCD (debt, bank,
      round; red PAY NOW at the deadline), rotary phone, vending cabinet, contraband stash,
      wall of tally marks (one per run, scratched in), door, trapdoor under the stool
- [x] Cameras: Play, Seated (A/D look around), and one per prop (ATM for jobs and
      deadlines, vending, phone, wall for the rap sheet, the coin tray between balls); the
      fall through the trapdoor with the light shrinking above
- [x] Backglass art (chained devil, eyes, keys, bars) with the shot-level ladders, repainted
      as the build changes; DMD on the backbox and in the HUD with its animations; lamp
      shows (attract, skill, RIOT, PAYDAY, drain)
- [x] Cell decay across the deadlines: rust streaks spread, a leak and a growing puddle,
      the bulb dims and flickers more
- [x] Audio: synthesised SFX for every table part, coin clinks that climb through combos,
      adaptive music (cell drone and clock that speeds with tension; table layers for
      combos, RIOT and Sentence rounds)
- [x] Juice: hit-stop on the Hole and PAYDAY, shake, flash, score pops, bulb swing, a coin
      fountain from the coin return into the tray (the pile is your pocket; the ATM takes
      it), slow motion on last-second saves (a ball dropping through the flipper gap sent
      back up; ~1 per 5 balls for the bot)
- [x] The Warden: lines on every cell screen plus reactions to play (center drain, big
      PAYDAY, RIOT, tilt, Job done, Sentence survived), rate-limited, as subtitles; an
      optional low, slow voice through the browser's speech synthesis (title screen toggle)

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
- 2026-10-11 — Every Cell Block clear lights Lockup for one lock (RIOT needs two clears and
  two Hole shots). — With Lockup staying lit until RIOT, locks persisting across balls made
  RIOT start every third ball and jackpots swamped the economy.
- 2026-10-11 — Collecting PAYDAY resets it to base; SUPER PAYDAY pays 3x the collected value.
  — An ever-growing PAYDAY paid ~190 coins per RIOT at deadline 1; the reset adds a choice
  (collect now or let it grow).
- 2026-10-11 — A global payout scale (`SCORE.scale` 0.2) on every table payout. — Keeps
  base values readable and relative while one knob sets the economy; tuned so an average
  player clears deadline 1 ~90%. Number pops show cents below one coin.
- 2026-10-11 — The Hole award ladder lights the next award when a set completes (top
  lanes or Cell Block); it starts lit each round. Lockup takes priority over the award. —
  "Completing sets advances the lit award"; without relighting the Hole would be an
  award vending machine.
- 2026-10-11 — The level-up award goes to the major shot made most this ball (else the
  Yard). — Levels go where you aim; pops would otherwise always win.
- 2026-10-11 — The Bonus multiplier resets every ball unless Held Breath. — Matches real
  machines and the charm's text.
- 2026-10-11 — Jobs track one per-ball stat, summed over the round or best single ball;
  coin targets and rewards scale with the debt curve. Contraband rewards wait for M4. —
  Data-only Jobs are trivially testable and extendable.
- 2026-10-11 — Rules randomness (lucky bounces, sparks) uses its own stream derived from
  the sim seed without advancing the physics stream. — Keeps physics replays identical
  whether or not a rule rolls dice.
- 2026-10-11 — Hit-stop freezes the sim but keeps inputs; the sim clock is derived from the
  accumulator every frame. — Dropping inputs during hit-stop could leave a flipper stuck,
  and the old clock let input latency creep up to 100 ms.
- 2026-10-11 — Cell Block roof extended over the right Perimeter funnel's upper lip, with a
  downturned nose. — The bot found a deterministic death path: balls falling down the right
  side (lane B/C exits, pop kicks) hit the funnel's 45-degree metal lip and flew straight
  across the table into the left outlane; the expert drained ~85% of its balls that way
  right after making the skill shot. Now they land on a gentle wooden slope and drop
  toward the flippers. Feel targets re-verified; the expert is the best bot again.
- 2026-10-11 — The "competent bot 45-90 s" feel check tests the median ball (65 s) with a
  100 s ceiling on the mean. — The mean (~95 s) is dominated by a long tail of RIOT and
  marathon balls; the typical ball is what sets pacing. Widening the flipper gap by 0.12
  to force the mean down sent 73% of drains down the right outlane (the lower geometry is
  very sensitive), so the table stays and the check is honest about what it measures.
- 2026-10-11 — Side nudges 4.5 -> 6 u/s; the nudge-save scenario uses an early bump. — At
  4.5 the average save window was ~37 ms; now an early nudge gives 200-370 ms while a ball
  already sitting on the post stays lost, like a real machine.
- 2026-10-11 — The kickback starts unlit; the Hole's award ladder lights it. — The brief's
  "lightable" kickback; a free save every round also inflated ball times.
- 2026-10-11 — RIOT multiball save 6 s. — Long enough to get all three balls into play.
- 2026-10-11 — Per-item numbers (Jobs, Sentences, perks, bargains, later charms) live in their
  content files; systemic tunables live in `balance.ts`. — Item data is self-describing and
  matches the brief's "numbers are starting values" for content.
- 2026-10-11 — One `RunMods` record collects permanent modifiers from perks, bargains (and
  later inmates, Hard Time, charms); `nextBall` compiles mods + active Sentences into the
  ball snapshot. — A single choke point keeps replays and tests honest.
- 2026-10-11 — Paying early happens at the start of a round (after that round's interest).
  — The ATM decision point is between rounds; mid-round paying would strand bought balls.
- 2026-10-11 — Red calls offer two bargains or hanging up (no perk that call). — The dread
  is the point: refusing costs you the call.
- 2026-10-11 — Sentence tiers: deadlines 1-2 draw tier 1, 3-5 tiers 1-2, 6-8 tiers 2-3. —
  "Harsher picks later in the run".
- 2026-10-11 — The machine's payouts rise x1.5 per deadline ("a heavier coin mech", shown on
  the deadline screen). — The debt rises x458 from deadline 1 to 8; shot levels are linear
  (+50%) and even a perfect build couldn't keep up. With the coin mech, builds supply
  ~x1.6 per deadline, which puts the brief's targets in reach while builds stay decisive.
- 2026-10-11 — Base values rebalanced (pops 0.6, Chute 4, Perimeter 3, Hole 1.8) and Feeding
  Bowl 4x -> 3x. — The Hole earned more than the whole Yard; Riot builds won 42% and Feeding
  Bowl sat in 90% of winning builds.
- 2026-10-11 — Overtime doubles tickets, coins and levels from Jobs but not Keys. — Two Keys
  from one Key Job would make JAILBREAK trivial.
- 2026-10-11 — Active charms fire through a recorded input field (slot 1-5, lockbar 6). —
  Keeps every ball replayable; Pocket Watch's half speed is presentation-only time scaling.
- 2026-10-11 — The Patron Saint Medal returns the round's first lost ball as an extra ball;
  Solitary Confinement counts "buy no balls" as buying only the free ones. — Simplest
  readings that keep the rules deterministic and testable.
- 2026-10-11 — No rolling resistance for a nearly stopped ball touching a post or bumper. — At
  half gravity the constant resistance acted like static friction on slopes under ~6 deg, so
  balls balanced on outlane post tops until the watchdog kicked them (0.5 per ball). Rescues
  fell from 1,395 to 30 per 2,400 soak balls.
- 2026-10-11 — Third Arm moved to (18.05, 26.4) against the column wall; Rubber Cement plugs
  got sloped tops that run over the outlane posts. — Both created new resting traps found by
  the variant soak (`npm run soak -- --sentences` now cycles hardware and kick mods too).
- 2026-10-11 — The bot shoots from cradles at once while a combo, hurry-up or RIOT is live,
  and taps the Third Arm when a ball sits on it. — What a player would do; without it the
  bot could never measure combo builds and stranded balls on the upper flipper.
- 2026-10-11 — The room uses its own retro shader; the machine does not. — Vertex snapping
  and affine wobble on the playfield made shots harder to read (pinball first). The cell
  carries the late-90s look; the frame-wide dither and palette crush tie them together.
- 2026-10-11 — Between balls the camera drops to the coin tray. — The Bonus count-up and
  the ball breakdown are the payoff beat; watching coins pile up says "pocket" better than
  a number, and the pile empties into the ATM, which makes depositing feel like a choice.
- 2026-10-11 — Last-second saves are detected from ball state in presentation (falling
  through the flipper gap, then up the table within 0.35 s) and slow the table to 0.3x for
  0.55 s of real time. — No rules or replay impact; a 4 s cooldown keeps it special.
- 2026-10-11 — Warden reactions during play wait 12 s between lines; tilt always speaks. —
  The Warden should comment, not narrate; the voice is off by default (speech synthesis
  varies a lot by browser).
