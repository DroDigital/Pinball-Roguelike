# Ball & Chain

A single-player pinball roguelike for the browser. You wake chained to a stool in a rusted
cell in front of **DEBTOR'S PRISON**, a battered late-70s pinball machine. An ATM shows what
you owe the Warden. Bank enough coins before each deadline, or the trapdoor under the stool
opens.

Built with Vite, TypeScript (strict), Three.js and Planck.js. The music is generated in code;
the sound effects are a small bank (under 1 MB) of synthesised foley and CC0 recordings, rebuilt
by `npm run sfx:build` and credited in [CREDITS.md](CREDITS.md). The 3D machine (playfield
print, plastics, inserts, cabinet) and the room are procedural; the menu frames, HUD metal,
backglass print and title logo are drawn in code on 2D canvases (`src/present/artwork/`), with
vector item icons from [game-icons.net](https://game-icons.net) (CC BY 3.0, see
[Artwork & UI system](#artwork--ui-system)). [DESIGN.md](DESIGN.md) holds the design, the
milestone checklist, calibration numbers and the decisions log; [CLAUDE.md](CLAUDE.md) holds the
architecture rules and conventions.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173  (add ?dev for the dev panel)
npm run build      # typecheck + production build into dist/ (installable, plays offline)
npm run preview    # serve the production build
```

## Play

Each run is 8 deadlines of 3 rounds. Each round:

1. Take a Job from the ATM.
2. Buy balls (the first is free).
3. Play them on the table. Coins land in your Pocket.
4. Deposit at the ATM. Deposits are final and earn interest.

When the deadline comes, the Bank pays the debt, or the floor opens. After a paid deadline
the phone rings with a perk, or a red call with a devil's bargain. The vending cabinet sells
charms (for tickets) and contraband (for coins); charms change how the table pays and plays.

| Action   | Keys                                 | Gamepad                    | Touch                                |
| -------- | ------------------------------------ | -------------------------- | ------------------------------------ |
| Flippers | Z / Slash, Shift L / R, arrows       | bumpers / triggers         | left / right half of the screen      |
| Plunger  | hold Space or Down, release to fire  | A (right stick for analog) | drag down in the bottom-right corner |
| Nudge    | X (up), C (left), V (right)          | Y, d-pad left / right      | three fingers                        |
| Lockbar  | B (first charged active charm), 1-5  | B                          | LOCKBAR button                       |
| Look     | A / D between balls                  | left stick                 |                                      |
| Pause    | Esc                                  | Start                      | II button                            |
| Menus    | flippers move, Space / Enter selects | bumpers move, A selects    | tap                                  |

Keys can be rebound in **Settings**, which also has volume per channel, shake, grain,
resolution, text size, camera, reduced flashing, hint notes and **Assist mode** (a slower
table and a longer ball save).

- **Skill shot:** tap a flipper while the ball sits in the shooter lane to move the lit lane,
  then pull the plunger to the white mark.
- **Table modes:** every second top-lane set starts **Double Time** (the playfield pays x2,
  then x3); 30 pop bumper hits start a **Yard Brawl** (every switch pays extra); 40 spinner
  spins light a **Contraband Crate** at the Perimeters (a mystery award); clearing the Cell
  Block during a RIOT brings **Reinforcements** (an extra ball).
- **Lineup:** pick an inmate. More inmates, Hard Time levels 1-8 and Endless unlock as you
  play, along with a third of the charms.
- **Saves:** the run autosaves at every round start and after every ball; **Continue**
  resumes it.
- **Daily Sentence:** one shared seed per day, with your best for the day.
- **Rap sheet:** your lifetime stats, endings, milestones and everything you've found.

URL options:

- `?seed=ABC&inmate=brawler&ht=2` plays a shared run. The Rap Sheet's **Copy seed link**
  makes one.
- `?bot=novice|average|expert` lets the bot play your balls.
- `?dev` opens the dev panel.

## Develop

```sh
npm run typecheck  # browser, Node-safe and tools projects
npm run lint
npm run format
npm test           # Vitest: rules, every charm and contraband item, scenarios, replays, saves
npm run e2e        # Playwright: builds, serves, plays a bot ball, checks the console,
                   # writes screenshots/
```

`src/core`, `src/sim`, `src/rules`, `src/content` and `src/bot` are Node-safe (no DOM, no
Three.js) and run headless in the tests and tools. The sim emits events, the rules turn them
into game events and machine commands, and the presentation reacts. Every gameplay number
lives in `src/content/balance.ts`; table geometry lives in `src/content/table.ts`.

### Adding content

All content is data in `src/content/`. Add an entry and the shop, phone, ATM and tests pick
it up. Each new charm and contraband item needs a test in `tests/rules/charms.test.ts`.

- **Charms** (`charms.ts`): `id`, `name`, `rarity`, `cost` (tickets), `tags` (the
  archetype, which drives the shop's glow), `text`.
  - Static effects go in `fx` (multipliers multiply, additions add; see `CharmFx`).
  - Charms with buttons get `active: { charges, per, action }`.
  - Behaviour hooks go in `src/rules/charm-hooks.ts`:
    - per ball, in `BALL_HOOKS[id]`: `hitMult`, `onHit`, `onSetComplete`, `paydayMult`,
      `onPayday`, `forceBounce`, `riotSave`, ... through the narrow `BallRules` interface;
    - per run, as checks of `owns(run, id)` in `src/rules/run.ts`.
  - Hardware charms set `fx.mount` to a tag that enables tagged parts in `table.ts`.
  - To lock a new charm behind a milestone, list it in `unlocks.ts`.
- **Contraband** (`contraband.ts`):
  - Fields: `id`, `name`, `text`, and a price (`price` in coins, `ballPrices`, or
    `debtPrice`), plus `target: 'shot' | 'charm'` if it needs one.
  - Its effect goes in `useContraband` in `src/rules/shop.ts`; a "next ball" effect also
    goes in `RunState.pending`.
- **Sentences** (`sentences.ts`): `id`, `name`, `text`, `tier` (1 mild to 3 harsh) and an
  `effect`:
  - sim mods (`flipperStrength`, `ballMass`);
  - table tags to add or remove;
  - ball-context flags;
  - economy changes (`ballPriceMult`, `drainDebt`).

  Run `npm run soak -- --sentences` after adding physical ones.

- **Jobs** (`jobs.ts`):
  - Fields: a `stat` from `BallStats`, `mode` (`sum` over the round or best single ball),
    `target` (`scaled` follows the debt curve), and a `reward` (tickets, coins, a shot
    level, or a Key for `key` Jobs).
  - New stats are counted in `TableGame`.
- **More data:**
  - `inmates.ts`: starting loadouts and their upside and downside;
  - `hard-time.ts`: difficulty levels;
  - `phone.ts`: perks and red-call bargains;
  - `dialogue.ts`: the Warden's lines, at least five per trigger;
  - `neighbor.ts`: the voice through the wall;
  - `hints.ts`: first-time notes;
  - `unlocks.ts`: milestones;
  - `lampshows.ts`: light sequences.

### Editing the table

`src/content/table.ts` defines DEBTOR'S PRISON as data. One unit is one ball diameter;
`y` points up the table.

- **Parts:** walls (polylines with a material and a look), posts, flippers, pop bumpers,
  slings, the drop-target bank, the spinner, line-crossing triggers (oriented so the
  expected crossing reads `+1`), wire and ramp transports, the Hole, the kickback, and lamp
  inserts.
- **Tags:** parts with a `tag` only exist when the ball's tags include it. That is how
  hardware charms, Sentences and contraband change the table.
- **Preview:** `npx tsx tools/table-preview.ts [--tagged] [--labels]` renders
  `tools/out/table.svg` and `.png`.
- **Checks:** after a change, run `npm test`, `npm run feel` and `npm run soak`. If shots
  moved, run `npx tsx tools/calibrate-shots.ts` to re-measure the bot's cradle shots.

### Artwork & UI system

All UI frames, documents, the backglass print and the title logo are painted in code with the
2D canvas API (`src/present/artwork/`); there are no static image downloads at runtime. The 3D
machine (playfield print, plastics, inserts, wireforms, cabinet, backbox) is built in
`src/present/` (`table-view.ts`, `playfield-art.ts`, `plastics-art.ts`, `cabinet.ts`,
`inserts.ts`, `flashers.ts`, `materials.ts`), rendered by `renderer.ts` (HDR, bloom, an
environment map):

- **Framework & Kit:** `src/present/artwork/kit.ts` provides reusable drawing primitives
  (metal plates, hex screws, chamfers, recesses, CRT scanlines, paper grain, metallic gradients,
  hazard stripes, and drop shadows).
- **Metal Frames:** `src/present/artwork/metal.ts` (title panel, ATM terminal, cell hub, shop
  cabinet, phone panel, red-call panel, pause panel, settings panel).
- **Paper & Clipboard Sheets:** `src/present/artwork/sheets.ts` (booking dossier, deadline notice,
  job ticket, buy-balls panel, ball receipt, rap sheet, neighbor letter, ending panel).
- **HUD Bezels:** `src/present/artwork/hud.ts` (score/DMD panel, coin ledger, status rack).
- **Backglass Print:** `src/present/artwork/machine.ts` (the Warden behind bars, chains and the
  machine's name, with a quiet lower strip where `backglass.ts` lights the live shot ladders;
  the sunburst Warden art stands in until the print is ready).
- **Title Logo:** `src/present/artwork/logo.ts` (metallic brass/bone bevels, chrome steel ball,
  and chain links).
- **Item Icons:** Crisp inline SVG icons for all 65 charms and contraband items (`src/app/icons.ts`,
  `src/app/icon-paths.ts`), sourced from [game-icons.net](https://game-icons.net) (CC BY 3.0 by
  Lorc, Delapouite and contributors) via `tools/make-icon-paths.mjs`.
- **Menu Screens:** Mark a panel `data-skin="<screen>"` (a key of `SCREEN_ART`) and `UI.mount`
  places controls inside the frame's content window (`src/app/skin.ts`, `src/app/skin.css`).
  Put the heading on the frame's label plate with `data-slot="head"` (rect in `HEAD_RECT`).
- **HUD:** `src/app/hud.ts` lays out the play HUD: columns beside the table in landscape, a band
  above and a strip below it on portrait phones, never over the playfield. `hud.css` dresses
  its cards as the skin's riveted metal bezels with CRT figures.
- **Notices and feedback:** toasts, tips and the Warden's captions share one queue that shows one
  message at a time where it covers nothing (`src/app/notices.ts`); menu sounds come from
  `data-cue` (`src/app/cues.ts`); locked buttons stay reachable by the flippers and say why
  they are locked (`button()` in `src/app/widgets.ts`); numbers count up (`src/app/counter.ts`).
- **Loading & Cache:** `src/present/art.ts` draws critical textures on demand and the rest in
  idle time (at most 100 ms apart) as Blob URLs. The service worker (`public/sw.js`) precaches
  the application shell, its fonts and the sample bank for full offline play.
- **Exporting Art Sheets:** `node tools/art-sheet.mjs` renders all canvas artwork to disk under
  `tools/out/art/`.
- **Screenshots:** `SHOT_DIR=screenshots/screens npx playwright test e2e/screens.spec.ts`
  captures every screen at desktop and phone sizes.

### Dev panel (`?dev`)

- **Time:** slow motion, pause and frame stepping.
- **Balls:** spawn (shift-click on the table), serve and clear balls.
- **Run:**
  - give coins, tickets, Keys, charms or contraband; force a Job or a Sentence; light
    Lockup;
  - restock the shop, skip a deadline, trigger the trapdoor, a knock, Last Call with 3
    Keys, or any ending;
  - play back a bug report from the clipboard (the pause menu copies one: the run, the
    ball's snapshot and its recorded inputs).
- **Physics tuning:** applies to the next ball, or push it to the live one.
- **View:** collider and trigger overlay, frame-time graph, camera.

### The bot and the balance tools

The bot (`src/bot/`) plays real balls on the real physics at three skill levels: cradles,
aimed shots, nudge saves, the skill shot, active charms. It also runs attract mode.

```sh
npm run feel                          # feel targets (flipper response, shot windows, ball time)
npm run soak -- --balls 10000         # physics soak across workers: tunnelling, escapes, stuck balls
npm run soak -- --sentences           # the same, cycling hardware, Sentences and contraband
npm run botstats                      # per-ball stat distributions per skill -> tools/out/botstats.json
npm run economy -- --mode physics --runs 24 --arch riot   # whole runs, every ball played
npm run economy:summary              # pool every archetype's report: win rates, charm dominance
```

`economy` options:

- `--arch` picks a shop policy: `none`, `random`, `yard`, `chute`, `riot`, `bonus`, `luck`,
  `money` or `lone`.
- `--skill` sets the bot skill; `--inmate` and `--hard 0-8` set the inmate and Hard Time.
- `--red` accepts red-call bargains; `--loans` borrows to cover a shortfall.
- `--mode sampled` draws ball earnings from botstats instead of playing them (fast but rough).

The report shows clear rates per deadline, win rate and the charms in winning builds.
Calibration history is in DESIGN.md.

## Credits and licences

The game's text is set in free fonts, bundled as woff2 files (npm `@fontsource/*`) and credited
in Settings:

- [Inter](https://github.com/rsms/inter) (SIL Open Font License 1.1): body text
- [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) and
  [Oswald](https://fonts.google.com/specimen/Oswald) (SIL Open Font License 1.1): headings,
  buttons and plates
- [VT323](https://fonts.google.com/specimen/VT323) (SIL Open Font License 1.1): CRT figures
- [Saira Stencil One](https://github.com/Omnibus-Type/Saira) (SIL Open Font License 1.1): the
  machine's printed lettering and banners
- [Special Elite](https://fonts.google.com/specimen/Special+Elite) (Apache License 2.0): notes,
  tips and the Warden's lines

The licence texts ship in `public/licenses/` (served at `/licenses/` in a build).
