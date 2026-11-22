# Smart Ranch — analysis of the 3D prototype and plan for the React Native clone

Source analysed: `Smart Ranch — 3D World.html` (5 465 lines, ~450 KB, single file, three.js r128 from a CDN).
Target: a standalone **mobile app** (Expo SDK 58 / React Native 0.88 / TypeScript), without the 3D world.

## 1. What the HTML file contains

| Block (file lines) | What it is | In the mobile clone? |
|---|---|---|
| CSS 7–600 | HUD, inspection panel, satellite HUD, **phone UI** (≈ 300 lines), AI chat, sheets | Phone UI only → React Native styles |
| 01 CORE (690–925) | three.js renderer, sky, helpers | No (3D) |
| 01b CROP LIBRARY (926–1038) | 24 crops with FAO-56 data (Kc, root depth, p, salt tolerance), 3 soils, default crops, prefs | **Yes** → `src/data/crops.ts` |
| 02a–02c WORLD (1040–1940) | terrain, vegetation, technical room, well, tank, pipes, 12 parcels (layout, sprinklers), leaks | Only the **data**: parcel geometry, leak sites |
| 02d WaPOR (1941–2110) | simulated FAO WaPOR layers (ETa, stress, RSM, biomass), satellite pass | **Yes** (logic + 2D map) |
| 03 FARMER (2111–2320) | avatar, walking, 3rd-person camera | No |
| 04 STATIONS/SIM (2322–2866) | stations, labels, minimap, **farm simulation** (`simStep`), irrigation queue, leak protection | **Yes** (simulation only) |
| **04b MOBILE APP (2867–3627)** | **the phone app**: shell, 5 tabs, 8 sub-screens, notifications, bottom sheet | **Yes — this is the product** |
| **04d AI AGRONOMIST (3628–3957)** | Claude chat with tools + offline rule-based expert, voice | **Yes** |
| 04c SATELLITE VIEW (3958–4112) | camera rising above the farm, 3 layers | Re-done as a 2D satellite screen |
| 05–10b MODELS/STUDIO (4113–5400) | detailed 3D models of equipment, inspection studio | No |
| 11 LOOP (5400+) | render loop, boot | Replaced by a 4 Hz JS tick |

## 2. Product description (the app being cloned)

Smart irrigation for a small Tunisian farm: a solar pump fills an elevated tank, water flows by gravity through main valve **V0** and flow meter **D0**, then valves **A** (Field A, parcels A1–A6) and **B** (Field B, parcels B1–B6). Each parcel has one soil-moisture sensor and 2 low-pressure sprinklers (8.4 L/min per parcel). A server runs at most N parcels at once (rotation queue). Leak protection compares D0 flow to the expected flow and shuts the pump + valve. Crop thresholds follow FAO-56, satellite data follows FAO WaPOR, and an AI agronomist (“Ranch AI”) can read the farm and act on it.

### Screens and features

1. **Home** — leak card (detected / emergency shutdown / isolated / repaired), hero with weather and live parcel map (colour = moisture vs the crop target, blue outline = irrigating, tap a parcel), “Smart irrigate N” button, AI briefing button, 6 KPIs (water used + sparkline, tank, energy/battery, well salinity, flow D0, WaPOR ETa), 6 remote toggles (V0, A, B, well pump, auto irrigation, leak protection).
2. **Parcels** — Field A / Field B switch, summary (optimal / need water / irrigating / sensors), one card per parcel (ring gauge, crop, status chip, target band, sparkline, quick irrigate/stop). **Parcel detail**: ring, crop bar (change crop sheet), 60-min moisture chart with target band + irrigation shading + trigger line, 8 info rows (valve, crop need, WaPOR, stress, salt check…), duration chips (recommended / 15 / 30 / 45), start/stop CTA, AI advice, satellite, tip.
3. **Assistant (AI)** — chat, suggestion chips, tool use (get status, crop info, irrigate, stop, set crop, smart irrigate all, auto mode, satellite pass), offline rule-based expert in EN/FR/Derja keywords, text-to-speech, dictation.
4. **WaPOR** — product switch (ETa / Stress / RSM / Biomass), per-parcel pixel map with legend, 4 KPIs, ETa-vs-ETp history chart, per-parcel list, new satellite pass, satellite view.
5. **More** — grid of sub-screens:
   - **Irrigation plan**: parcels under trigger, ordered by urgency, scheduled in rotation (start/end clock, litres), run plan, ask AI, auto mode.
   - **Water budget**: used vs daily budget (slider 500–4000 L), per-parcel used-vs-need chart, savings vs furrow, solar energy, productivity, leak losses.
   - **Crop library**: search + group chips, **crop sheet** (water need, trigger, Kc, roots, salt, tip, plant on parcels).
   - **Alerts**: notification log, leak log, clear all. Unread badge on bell and nav.
   - **Settings**: soil (3), parcels at once (2/3/4), auto irrigation, dry alerts, leak protection, AI tier, voice, default crops, reset.
   - **Demo scenarios**: leak, drought, auto, salinity, satellite pass, satellite view, olive grove, AI briefing, reset.
6. **Notifications** — iOS-style banners (max 2) + persistent list; kinds: leak, water, dry, salinity, satellite, ok.

### Core models (to keep identical)

- Trigger = `WP + (1 − p)(FC − WP)`; band = trigger … `FC − 3`; `zEq` maps moisture to a crop-relative scale (10 wilting / 40 trigger / 58 field capacity) used for colours and status (dry < 25, low < 40, ok ≤ 61, wet).
- `ETc = Kc_mid × RET`; litres/day = `ETc × area / 0.75`; recommended minutes = `ceil((target − hum) / 1.25)` clamped 5–60.
- Salt: `ECe = 1.5 × ECw`, `loss = b × (ECe − threshold)`; `ECw = salinity / 0.64`.
- Simulation unit: **1 real second = 1 game minute** (clock starts 08:00). Moisture, tank (`±/3000`), solar, battery, leak detection (3.5 s of mismatch), history (1 point per game-minute, 90 kept).
- WaPOR per parcel: `ETa = ETc × Ks × noise`, `stress = ETa/ETp` (stressed < 0.75), NPP, biomass, BWP; farm means weighted by area; a new pass every 110 game-minutes.

### Data that is simulated (no backend in the original)

All sensor, flow, tank, solar, WaPOR and weather values are generated in the page. Only prefs (`smartRanch.v4`) are persisted (localStorage). Claude access exists only inside claude.ai artifacts (`window.claude`).

## 3. Decisions for the React Native clone

| Topic | Original | Clone |
|---|---|---|
| UI tech | DOM + CSS + canvas | React Native + `react-native-svg` (all charts/maps/icons are SVG) |
| State | global mutable objects + `innerHTML` rebuilds | one mutable simulation module (`src/sim`) + `zustand` UI store; a 250 ms tick bumps a counter, screens re-render |
| Navigation | tab + sub-screen flags | same model in the UI store (no router needed: 5 tabs, sub-screens, sheet, satellite modal); Android back button handled |
| Persistence | localStorage | AsyncStorage (prefs), SecureStore (API key) |
| AI | `window.claude.sample` with tools | direct Anthropic Messages API with the same tools (user key in Settings) → **offline expert fallback** (ported 1:1). Production should use a small backend proxy. |
| Voice | Claude TTS / dictation | `expo-speech` for reading replies; dictation planned (phase 2) |
| 3D world, farmer, studio, 3D satellite | three.js | **Out of scope**; 2D **Satellite screen** (Real / Moisture / WaPOR layers + animated pass) replaces the 3D sky view. “Walk there / take me there” buttons are removed; leak repair becomes “Send technician”. |
| Language | English | English (strings centralised later for FR/AR) |

## 4. Architecture

```
src/
  data/       crops.ts (24 crops, soils) · farm.ts (parcel geometry, leaks) · icons.ts (SVG paths)
  lib/        format.ts · colors.ts (moisture/WaPOR palettes)
  sim/        types · state (mutable farm) · helpers (zone maths) · engine (simStep, actions, WaPOR, notify)
  store/      ui.ts (zustand: nav, banners, toast, prefs hydration)
  ai/         offline.ts (rule-based expert) · tools.ts · claude.ts (Messages API tool loop) · chat.ts
  ui/         theme · Icon · Ring · charts (Spark, ZoneChart, WapHist, BudgetChart) · maps · primitives
  screens/    Home · Parcels · ZoneDetail · Assistant · Wapor · More + subs · Satellite
App.tsx       shell: status bar, header, body, bottom nav, banners, toast, crop sheet, game loop
```

## 5. Delivery plan (phases)

1. **Foundation** (done in this repo) — project, data, simulation engine, UI store.
2. **Core screens** — Home, Parcels, Parcel detail, More + sub-screens, notifications.
3. **Intelligence** — Assistant (offline expert + Claude), WaPOR screen + satellite screen.
4. **Verification** — `tsc`, web render check, simulation unit checks.
5. **Next** (not started): real backend/MQTT for sensors, push notifications (expo-notifications), dictation, FR/AR i18n, EAS builds, tests (jest), widgets, offline cache, auth.

## 6. Known gaps vs the original (deliberate)

- No 3D world / farmer / equipment studio.
- Satellite “view” is a 2D map, not a camera flight.
- Claude replies are not streamed (typing indicator, then full text).
- Dictation not implemented.
