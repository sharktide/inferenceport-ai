# InferencePortAI

AI, anywhere — a lightweight Electron app for running and managing local models and Hugging Face Spaces.

This repository (InferencePortAI) is an Electron + TypeScript desktop app that provides a UI for working with local LLM models (via Ollama) and browsing/sharing Hugging Face Spaces. It exposes APIs to the renderer through a **secure preload script** and ships a full **marketplace and chat UI**.

## Key features

- List, run, pull, and delete local Ollama models.
- Stream chat/token responses from models to the renderer.
- Save/load chat sessions to the user's application data folder.
- Manage Hugging Face Spaces and website cards from the UI.
- Extensive marketplace for exploring models and spaces.

## Security & Privacy

This project is designed with privacy and local control in mind. Important security and privacy guarantees:

- Zero data collection by default — the app does not phone home, collect usage analytics, or transmit your conversation history to any external servers. All chat history and sessions are stored locally in the user's application data directory.
- Local-only model execution — Ollama-backed models run locally on your machine (when Ollama is installed). Model inference and token-streaming are handled through local IPC and child processes; no model inputs or outputs are forwarded to third-party services unless you explicitly configure integrations that do so.
- Secure renderer surface via `preload.ts` — the web renderer runs the UI inside a sandboxed renderer; a minimal, explicit API is exposed through `contextBridge` (`window.ollama`, `window.utils`, `window.hfspaces`). This prevents arbitrary system access from renderer scripts.
- IPC/event hygiene — the main process implements explicit IPC handlers (see `node-apis/`) rather than broad channel exposure. Renderer code must call named, whitelisted methods; events are emitted only for intended consumers.
- Optional network integrations are explicit — features like launching a Space or opening a URL explicitly call out to the specified website.
- If you have any privacy and/or security concerns, please email sharktidedev@gmail.com


## Quick start (development)

Prerequisites:

- Node.js (recommended: 23+)
- npm
- TypeScript installed globally

Typical workflow:

1. Change to src:

```
cd src
```

1. Install dependencies:

```powershell
npm install
```

2. Start the TypeScript watcher:

```powershell
npm run watch
```

3. Launch the app:

```powershell
npm start
```

Notes:

- `npm run watch` will run a autocompile watcher for public facing TypeScript, but if files in the main process are ediited, you will have to close the app and re-run ``npm start``
- `npm start` runs the `clean` script, compiles, launches Electron, then runs `clean` again.

## Packaging / Release

Build a distributable with:

```powershell
npm run build
```

This uses `electron-builder` and the configuration in `package.json` (see `build` section). Windows targets include NSIS, MSI, APPX and ZIP; macOS target is DMG and Linux target is AppImage. The APPX publisher and display name are already configured in `package.json`.

## Project structure

- `main.ts` — Electron main process: creates BrowserWindow, sets menu, and registers IPC handlers.
- `preload.ts` — Exposes safe, typed APIs to renderer via `contextBridge` (see `window.ollama`, `window.utils`, `window.hfspaces`).
- `node-apis/` — Node-side IPC handlers and utilities used by the main process:
  - `ollama.ts` — Ollama integration (list/pull/run/delete models, streaming chat tokens, progress events).
  - `spaces.ts` — Helpers for Hugging Face Spaces and website cards.
  - `utils.ts` — Misc utilities (open URL, markdown parse, file save, getPath helpers).
- `public/` — Renderer static files and UI pages (index, marketplace, settings, help, assets, styles).
- `renderer/` — Renderer pages and TypeScript scripts used by the web UI.
- `scripts/` — build/development helper scripts (e.g., `clean.js`).

Type definitions for the exposed APIs are in `global.d.ts` and mirrored by the `preload.ts` bridge.

## Exposed renderer APIs (summary)

The preload exposes these top-level objects on `window` for renderer code:

- `window.ollama` — methods like `listModels()`, `runModel(name)`, `deleteModel(name)`, `pullModel(name)`, streaming helpers `streamPrompt()` and events `onResponse`, `onError`, `onDone`, and session persistence helpers `load()`/`save()`.
- `window.utils` — helpers such as `web_open(url)`, `markdown_parse_and_purify(markdown)`, `saveFile(path, content)` and `getPath()`.
- `window.hfspaces` — helpers for fetching and sharing HF Spaces cards and website cards.

See `global.d.ts` and `preload.ts` for full signatures.

## Development notes & tips

- If TypeScript reports errors during `npm run compile`, run the two `tsc` commands separately to see which side (main vs renderer) is failing:

```powershell
tsc -p tsconfig.main.json
tsc -p tsconfig.renderer.json
```

- To debug renderer code, open the Developer Tools from the app menu (View → Toggle Developer Tools) or use the keyboard accelerator (Ctrl+Shift+I on Windows).

- The app stores chat sessions under the application's user data directory (see `app.getPath('userData')`) — `main.ts` registers a `session:getPath` handler to expose that path.

- The project expects the Ollama CLI / runtime to be available if you want to actually run local models. If Ollama is not installed or reachable, Ollama-related IPC actions will fail — the UI should surface errors via `window.ollama.onError`.

## Troubleshooting

- Electron fails to start: ensure a supported Node/Electron version is installed. This project declares Electron in `devDependencies`.
- TypeScript build errors: check type definitions and installed `@types/*` packages. Running `tsc` directly often shows more precise errors.
- Packaging errors with `electron-builder`: check the `build` config in `package.json` (publisher/identifiers for platform-specific targets). On Windows, APPX building requires a valid certificate; NSIS/MSI packaging generally works locally.

## Contributing

Contributions are welcome. Open an issue or pull request on the repository. Keep changes small and include TypeScript types and tests where appropriate.

## License

   Copyright 2025 Rihaan Meher

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
