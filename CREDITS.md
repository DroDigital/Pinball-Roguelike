# Credits

Ball & Chain ships a small sample bank in `public/sfx/` (164 mono mp3 files). Every file is rebuilt from its sources by `npm run sfx:build`. 36 are CC0 (public domain) recordings that were trimmed, filtered, pitched and levelled with ffmpeg; the other 128 are original synthesis by DroDigital (repository owner, github.com/DroDigital), rendered 2026-10-12. Attribution is not required by CC0, but the authors are credited here anyway.

## Sources

- **uisfx 0.4.0 (npm: uisfx), semantic UI sound effects**: Romain Simon (Yuki Capital), uisfx.com. Licence: CC0-1.0 (audio; the package code is MIT). https://github.com/romainsimon/uisfx
- **Kenney "Digital Audio" (subset), kenney.nl**: Kenney (kenney.nl). Licence: CC0-1.0. https://kenney.nl/assets/digital-audio
- **Procedural foley**: synthesised by `tools/lib/foley.mjs` (modal resonators, filtered noise and
  sub thumps; seeded and deterministic). Author: DroDigital (repository owner, github.com/DroDigital). Rendered 2026-10-12. No
  third-party audio. Dedicated to the public domain under CC0 1.0 Universal like the recordings above.

The game also synthesises music, ambience beds and a few effects live with the Web Audio API
(`src/present/music.ts`, `src/present/sfx-synth.ts`); those are original too.

The upstream licence texts ship verbatim in `public/sfx/` (`LICENSE-uisfx.txt`,
`LICENSE-kenney.txt`) next to `public/sfx/LICENSE.txt`, which states the terms of the rest.

## Rebuilding

The recordings are not committed. Stage them once under `.cache/sfx-src/staged/` (gitignored):

1. uisfx 0.4.0: `npm pack uisfx@0.4.0`, extract it, and copy the cue files into
   `staged/uisfx/<pack>/<cue>.mp3` for the twelve packs (arcade, cinematic, dreamy, glass,
   mechanical, minimal, organic, rubber, scifi, soft, studio, zen).
2. Kenney Digital Audio (CC0): download the pack from https://kenney.nl/assets/digital-audio and copy
   the wav files listed in `tools/lib/sfx-sourced.mjs` into `staged/kenney-digital/`.
3. `npm run sfx:build` (or `SFX_SRC=/path/to/staged npm run sfx:build`).

`tools/lib/sfx-sources.json` records the SHA-256 of every recording used. A build warns when a
staged file differs from that record, so a rebuild can be checked against the shipped bank.

## uisfx 0.4.0 (npm: uisfx), semantic UI sound effects

Romain Simon (Yuki Capital), uisfx.com. Licence: CC0-1.0 (audio; the package code is MIT).

| File | Source file | Processing |
| --- | --- | --- |
| `ui-move.mp3` | `mechanical/focus.mp3` | `atrim=0:0.13,afade=t=out:st=0.100:d=0.03`, level -24 dBFS |
| `ui-hover.mp3` | `mechanical/hover.mp3` | `atrim=0:0.15,afade=t=out:st=0.120:d=0.03`, level -24 dBFS |
| `ui-tick.mp3` | `mechanical/press.mp3` | `atrim=0:0.07,afade=t=out:st=0.050:d=0.02`, level -24 dBFS |
| `ui-slider.mp3` | `mechanical/snap.mp3` | `atrim=0:0.1,afade=t=out:st=0.070:d=0.03`, level -24 dBFS |
| `ui-select.mp3` | `mechanical/select.mp3` | level -20 dBFS |
| `ui-back.mp3` | `mechanical/back.mp3` | level -20 dBFS |
| `ui-open.mp3` | `mechanical/open.mp3` | level -20 dBFS |
| `ui-close.mp3` | `mechanical/close.mp3` | level -20 dBFS |
| `ui-error.mp3` | `mechanical/error.mp3` | level -20 dBFS |
| `ui-buy.mp3` | `mechanical/purchase.mp3` | level -20 dBFS |
| `ui-sell.mp3` | `mechanical/refund.mp3` | level -20 dBFS |
| `ui-deposit.mp3` | `mechanical/checkout.mp3` | level -20 dBFS |
| `ui-reward.mp3` | `mechanical/reward.mp3` | level -20 dBFS |
| `ui-toggle-on.mp3` | `mechanical/toggle-on.mp3` | level -20 dBFS |
| `ui-toggle-off.mp3` | `mechanical/toggle-off.mp3` | level -20 dBFS |
| `ui-lock.mp3` | `mechanical/lock.mp3` | level -20 dBFS |
| `ui-unlock.mp3` | `mechanical/unlock.mp3` | level -20 dBFS |
| `ui-success.mp3` | `mechanical/success.mp3` | level -20 dBFS |
| `ui-warning.mp3` | `mechanical/warning.mp3` | level -20 dBFS |
| `ui-notify.mp3` | `mechanical/notification.mp3` | level -20 dBFS |
| `ui-pause.mp3` | `mechanical/pause.mp3` | level -20 dBFS |
| `ui-resume.mp3` | `mechanical/play.mp3` | level -20 dBFS |
| `st-achievement.mp3` | `cinematic/achievement.mp3` | level -18 dBFS |
| `st-levelup.mp3` | `cinematic/level-up.mp3` | level -18 dBFS |
| `st-bonus.mp3` | `cinematic/bonus.mp3` | level -18 dBFS |
| `st-reward.mp3` | `cinematic/reward.mp3` | level -18 dBFS |
| `st-warning.mp3` | `cinematic/warning.mp3` | level -18 dBFS |
| `st-error.mp3` | `cinematic/error.mp3` | level -18 dBFS |
| `st-lock.mp3` | `cinematic/lock.mp3` | level -18 dBFS |

## Kenney "Digital Audio" (subset), kenney.nl

Kenney (kenney.nl). Licence: CC0-1.0.

| File | Source file | Processing |
| --- | --- | --- |
| `ss-coin.mp3` | `coin2.wav` | `lowpass=f=5200`, level -22 dBFS |
| `ss-coin-hi.mp3` | `coin5.wav` | `lowpass=f=5200`, level -22 dBFS |
| `ss-upgrade.mp3` | `upgrade4.wav` | `lowpass=f=4600`, level -22 dBFS |
| `ss-secret.mp3` | `secret4.wav` | `lowpass=f=4200`, level -22 dBFS |
| `ss-lose.mp3` | `lose4.wav` | `lowpass=f=3000`, level -22 dBFS |
| `ss-gameover.mp3` | `gameover4.wav` | `lowpass=f=2400,asetrate=44100*0.84,aresample=44100`, level -22 dBFS |
| `ss-crumble.mp3` | `explosion2.wav` | `asetrate=44100*0.79,aresample=44100,lowpass=f=2400,highpass=f=50`, level -22 dBFS |

## Procedural foley (original, DroDigital (repository owner, github.com/DroDigital), 2026-10-12)

Generated by `tools/lib/foley.mjs`:

`flip-up-1.mp3`, `flip-up-2.mp3`, `flip-up-3.mp3`, `flip-down-1.mp3`, `flip-down-2.mp3`, `flip-hit-1.mp3`, `flip-hit-2.mp3`, `flip-hit-3.mp3`, `pop-1.mp3`, `pop-2.mp3`, `pop-3.mp3`, `sling-1.mp3`, `sling-2.mp3`, `sling-3.mp3`, `drop-1.mp3`, `drop-2.mp3`, `drop-3.mp3`, `drop-reset.mp3`, `spin-1.mp3`, `spin-2.mp3`, `spin-3.mp3`, `switch-1.mp3`, `switch-2.mp3`, `rubber-1.mp3`, `rubber-2.mp3`, `rubber-3.mp3`, `metal-1.mp3`, `metal-2.mp3`, `metal-3.mp3`, `metal-4.mp3`, `plastic-1.mp3`, `plastic-2.mp3`, `plastic-3.mp3`, `wood-1.mp3`, `wood-2.mp3`, `wood-3.mp3`, `ball-ball-1.mp3`, `ball-ball-2.mp3`, `plunger-tick-1.mp3`, `plunger-tick-2.mp3`, `plunger-tick-3.mp3`, `launch-1.mp3`, `launch-2.mp3`, `knocker-1.mp3`, `knocker-2.mp3`, `drain-1.mp3`, `drain-2.mp3`, `tilt.mp3`, `warn.mp3`, `hole-1.mp3`, `hole-2.mp3`, `kick-1.mp3`, `kick-2.mp3`, `kick-3.mp3`, `lock.mp3`, `chute-1.mp3`, `chute-2.mp3`, `bell-c.mp3`, `bell-e.mp3`, `bell-g.mp3`, `toll-1.mp3`, `toll-2.mp3`, `coin-1.mp3`, `coin-2.mp3`, `coin-3.mp3`, `coin-4.mp3`, `coin-5.mp3`, `coin-spin-1.mp3`, `coin-spin-2.mp3`, `coin-tray-1.mp3`, `coin-tray-2.mp3`, `coin-tray-3.mp3`, `coin-tray-4.mp3`, `coin-tray-5.mp3`, `coin-shower-1.mp3`, `coin-shower-2.mp3`, `cash.mp3`, `cash-count.mp3`, `boom-1.mp3`, `boom-2.mp3`, `riser-1.mp3`, `riser-2.mp3`, `whoosh-1.mp3`, `whoosh-2.mp3`, `alarm.mp3`, `door-clang-1.mp3`, `door-clang-2.mp3`, `door-lock.mp3`, `creak-1.mp3`, `creak-2.mp3`, `creak-3.mp3`, `chain-1.mp3`, `chain-2.mp3`, `chain-3.mp3`, `knock-1.mp3`, `knock-2.mp3`, `knock-3.mp3`, `trapdoor.mp3`, `fall.mp3`, `phone-ring.mp3`, `phone-pick.mp3`, `atm-key-1.mp3`, `atm-key-2.mp3`, `atm-key-3.mp3`, `atm-key-4.mp3`, `atm-ok.mp3`, `atm-no.mp3`, `cash-out.mp3`, `vend-coin.mp3`, `vend-spiral.mp3`, `vend-drop.mp3`, `glass-crack-1.mp3`, `glass-crack-2.mp3`, `rubble.mp3`, `drip-1.mp3`, `drip-2.mp3`, `drip-3.mp3`, `pipe-1.mp3`, `pipe-2.mp3`, `far-door.mp3`, `clock-1.mp3`, `clock-2.mp3`, `m-kick.mp3`, `m-snare.mp3`, `m-hat.mp3`, `m-ohat.mp3`, `m-rim.mp3`, `m-tom.mp3`
