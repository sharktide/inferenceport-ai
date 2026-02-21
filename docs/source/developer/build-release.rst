Build and Release
=================

NPM scripts
-----------

Scripts are defined in ``src/package.json``.

.. list-table::
   :header-rows: 1
   :widths: 24 22 54

   * - Script
     - Command
     - Purpose
   * - ``clean``
     - ``node scripts/clean.js``
     - Remove generated JS/type artifacts.
   * - ``watch``
     - ``tsc --watch``
     - Incremental TypeScript compilation during development.
   * - ``compile``
     - ``npx tsgo``
     - Compile source for app runtime.
   * - ``start``
     - clean -> compile -> ``electron .``
     - Launch app in local development mode.
   * - ``prepack``
     - ``node scripts/bundle-ollama.js``
     - Download and prepare bundled Ollama runtime.
   * - ``build``
     - clean -> compile -> prepack -> electron-builder
     - Create distributable artifacts.
   * - ``publish``
     - clean -> compile -> prepack -> publish always
     - Build and publish release assets.

Packaging targets
-----------------

Build config: ``src/build.config.js``.

* Windows: ``nsis``, ``appx``, ``zip``, ``msi`` (or ``7z`` for GPU variants)
* macOS: ``dmg``, ``zip``, ``pkg``
* Linux: ``AppImage``, ``deb``, ``tar.xz`` (or ``tar.xz`` only for GPU variants)

Important environment variables
-------------------------------

.. list-table::
   :header-rows: 1
   :widths: 25 20 55

   * - Variable
     - Default
     - Effect
   * - ``OLLAMA_ACCELERATION``
     - ``cpu``
     - Select bundled runtime variant (for example ``cuda``, ``rocm``,
       ``jetpack5``, ``jetpack6``).
   * - ``BUILD_CHANNEL``
     - ``standard``
     - Controls release channel behavior such as store compression mode.
   * - ``GH_TOKEN``
     - unset
     - Token used by vendor bundling scripts when fetching releases.

Ollama bundling pipeline
------------------------

The prepack script (``src/scripts/bundle-ollama.ts``):

1. Resolves host OS and architecture.
2. Downloads matching Ollama release assets.
3. Extracts and relocates binaries into ``src/vendor/electron-ollama``.
4. Optionally merges shared libraries and prunes unused accelerator folders.

Release metadata
----------------

Release publishing is configured for GitHub:

* Owner: ``sharktide``
* Repository: ``InferencePort-AI``
* Release type: ``release``
