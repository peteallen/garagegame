# Beep Beep Garage Project Guide

Beep Beep Garage is a Vite-powered, full-window canvas game for a three-year-old. The player directs toy cars from the roadside into an outdoor garage apron, moves them between bays, and sends them home. The experience must remain readable without words, forgiving under imprecise toddler taps, free of failure states, and comfortable on an iPad in landscape.

The main loop and input routing live in `src/game/Game.js`. `src/game/world/Garage.js` owns the world layout, bay and road hit zones, validated route construction, and environment rendering. `src/game/entities/Vehicle.js` owns each car's state and procedural overlays, while `src/game/core/VehicleMotion.js` follows cubic driving paths and validates their curvature and heading continuity. Icon-only controls live in `src/game/ui/Hud.js`, and small safe car surprises live in `src/game/actions/vehicleSurprises.js`.

## Movement is a contract

Every vehicle movement must start with `vehicle.drive()` and flow through `motion.follow()`. Player-issued maneuvers first pass through `Game.scheduleMovement()`, which keeps a parking maneuver and a road exit from occupying the shared crossing at the same time while allowing movement combinations proven safe by the overlap matrix. Do not bypass that command-level reservation. `validateMotionPath()` checks minimum turn radius, continuous joins, and real reversing through `direction: -1`. Never make a path work by disabling validation, weakening its tolerances, directly sliding a vehicle, or rotating it in place while it translates. A rejected path means the route geometry must be corrected. Cars are solid to one another and coordinate locally through `Game.motionBlocked()`.

The only direct vehicle pose assignment in normal play is the final snap performed by `parkVehicleInstant()` after a validated path has reached its bay. That snap aligns the completed route with the canonical parking pose; it is not permission to teleport through a maneuver.

## Sprite registration is a contract

Vehicle sprites are strict top-down, point nose-right, and contain one body each. The physical catalog dimensions in `src/game/entities/vehicleCatalog.js` are also the painted-body dimensions. `SPRITE_PX_PER_UNIT` is `2` and `SPRITE_OVERHANG` is `6`; `scripts/process_art.py` centers the body and adds that transparent margin, and `Vehicle.drawBody()` draws the result at `(-length / 2 - 6, -width / 2 - 6, length + 12, width + 12)`. Do not stretch art to disguise a registration mismatch. Adjust the catalog to honest body measurements when necessary, then regenerate and verify the sprite.

Faces, steerable wheels, wipers, trunks, flashes, glows, and lights remain procedural overlays. The police light-bar shape is part of its body sprite, but the flashing color is procedural. Every sprite remains optional because the game must still render a usable procedural fallback when assets are unavailable.

## Assets and audio are gated

`src/game/core/assetManifest.js` is the source of truth for every shipped sprite, voice line, and recorded sound effect. Final files live under `public/assets/sprites`, `public/assets/voice`, and `public/assets/sfx`. The same keys must also appear in the relevant generation tables in `scripts/gen_voice.py` and `scripts/gen_sfx.py`. `npm run check:assets` checks the manifest in both directions, validates vehicle PNG dimensions, and checks literal source references. `npm run build` always runs that gate before producing the Vite bundle.

`SoundEngine` owns the shared Web Audio context, mute persistence, master gain, limiter, and synthesized fallbacks. `Sfx` loads recorded effects, and `Voice` loads the three vehicle voice registers. Call recorded effects through `game.playSfx(key, fallback)` and spoken lines through `game.say(key, vehicle)`. Sound must remain functional without the recorded pack, and the entire audio stack must continue across a hot reload through `Game.adoptRuntime()`.

## Toddler-facing behavior

There is no score, loss condition, reading requirement, or dead end. When a compatible bay is open and no car is already waiting, the game automatically brings one new car in from the road and keeps it available for the player to direct. There is no entrance door, bell, or arrival button. Parking, reparking, road exits, and booth pickups remain player-caused. Automatic arrival is driven by parking availability, not by an idle timer. Timers may create harmless parked-car charm, but they must never create vehicle problems or pickup requests. Service-station trips, tow rescue, and an all-done celebration are deferred; do not expose their dormant routes or pretend those features work. The tow truck must not appear as a decorative prop or unexplained tap target: its sprite, hit area, routes, and controls stay hidden until a complete, validated rescue mechanic ships. Station assets and hit zones follow the same rule.

Do not add visible controls, props, indicators, or interaction affordances for behavior that is not complete. Remove unfinished UI from the playfield and bring it back only when its full interaction is ready. Arrival, parking, reparking, collision-free movement, direct exits, and booth pickups are the product priority; polish those basics before expanding a deferred feature.

The game persists parked and waiting cars, the next vehicle identifier, and day or night mode in `localStorage` under `beep_beep_garage_state`. Mute uses `garage_muted`. Saved-state changes should remain schema-safe and must not resurrect moving paths midway through a maneuver.

## Local development and deterministic checks

Install dependencies with `npm install`, then keep `npm run dev` running on port `5173`. Vite hot module replacement rebuilds the `Game` class while preserving saved state and the unlocked audio stack. Avoid starting a second server on a fallback port; identify and replace a stale listener so the play-test URL stays stable.

Keep the local HMR page playable throughout implementation and verify each coherent behavior there as soon as it changes. Push small, tested slices to `main` frequently so the GitHub Pages build remains available for tablet play-testing instead of batching unrelated work into one late release.

The live instance is available as `window.__garageGame`. Add `?debug` to draw collision bodies, tap zones, paths, and hit areas. Browser tabs may pause `requestAnimationFrame`, so deterministic checks should advance the real game loop directly:

```js
for (let i = 0; i < 600; i += 1) window.__garageGame.update(1 / 60);
```

Clear `localStorage` and reload for a fresh world. Acceptance checks should cover automatic roadside arrival on a fresh world, replenishment when another compatible bay becomes available, parking, both repark directions, concurrent yielding with zero body overlap, direct road exit, booth pickup, day and night, and the one-shot parked-car idle charm. Confirm that no door, arrival button, cat, tow truck, or unfinished station affordance is visible or interactive. Do not inspect a removed vehicle's retained test object as though it were still colliding; count overlap only while both objects remain in `game.vehicles`.

Before a push, run `git diff --check` and `npm run build`. When public paths or deployment behavior changed, also run `GITHUB_PAGES=true VITE_ASSET_VERSION=test npm run build`. Keep `dist`, `node_modules`, browser snapshots, local secrets, `.DS_Store`, and Python caches out of commits.

## Deployment

The source of record is `main`, and the public game is `https://peteallen.github.io/garagegame/`. Pushing with `git push origin HEAD:main` triggers `.github/workflows/pages.yml`. The workflow builds with the source commit as `VITE_ASSET_VERSION`, writes `dist/version.json`, force-pushes the built site to `gh-pages`, and requests a branch-based Pages build. `VersionWatcher` compares the live version file and reloads stale clients when a newer build appears.

A deployment is not verified merely because the source push succeeded. Confirm that the workflow is green, `gh-pages` advanced, the latest Pages build reports `built`, the live `version.json` matches the source commit, and the live HTML references the new bundle. Preserve unrelated working-tree changes and never commit credentials or generated deployment output.
