# InferencePort AI — Web UI (Bionic renderer)

This folder contains the source of the redesigned InferencePort AI interface
("Bionic" UI). It is a fully self-contained Next.js (React + Tailwind CSS)
application that builds down to **plain static files** — no server, no runtime
dependency on Node. The build output is consumed by the Electron shell as the
main renderer.

## How it fits into the app

```
src/
├── main.ts              ← Electron main process (unchanged behaviour,
│                           only the renderer entry point is switched)
├── public/bionic/       ← pre-built static bundle (committed, ships in the exe)
└── webui/               ← this source project (not part of the exe build)
```

- `npm run build` in the Electron `src/` folder packs `public/**` into the
  app, so the pre-built renderer ships automatically — no extra build step,
  no new dependency for the packaged app.
- If `public/bionic` is deleted, the app silently falls back to the classic
  renderer (`public/index.html`). You can also switch renderers at runtime
  from the menu: **View → Renderer**.

## Development

```bash
cd src/webui
npm install
npm run dev          # http://localhost:3000
```

## Building & syncing into the app

```bash
npm run build:electron   # builds the static export and copies it
                         # to ../public/bionic
```

( `npm run build` only produces `out/`; `npm run sync` only copies an
existing `out/`.)

## Notes

- The build uses `output: "export"` with a relative `assetPrefix` so the
  bundle works when loaded through `file://` inside Electron.
- This is a UI concept build: model downloads, chat streaming and
  benchmarks are simulated client-side. Wiring these screens to the real
  `preload` / `node-apis` bridge is intentionally left as follow-up work —
  see `UI_REDESIGN.md` at the repository root.
