# Smart Ranch — mobile app (React Native / Expo)

Mobile clone of the *Smart Ranch — 3D World* prototype (phone app part only). See `docs/ANALYSIS_AND_PLAN.md`.

```powershell
npm install
npx expo start          # scan the QR code with Expo Go (SDK 58) or press w for web
npx tsc --noEmit        # typecheck
```

- Simulation: `src/sim` (1 real second = 1 game minute, 4 Hz tick).
- AI agronomist: offline expert by default; add an Anthropic API key in **More › Settings** to use Claude with tools.
- Builds: `npx eas-cli@latest build -p android` (needs an Expo account).
