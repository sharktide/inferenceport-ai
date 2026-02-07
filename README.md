![InferencePortAI logo](/src/build/banner.png)
![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcdn.jsdelivr.net%2Fgh%2Fsharktide%2Finferenceport-ai%40main%2Fsrc%2Fpackage.json&query=%24.version&label=Latest%20Version) [![Build](https://github.com/sharktide/inferenceport-ai/actions/workflows/build.yml/badge.svg)](https://github.com/sharktide/inferenceport-ai/actions/workflows/build.yml) ![Website](https://img.shields.io/website?url=https%3A%2F%2Finferencs.js.org) ![GitHub last commit](https://img.shields.io/github/last-commit/sharktide/inferenceport-ai) ![GitHub License](https://img.shields.io/github/license/sharktide/inferenceport-ai)




The best place for enterprise local model management

InferencePortAI provides a simple, privacy-focused interface for running local models, chatting with models, saving sessions locally, and browsing or launching Hugging Face Spaces and websites.

**Highlights**
- Run local models with streaming responses.
- Save and load chat sessions locally.
- Browse and open Hugging Face Spaces and website cards.
- Simple marketplace UI for discovering models and Spaces.

## Now introducing: InferencePort 2
InferencePort 2 is packed with new features, each going to be released incrementally. Here's what we have in store:

1. InferencePort Server Hosting - Host your own server and allow authenticated users to connect to it ✅ Released in v2.0.0
2. Styling and navigation enhancements
3. In-Chat Code Execution via Custom Tools
4. Model Response Editing, Regeneration, and Deletion
5. Model Download Cancellation
6. Enterprise Organization Management
7. WebUI for chatting in the browser
8. Toggle between local models and AI execution on our servers
... and more!

## Quick start (user)

Requirements:
- Node.js 18+ (for development), or use the packaged app for end users.
- (Optional) Ollama installed and available on your machine to run local models.

To run the app in development:

```powershell
cd src
npm install
npm run watch
npm start
```

To build distributables:

```powershell
npm run build
```

The packaged app provides installers for Windows, macOS, and Linux (see `package.json` → `build`).

## Basic usage

- Open the app and go to the Marketplace or Models view to see available local models and Spaces.
- Pull or add an Ollama model if you want local inference; use the model controls to start a chat session.
- Chat responses stream in the UI; sessions can be saved and reopened later from the Sessions menu.
- Launch a Hugging Face Space or website card from the UI to open it in your default browser.

## Privacy & security

InferencePortAI is designed for local-first use:
- Chat history and sessions are stored locally under the app user data directory.
- Local model execution (Ollama) keeps inputs/outputs on your machine when used.
- The renderer surface is sandboxed and only exposes a small, explicit API via `preload.ts`.

If you plan to enable external integrations or remote services, review the relevant settings and understand where data may be sent.

## Project layout (quick)

- `main.ts` — Electron main process and IPC handlers.
- `preload.ts` — Safe `contextBridge` APIs exposed to the renderer.
- `node-apis/` — Integrations and helpers (Ollama, Spaces, utilities).
- `public/` — Renderer pages and static assets.

See `global.d.ts` for the TypeScript signatures of the exposed APIs to renderer code.

## Troubleshooting

- If Ollama is not installed, model actions will error — install Ollama to run local models.
- For TypeScript or build errors, try running the compilers directly:

```powershell
tsc -p tsconfig.main.json
tsc -p tsconfig.renderer.json
```

## Contributing

Contributions are welcome. Open an issue or submit a PR. Keep changes small and include types and tests when appropriate.

## License

Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0. See LICENSE for details.
