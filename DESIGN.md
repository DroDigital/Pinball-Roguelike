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

- [x] Retro renderer: HDR scene target (540p default; 360/240/180p stay in Settings), a
      dual-filter bloom, ACES, then a light retro stack (anti-banding dither, optional
      ordered dither and palette crush, grain, vignette; "Grain and dither" 35% by default);
      room surfaces keep vertex snapping to a chunky grid, affine texture wobble, a
      hard-falloff bare-bulb term and fog. The machine uses standard PBR materials with a
      PMREM reflection environment so the playfield always reads (see the visual overhaul)
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
- [x] Audio: a sample engine over a 164-file bank in `public/sfx` (procedural modal foley for
      the machine, CC0 uisfx and Kenney sounds for menus and stingers; live synthesis as the
      fallback), a mix with a reverb of a concrete cell, a glue compressor and limiter, music
      ducking and a muffle when the camera looks away from the machine; flipper thunk and
      coil hum, bumpers, a three-bar chime unit, coins that climb through combos, escalating
      combo and jackpot/PAYDAY fanfares, the hurry-up pulse, the door, ATM, vending, phone,
      endings; adaptive music (cell drone and clock that speeds with tension; table layers
      for combos, RIOT and Sentence rounds)
- [x] Juice: hit-stop on the Hole and PAYDAY, shake, flash, score pops, bulb swing, a coin
      fountain from the coin return into the tray (the pile is your pocket; the ATM takes
      it), a reaction to last-second saves (a ball dropping through the flipper gap sent
      back up; ~1 per 5 balls for the bot)
- [x] The Warden: lines on every cell screen plus reactions to play (center drain, big
      PAYDAY, RIOT, tilt, Job done, Sentence survived), rate-limited, as subtitles; an
      optional low, slow voice through the browser's speech synthesis (title screen toggle)

### M6 — Story and meta

- [x] The neighbor: knocking between rounds (subtitled), asking for coins, tickets or a
      charm and offering a Key, contraband, tickets or a tip; every answer is tracked
- [x] The Tunnel: the neighbor's tip reveals a secret shot (knock the Cell Block down from
      the top) that pays big on every later ball
- [x] JAILBREAK on Last Call with 3 Keys, started at the Hole: 4-ball multiball, five lit
      shots that relight when all are made, 12 to escape; the machine falls apart as you go
      (the outlane posts physically drop at 3, the lights die at 6, the glass cracks at 9);
      escaping ends the run on the spot, failing spends the Keys
- [x] Three endings as scripted camera sequences: Paid in Full (the door opens on a corridor
      of identical cells, each with a machine), Breakout (into the drain and out into
      daylight), Cellmate (the wall comes down)
- [x] Six inmates on a mugshot lineup, each with an upside and a downside; Hard Time 1-8
      per inmate, each level stacking on the last
- [x] Meta progression: 19 of 50 charms, five inmates and Endless start locked behind ten
      milestones; the Rap Sheet shows lifetime stats, the endings log, milestones and the
      collection of discovered charms, contraband and Sentences
- [x] Saves v2 with a v1 migration; the run autosaves at the start of every round and
      resumes from the title (Continue)
- [x] Tests: inmates, Hard Time, the neighbor, the Tunnel, JAILBREAK, endings, Endless,
      meta progression and save migrations; dev panel buttons for knocks, Last Call and
      each ending

### M7 — Polish

- [x] Onboarding: first-time hint notes for every screen and idea (flippers, plunger,
      nudge, Pocket, Jobs, buying, ATM, shop, phone, red calls, the neighbor, Lockup, RIOT,
      Sentences, Keys, actives), touch wording on touch screens, never blocking play
- [x] Settings (title and pause): volume per channel, Warden voice, shake, grain,
      resolution, text size, camera, reduced flashing, assist, vibration, hint notes, key
      rebinding; every control is a button so the flippers drive menus
- [x] Pause (Esc / Start / on-screen II): the table freezes; held buttons carry over
- [x] Accessibility: subtitles for the Warden and the neighbor, text size, reduced
      flashing, rebinding, Assist mode (0.8x table, +5 s ball save, flagged run)
- [x] Touch: menu taps no longer reach the flipper zones; on-screen lockbar and pause; compact
      panels on short screens. Gamepad: Start pauses, B / Back back out
- [x] Phone performance: a watchdog steps the resolution down one tier (540 -> 360 -> 240 ->
      180p, which also drops MSAA and bloom levels) whenever a device stays under 40 FPS for
      5 s. The drop is a runtime cap kept apart from the saved choice (`present/quality.ts`):
      a settings change keeps it, and only changing the resolution clears it. Draw calls
      (headless Chromium, SwiftShader, production build, the same flippers close-up): 64
      before the visual review (d22883a) and 64 after (ac4dfdb), 45k vs 44k triangles. No
      device FPS was measured: SwiftShader runs about 11 FPS here with the sim running, both
      before and after, so those numbers say nothing about a phone.
- [x] Instant replays of a ball's biggest moment (PAYDAY, SUPER PAYDAY, JAILBREAK, the
      escape) by deterministic re-simulation; bug reports (run + ball snapshot + inputs) from
      the pause menu, played back from the dev panel
- [ ] Balance pass at Hard Time 0 (partly met; see the calibration below)

M7 calibration (`npm run economy -- --mode physics --runs 40 --arch <a>`, then
`npm run economy:summary`; average bot, every archetype, Hard Time 0). Round 2, after the
payout and charm changes in the decisions log:

| build  | d1    | d4    | d8    | wins        | most common charms in its wins        |
| ------ | ----- | ----- | ----- | ----------- | ------------------------------------- |
| none   | 95.0% | 40.0% | 5.0%  | 2/40 (5%)   | no charms: the "average player" line  |
| random | 95.0% | 57.5% | 20.0% | 8/40 (20%)  | Roll Call Sheet, Brass Knuckles (50%) |
| bonus  | 95.0% | 55.0% | 25.0% | 10/40 (25%) | Cooked Books, Roll Call Sheet (80%)   |
| riot   | 95.0% | 55.0% | 22.5% | 9/40 (22%)  | Crowbar (89%), Feeding Bowl (78%)     |
| luck   | 95.0% | 57.5% | 17.5% | 7/40 (17%)  | Wishbone (100%), Candle Stub (86%)    |
| yard   | 95.0% | 50.0% | 12.5% | 5/40 (12%)  | Gold Filling, Jar of Teeth (100%)     |
| money  | 95.0% | 52.5% | 15.0% | 6/40 (15%)  | Piggy Bank, Stash Box (100%)          |
| lone   | 95.0% | 52.5% | 10.0% | 4/40 (10%)  | Spare Bearing, Solitary (100%)        |
| chute  | 95.0% | 55.0% | 10.0% | 4/40 (10%)  | Cracked Mirror, Oiled Hinge (100%)    |

Each archetype's wins are full of its own tag's charms, which is what the shop policy
buys. The brief's rule is about all winning builds together: pooled over the 55 winners,
the most common charm is Roll Call Sheet at 22%, and no charm is in more than half.

Against the Hard Time 0 targets: deadline 1 is at 95% (target ~90%); the no-charm average
clears deadline 4 at 40% (target ~35%); Bonus and Riot win 22-25% and Luck and Random 17-20%
(target ~20%), while Yard, Money, Lone and Chute win 10-15%; every archetype wins at least
5%; no charm dominates the pooled wins. Not yet met: deadline 1 and deadline 4 sit a few
points high, and the weakest focused builds are below the ~20% target. With 40 runs per
build a standard error is about 7 points, so the small gaps are not resolved. Round 1
(before the payout cut) cleared deadline 1 at 97.5% and won 0-40%.

Calibration notes: "average player" is read as the no-focus policy (no charms, no shop
spend beyond balls), which is the one the target describes. Money and Lone are the
weakest focused builds but both can win.

### M8 — Stretch

- [x] Daily Sentence: a date seed shared by everyone, with the day's local best
- [x] Seed sharing: typed seeds on the lineup, shared links that carry inmate and Hard Time
- [x] Offline PWA: manifest, icons, a service worker that precaches the shell and assets
- [x] README: running, controls, adding content, editing the table, dev panel, bot and tools

### M9 — Overhaul wave 1: UI/UX (branch overhaul/ui-r2)

- [x] Design system: tokens (colour, spacing, radii, type scale with floors), buttons, cards,
      chips, meters, key caps, focus ring, locked states that say why (`styles.css`, `widgets.ts`)
- [x] Fonts: Saira Stencil One, Inter 400/600/800, Special Elite (woff2 only), loaded before the
      UI shows; licences in `public/licenses/`, credited in Settings
- [x] Play HUD in the margins (landscape) / bands (portrait) / ribbon (between rounds); juice
      hooks `hud.banner`, `hud.count`, `hud.bump`, `hud.comboSlot`
- [x] Every screen redesigned: title, lineup, deadline intro, Jobs, buy, cell, ATM, vending
      cabinet, phone, red phone, knock, ball over, payment, Rap Sheet, settings, pause
- [x] Notice center (`notices.ts`): toasts, tips and captions share one reserved slot per
      layout; tips belong to screens and wait for the plunger on a portrait phone
- [x] Honest ball-over arithmetic (loose change carried in and kept), ATM buttons that say what
      they do to the debt, locked buttons reachable by flippers and gamepad
- [x] Menu cue names for the audio pass (`cues.ts`): hover, slider, close, toggleOn/Off
- [x] Screenshot tour at 1280x800, 390x844 portrait, 844x390 phone landscape and 130% text,
      console clean (`node tools/shots.mjs`, with `--size`, `--touch`, `--text`)
- [x] Flipper and gamepad reach locked buttons and get the reason (checked in a browser)
- [ ] Wire `cues.ts` to the richer cue set once the audio branch is merged (the UI already
      raises hover, slider, close and toggle cues; `AUDIO_CUE` maps them for now)
- [ ] `npm run e2e` not run on this pass (the balance sim holds the CPUs); the smoke flow and
      its HUD selectors are unchanged
- [ ] Unused font packages `@fontsource/bebas-neue`, `oswald` and `vt323`: not imported; remove
      them with an npm uninstall in the main checkout
- [ ] Juice pass on top of the hooks above

## Decisions log

- 2026-10-12 — Payout pass for Hard Time 0: base table payout x0.875 (SCORE.scale 0.2 to
  0.175), per-deadline payout growth 1.5 to 1.53; Feeding Bowl 3x to 2x; Jar of Teeth 3x to
  4x; Piggy Bank and Mattress interest 15% to 20%; Solitary Confinement 5x to 6x. — Round 1
  cleared deadline 1 at 97.5% and Riot won 40% of runs, against targets of ~90% and ~20%.
  The cut keeps late payouts roughly where they were, so deadlines 5-8 still need builds.
  Riot's Feeding Bowl was the dominant Riot charm (3x Hole); 2x keeps it useful.

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
  through the flipper gap, then up the table within 0.35 s). — No rules or replay impact;
  a 4 s cooldown keeps it special. (The slow motion they first triggered was removed, see
  below.)
- 2026-10-11 — Warden reactions during play wait 12 s between lines; tilt always speaks. —
  The Warden should comment, not narrate; the voice is off by default (speech synthesis
  varies a lot by browser).
- 2026-10-11 — The neighbor knocks at a round break with 30% odds, at most once per
  deadline, from deadline 2, and asks for something you have where possible. Coins come
  from the Pocket, then the Bank. — "Sometimes" with a real choice each time; around three
  or four knocks in a full run, which is what Cellmate needs (at least 3, all helped).
- 2026-10-11 — The secret shot is the Tunnel: the Cell Block knocked down top to bottom. It
  only pays once the neighbor has told you. — A real pinball-style hidden rule that rewards
  aim, built from switches the table already has; gating it on the tip makes the tip worth
  something and keeps random clears (1 in 6 orders) from paying it.
- 2026-10-11 — JAILBREAK runs until the last ball drains, not until one ball is left; its
  five lit shots relight once all are made. — Twelve shots is a long wizard mode; a lone
  last ball fighting on is the most tense part of it. The falling-apart steps change the
  physics (posts) as well as the presentation, so the mode gets harder as you near the door.
- 2026-10-11 — JAILBREAK keeps the brief's 12 shots but saves balls for 15 s plus 4 s per
  lit shot, and the bot aims at lit shots during it. — With a flat 10 s save the expert bot
  made 3.8 lit shots on average and never got out. The bot aims poorly (about two major
  shots a minute), so its numbers are a floor: with the new save it averages 4.6 (p90 8)
  and the average bot escapes now and then. Breakout is meant to be the hardest ending.
- 2026-10-11 — Cellmate's twist: the cell next door is yours, down to the tally marks, and
  someone starts knocking behind you. — Unsettling and loop-shaped; the neighbor's lines
  ("I would have said no too", "You always trust me, eventually") were written toward it.
- 2026-10-11 — Locked content: 19 of the 50 shop charms, five inmates and Endless, over ten
  milestones. Every archetype tag keeps unlocked charms from the first run. Balance tools
  assume everything is unlocked (a returning player). — About a third, as briefed, without
  making any build impossible early.
- 2026-10-11 — Hard Time advances per inmate on any win at your highest level; Endless runs
  don't advance it. Endless unlocks on any win. — Matches "unlocked per inmate by winning
  at the previous level"; Endless has no win to count.
- 2026-10-11 — The run autosaves at the start of each round and resumes there; a save from
  another version of the run rules is dropped rather than migrated. — Round start is the one
  point where the run state alone describes the screen. Meta progress (the part players
  care about) is migrated.
- 2026-10-11 — Quitting mid-ball forfeits that ball, and the run autosaves after every ball.
  — Otherwise quitting would undo a bad drain (save-scumming), and a roguelike's bad ball
  has to stick.
- 2026-10-11 — Seeded and daily runs use the full charm collection. — A seed must play the
  same for everyone it's shared with; locked charms would change the shops. Random-seed
  runs keep the player's locks, so progression still matters where nobody compares.
- 2026-10-11 — Menus are buttons only (steppers instead of sliders). — The flippers drive
  every menu (pinball-cabinet style), and the same buttons work for touch and gamepad.
- 2026-10-11 — Instant replays re-simulate the recorded ball from its snapshot instead of
  storing frames. — Determinism makes it free (a few hundred KB of inputs at most), and the
  same path plays back bug reports.
- 2026-10-11 — A Perimeter orbit spots the next top lane, and a new Bonus charm (Roll Call
  Sheet) makes every Hole shot light one. — The bot crossed the top lanes 1.35 times per
  ball (mostly the plunge itself): the lanes sit where the ball rarely goes, so lane sets,
  the Bonus multiplier and the award relight hardly ever happened, and Bonus builds won 0%.
  Spotting lanes is a classic rule and needs no geometry change; the charm turns the most
  common shot into the Bonus engine for players who build for it.
- 2026-10-11 — Archetype buffs from the 40-run calibration: Chipped Abacus starts every ball
  at x2; Crooked Penny and Solitary Confinement became uncommon; Candle Stub gives luck on
  every ball; the interest charms went to 15%; Rubber Bands to +8 s; Solitary pays 5x. —
  Luck, Money and Lone builds won 0-2.5%: their payoffs were rare or too small to matter
  against x2.4 debt. The economy tool's Lone policy now skips buying balls with Solitary,
  as a player would.
- 2026-10-12 — Visual overhaul of the machine: crisp 540p HDR render with bloom and a PMREM
  environment, a high-resolution printed playfield (about 52 px per ball diameter, 1035 x
  2026), translucent inserts that warm up and cool down like filaments, solid wireform
  habitrails, a backbox with a backlit glass and a glowing DMD, and warm GI bulbs. — The old
  240p dithered look made the machine muddy and noisy; the machine is now the one bright,
  saturated thing in a dark cell, and only the room keeps the chunky retro shader.
- 2026-10-12 — Bloom stays honest: broad environment panels stay at or below 1.0, long trims
  use a satin chrome, clear plastics and the printed field use rough reflections, the bare
  bulb is a position (not a real light) and only two GI point lights are real. — Hot specular
  glints on chrome and clearcoat read as lens-flare blobs once bloom is on, and every real
  light costs fragment time on phones. Only lit inserts, flashers, bumper caps, the DMD and
  the ball's glints go past the bloom threshold.
- 2026-10-12 — The backbox is taller (DMD above the glass' base, both above the cabinet's
  rear edge) and the cameras frame it. — The cabinet's rear rail hid everything under world
  y 5.3, including the DMD.
- 2026-10-12 — Visual juice hooks live on the presentation objects, not in the rules:
  `table.flashPart / fireFlasher / giPulse / flashLamp`, `backbox.pulseGlass`,
  `renderer.bloomPulse` and `LampShowPlayer.play`, with a "Visual FX" folder in the ?dev
  panel to try each one. With Settings > Reduced flashing on, each is capped: flashes hold
  steady, sweeps and chases slow to at most one step a second (under three state changes
  a second per lamp, checked by `tests/present/lampshow.test.ts` over every show), the
  JAILBREAK sag holds steady and dim, and the bloom and insert pulses are small. — Lamp
  shows, Slow/Fast inserts and the flasher domes used to strobe at 4-16 Hz regardless of
  the setting; the review found that the claim was false. Flashes now fade and Slow/Fast
  breathe on smooth curves in every mode, so no square wave reaches the screen.
- 2026-10-12 — The JAILBREAK sag and the decaying bulb use a slow swell (about 0.4 Hz) whose
  depth is re-rolled once per cycle, not a per-frame random dip. — Per-frame random blackouts
  flashed roughly nine times a second, which breaks the reduced-flashing promise.
- 2026-10-12 — The Seated and Title cameras fit the table's height as well as its width (the
  play view's contract), so the flippers and drain stay in frame at 16:10 and 16:9. — The
  width-only fit cropped the flippers.
- 2026-10-12 — Blackout lights are a fixed pool of two point lights kept in the scene at zero
  intensity. — Showing or hiding a light changes the shader's light count, which recompiles
  every material at that moment. The endings corridor still adds its
  lights when the ending starts (one recompile at that point; open).
- 2026-10-12 — The steel ball has a broader sheen and a darker tint, the reflection room's
  softbox is smaller and the bare bulb in it is dimmer (about 3.5 instead of 9). The
  printed field's clear coat is rougher. — Point-light speculars and HDR reflections peaked
  into white discs that bloom then turned into light sources. A lit Ball Save insert still
  glows hot close to the camera, which is intended.
  Screenshots for the visual review are in `screenshots/overhaul/visuals/`: the 17-shot tour
  at 1280x800, four phone frames at 390x844, playfield close-ups, and the flasher and lamp
  show frames in the play camera with reduced flashing off and on.
- 2026-10-12 — Nothing on the playfield may read as a second ball: flasher domes are mostly
  see-through with a warm bulb inside, and the plunger runs out through the cabinet front to
  a chrome knob that slides with the pull. The frame walls carry printed pinstripe bands with
  the machine's name, so the cabinet is never a black slab above the painted body. — Pale
  opaque domes were mistaken for balls in the play view; the plain frame wall was the largest
  unfinished surface in the tray and ball-end shots.
- 2026-10-12 — Art that uses web fonts repaints once they can be drawn to a canvas (cabinet
  textures, coin-door legend, backglass); otherwise the first paint used a fallback face
  until something forced a repaint. On narrow screens the title and seated cameras back off
  until the whole machine fits the width.
- 2026-10-12 — Sound is a bank of mono mp3 samples plus a sample engine, with live synthesis
  kept as the per-sound fallback and for the music. The machine's foley is synthesised
  offline (modal resonators, filtered noise, sub thumps) by `tools/build-sfx.mjs` rather than
  downloaded; only menus, stingers and chip accents are recordings (CC0 uisfx and Kenney).
  — kenney.nl, freesound, opengameart and pixabay were unreachable, and the machine needs
  hundreds of tiny, tuned, variant-rich hits that a seeded generator gives for ~1 MB and a
  reproducible build. Better recordings drop in by name (see the build script's header).
- 2026-10-12 — The machine's sounds sit on a `table` bus that is low-passed and wetted when the
  camera looks away from it (ATM, phone, vending, wall, trapdoor fall); menus and the cell
  stay on the `sfx` bus. — Hearing the machine through the wall is the point of the cell;
  the UI must stay crisp wherever the camera is.
- 2026-10-12 — Payout sounds are tiered on a shot's worth in points (amount / `SCORE.scale`),
  not on coins: a quiet coin tick for pops, lanes and drop targets, a coin and a low bar for
  the Hole and outlanes, a ladder note for the Chute, Perimeter and Cell Block, and a bright
  coin with a second note for combo-chained or levelled shots; bursts back off so a pop-bumper
  rally stays a texture. `npm run audio:payouts` shows the split on bot balls. — The first
  version gated on one whole coin, and with the 0.2 scale nothing a bot ball earned reached
  it, so the core payout loop was silent. The tiers live in `src/present/sfx-payout.ts`, not in
  balance.ts, because they are presentation tuning that must not change the economy.
- 2026-10-12 — The machine's foley is built to carry on a laptop or phone speaker: every hit has
  a body at 150-500 Hz and a crack at 600-3000 Hz, and the sub-bass is capped. `npm run
sfx:build` fails if a hit loses more than 6.5 dB of its loudest 100 ms behind a 180 Hz
  high-pass. The flipper coil hum is a 120 Hz saw (its harmonics are what a small speaker
  plays) rather than a bare 60 Hz sine. — Most players hear the game on small speakers or
  earbuds; the first foley pass was 98% below 250 Hz and would have read as vague thuds.
- 2026-10-12 — The replay knocker is kept for PAYDAY, the extra ball and the super skill shot;
  jackpots, RIOT and JAILBREAK starts use the kicker's slam and a boom, a ball save is only a
  swoosh, bells and the feed solenoid, and fanfare layers start 30-60 ms apart. — A sound that
  is everyone's reward is nobody's; the stacked version was one block of mush.
- 2026-10-12 — The generated sound files are dedicated to the public domain (CC0 1.0), like the
  CC0 recordings they ship beside, and the upstream licence texts ship verbatim in
  `public/sfx/`. — The repository has no licence file of its own to point at.
- 2026-10-12 — Audio levels are set per class at build time (tools/build-sfx.mjs, active RMS
  with one -1 dBFS peak ceiling); manifest gains are relative intent on top. — Peak-normalised
  files left the contacts 10-20 dB under the groove, and gains were carrying the whole balance.
  audio:check fails if a ball contact sits more than 8 dB under the flippers.
- 2026-10-12 — The table's sound mixing constants (FOCUS trims, MUSIC_TRIM, the live-ball groove
  step, duck depths, voice pools in `src/present/`) are presentation tuning, not gameplay, so
  they live beside the sound code rather than in `src/content/balance.ts`. Gameplay tunables
  stay in balance.ts. — The mix is measured by audio:check, not by the sim.
- 2026-10-12 — Every press is sounded once by a document-level listener (sfx-controls.ts): a
  toggle clicks on or off, a stepper ticks, a disabled control buzzes, and a screen can name its
  cue with `data-cue`. Screens do not wire their own clicks. — One rule set is easier to keep
  consistent across the menus than a call in each button.
- 2026-10-12 — The reverb is fed only while a wet sound can still be heard (plus its 1.7 s
  tail), so an idle table costs no convolver. — Phones pay for a convolver they are not using.
- 2026-10-12 — UI overhaul: one design system (`styles.css` tokens, `widgets.ts` kit, inline
  SVG icons) with Saira Stencil One for titles and big numbers, Inter for everything read,
  Special Elite for notes and the Warden. Screens are pure view builders in `screens.ts`;
  `game-app.ts` keeps the flow. — The old uppercase monospace boxes carried every screen the
  same way; the loop's decisions (what to deposit, what to buy, what a Sentence does) needed
  hierarchy, one primary action and plain-language explanations.
- 2026-10-12 — The play HUD sits in the margins beside the table (two columns), in a top
  and bottom band on portrait phones, and shrinks to a status ribbon between rounds; it never
  covers the playfield. Debt vs Bank vs Pocket is one bar. Tips, captions and toasts share
  one notice area (right margin while playing, a strip under the panel in menus). — The core
  loop is "bank enough before the deadline", so that bar is the HUD's spine. Juice hooks for
  later passes: `hud.banner()`, `hud.count()` / `hud.bump()` (count-up numbers), `hud.comboSlot`.
- 2026-10-12 — A locked button stays clickable and says why (error cue plus a toast); the
  flippers and the gamepad reach it after the usable buttons. — A silently disabled button
  teaches nothing, and the reason (not enough tickets, slots full) is the useful part of the
  screen; players on flippers deserve it as much as the mouse.
- 2026-10-12 — The HUD publishes where its bands end (`--band-bottom` under the portrait play
  band, `--ribbon-bottom` under the between-rounds ribbon) with a ResizeObserver, and notes,
  toasts and panels position from those. Panels are size containers: a narrow panel with
  several actions drops the key hints and gives the buttons the whole footer row. The right
  column lists the passive charms you own beside the active ones' charge pips. — Fixed pixel
  guesses for the band height broke at large text sizes (chips over the debt row, a clipped
  ribbon); measuring costs nothing per frame.
- 2026-10-12 — Notices are one center, not three widgets: `notices.ts` owns a queue and a
  per-layout capacity (three in the right margin while playing, a toast beside a note in a
  menu strip, one at a time on phones). A toast jumps the queue, a caption beats a tip, and
  what is bumped returns with its time left. Tips carry the screens they belong to and are
  dropped when the game moves on; on a portrait phone they wait for the plunger so they never
  sit over a live ball. — Stacked toasts hid panel titles and HUD cards on phones, and tips
  outlived their screen. One owner of the slot makes "never covers anything" checkable.
- 2026-10-12 — Panels do not repeat the ribbon: the cell, ATM and payment screens show only
  what the ribbon cannot (the verdict, what is still owed). Shop cards are about 120 px with
  the price in the corner; a sticky jump row appears only when the panel scrolls. — The same
  three numbers three times cost 150 px and pushed Contraband and Sell below the fold.
- 2026-10-12 — The ball-over tally shows the loose change carried in and kept. —
  `finishBall` floors the total and carries the fraction, so Table + Bonus alone looked 0.7
  short of "Into your Pocket".

- 2026-10-12 — The ATM's terminal ledger (Bank, Pocket, Still owed) goes; its panel shows one
  verdict line from the same sentence the Cell uses, above the deposit and loan controls. —
  The ribbon already shows those figures, and repeating them pushed the loans off screen.
- 2026-10-12 — The ball-over tally ends in a Total row when loose change is involved: Table +
  Bonus + carried change = Pocket + kept. The fraction is shown as "Kept for next ball", never
  dropped. — Settled numbers add up on screen, not just in the rules.
- 2026-10-12 — In play on a portrait phone a toast is one line under the top band, so it
  covers as little of the table as it can; menus keep their wrapping strip. — A two-line toast
  over the top of the table hid the top lanes.
- 2026-10-12 — The short-landscape layout shrinks the panel title and reserves 58 px for notes,
  so a two-line tip clears the footer's buttons. — Tips overlapped the Done and Reroll row.
- 2026-10-12 — `tests/app` typechecks in the browser project (DOM lib), not the Node-tools
  project. — Its notices test imports `src/app`, so the tools config failed on DOM names.
