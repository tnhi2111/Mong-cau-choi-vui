# Handoff for Claude Code — Mong-chi-choi-vui

A birthday gift website: an interactive 3D love story (Vite + React + TypeScript +
React Three Fiber). The owner (writes in Vietnamese — **reply in Vietnamese**) is making
it for their wife. Live at **https://tnhi2111.github.io/Mong-chi-choi-vui/**.

## Working agreement (from the owner)

- **Every push to `main` deploys to GitHub Pages** (~1 min, `.github/workflows/deploy.yml`).
  The owner has been asking for work to be committed and pushed straight to `main`
  once it is tested. There are no feature branches.
- Don't stop at "it compiles": build, open it in a browser, look at screenshots,
  compare with the reference images the owner sends, fix, re-test.
- Content (names, birthday password, letter, photos) is still placeholder text —
  don't invent it; the owner will provide it. Password is `01/01/2000` for now.

## The story (what the viewer sees)

1. **Intro** — no heart yet: light swirling in a flat ring (6 concentric bands) under
   where the heart will be, a few points wandering, dim starry sky.
2. **First touch** — the points rise on spirals into a 3D **heart of light**
   (~3.2 s) with a "gathering light" sound; the sky brightens; background points light
   up; a **golden retriever puppy of light** assembles beside the heart (waving a paw,
   wagging tail). The ring under the heart goes dark and is **redrawn band by band**
   like comets, smallest first (~8 s), then its words return. Afterwards it only spins.
3. Two more touches → heartbeats → **password gate** → welcome → **gift room**
   (5 gifts on a ring, 3D, each opens a memory page) → finale.
- **Dragging anywhere turns the camera around the whole scene** (intro, room, finale);
  left alone, the world slowly turns by itself. The owner explicitly wants this 360°
  "whole world moves together" behaviour everywhere.
- Progress lives in `sessionStorage` (30 min cap): reload keeps her place, closing the
  tab starts over. `?reset` restarts, `?quality=low|medium|high`, `?nogl` (2D fallback),
  `?debug` exposes `window.__gl` / `window.__scene` for QA scripts.

## Where things are

| What | File |
| --- | --- |
| Texts, password, heart style/words, sound, music | `src/config/birthday.ts` |
| Gifts / memories | `src/data/gifts.ts` |
| Stage flow, taps, sound triggers | `src/App.tsx` |
| One canvas, lights, per-stage worlds | `src/components/3d/Scene3D.tsx` |
| Intro scene (heart, ring, puppy, camera orbit) | `src/components/3d/IntroWorld.tsx` |
| Heart of light (dormant ring → gathered heart, surface flow) | `src/components/3d/ParticleHeart.tsx` |
| Heart wrapper (beat, hover, assembly clock) | `src/components/3d/Heart3D.tsx` |
| Ring under the heart (bands, reveal, drip, words) | `src/components/3d/HeartVortex.tsx` |
| **Puppy shape** (SDF shapes, ears, face, bib, paws, tail) | `src/components/3d/dogModel.ts` |
| Puppy rendering/animation (wave, wag, occluder body) | `src/components/3d/LightDog.tsx` |
| Camera rig (springs, orbit) / drag input | `CameraRig.tsx`, `src/hooks/usePointerOrbit.ts` |
| Gift room / gifts / finale | `RoomWorld.tsx`, `Gift3D.tsx`, `FinalWorld.tsx` |
| Sky, stars, bokeh, shooting star | `Atmosphere.tsx` |
| Synth sound (chimes, hover, gather, thump) | `src/lib/audio.ts` |

**Gotcha:** React Three Fiber v9 copies `uniforms` passed as a JSX prop, so animated
custom shaders must be built with `useShader()` (`src/components/3d/useShader.ts`) —
never `<shaderMaterial uniforms={…} />`.

## Where the last session stopped

Last request from the owner:
> the ears still look like circles stuck together — make them flat 3D ears hanging down
> like a golden retriever's.

Done in `dogModel.ts`: each ear is now ONE shape (`kind: 'ear'`, `sdEar`) — a thin sheet
hung from a curved spine (`earX`/`earZ`, `EAR_TOP`→`EAR_BOTTOM`), leaf-shaped width
(`earW`: narrow root, widest ~60 % down, round bottom), thickness `earT`, turned from
facing outward at the root to half-forward below (`earTurn`), edges curled in
(`EAR_CUP`). On top: a bright rim round each flap and 5 strands down its face (in
`buildDog`, "ears" section) — a figure of light reads a shape by its outline. Occluders
for the ear are flat discs along it. Waving paw (toes, pads, gaps) unchanged from before.

**Puppy run (latest request — replaced the earlier spin-on-the-spot trick):** the owner
said the spin looked stiff and asked for the puppy to run on four legs round the heart,
with every leg joint moving like a real dog's. Touching the puppy (invisible hit sphere in
`LightDog`, only once the heart is formed; never counts as a heart tap) now plays:
stand up (the sitting points flow onto a standing body) → one **gallop** lap of an oval
round the heart (speed up, cruise, slow down; tongue out, ears flapping) → back on its
spot, sit down facing her → one "woof" (`sound.bark()`) → tongue stays out, paw stays
down (no more waving), tail wags. Tapping again repeats it.
- `dogRun.ts`: the standing puppy and its skeleton (chest, hips, head, tail, 3 segments
  per leg). `bindRun()` gives every sitting point a place + bone(s) on the standing body
  (head/bib/tail rigidly offset; trunk and legs re-laid on standing shapes and paired by
  region — points carry `part`/`paw` tags from `dogModel.ts`). `poseRun(phase, speed)` =
  transverse gallop (hind pair, front pair, flight), planted feet that slide back exactly
  at body speed (`RUN_SPEED`), 2-bone IK per leg (elbows bend back, stifles forward),
  wrist/hock fold in the swing, spine flex, body pitch/bounce, head steadying.
- `LightDog.tsx`: GPU skinning (`uBones`, `aRun`, `aBoneA/B/W`), `uPath` (position/heading
  on the lap + lean into the curve), `uRun` blends sit ↔ run; lap timing at the top
  (`STAND`, `ACCEL`, `DECEL`, `SIT`, `LAP_DEPTH`, `MIN_LAP_WIDTH`). Occluder body is off
  while running. Reduced motion: no run, just bark + tongue.
- QA hooks (any build): `window.__dogT = seconds` holds the trick at a moment;
  `window.__dogPose = { phase, speed, yaw }` shows the running pose on the spot (side-view
  filmstrips of the gait were made this way; helper scripts in `qa-output/`).

QA after this change (cloud, no GPU): see the latest commit message. `qa:perf` taps until each touch counts; without a GPU its "main
thread blocked" number is noise (240–3000 ms on old and new commits alike) — trust it
only with `--gpu`. The owner has been sent close-ups of the new ears — waiting for feedback.

Ideas the owner may ask for next (not requested yet): ears even closer to the photo
(slimmer, wavier fur fringe at the bottom), the puppy turned so the tail shows from
the default view, real names/photos/letter.

## Running & testing

```bash
npm ci
npm run dev                  # http://localhost:5173
npm run build && npm run preview   # http://localhost:4173 (QA scripts use this)
npm test                     # password logic
# Playwright QA (needs a Chrome: set CHROME_PATH; on the owner's Windows PC:
#   CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"; add --gpu for the real GPU)
node scripts/qa.mjs --gpu --size=1440x900            # whole story, screenshots → qa-output/
node scripts/qa.mjs --gpu --size=390x844 --mobile
node scripts/qa.mjs --gpu --size=1440x900 --reduced
node scripts/qa.mjs --size=1440x900 --nogl
node scripts/qa-visual.mjs --gpu [--only=heart] [--size=390x844 --mobile]  # hero/ring/room shots
node scripts/qa-keyboard.mjs
node scripts/qa-qr.mjs
node scripts/qa-perf.mjs --gpu                       # entering the room must not stall
```

`qa-output/` is git-ignored (screenshots and a few throwaway helper scripts live there).
Close-up puppy shots were made by loading `?reset&debug`, tapping the centre, waiting
~7 s, then setting the puppy group's `rotation.y` via `window.__scene` and screenshotting
a clip at `deviceScaleFactor: 4`.
