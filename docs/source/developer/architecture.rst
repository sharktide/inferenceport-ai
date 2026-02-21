Architecture
============

Runtime topology
----------------

InferencePort AI uses Electron's process model:

* Main process: window lifecycle, app menu, deep links, IPC registration
* Preload: typed ``contextBridge`` API exposed to renderer
* Renderer: UI pages and user interactions
* Node API modules: local file I/O, model orchestration, auth, utilities

High-level flow:

.. code-block:: text

   Renderer UI (public/*.html + scripts)
       -> window.* APIs from preload.cts
       -> IPC channels (ipcRenderer invoke/send)
       -> node-apis/*.ts handlers in main process
       -> local files, Ollama/OpenAI-compatible endpoints, Supabase services

Startup lifecycle
-----------------

Key startup behavior from ``src/main.ts``:

* Acquire single-instance lock.
* Register custom protocol ``inferenceport-ai://``.
* Register IPC handlers from:
  * ``node-apis/ollama.ts``
  * ``node-apis/utils.ts``
  * ``node-apis/auth.ts``
  * ``node-apis/spaces.ts``
* Create main browser window with preload script.
* Attempt to start bundled/local Ollama service.
* Fetch and cache tool-support metadata.

Deep links
----------

Main process logic supports:

* OAuth callback routes (``/auth/callback`` and ``/authcallback``)
* Generic path routing to matching files in ``public/*.html``
* Query/hash passthrough for renderer initialization

Persistence model
-----------------

Most data is stored under Electron ``app.getPath("userData")``.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Path
     - Purpose
   * - ``chat-sessions/sessions.json``
     - Saved chat sessions and metadata.
   * - ``chat-sessions/supportsTools.json``
     - Cached list of models supporting tools.
   * - ``assets/*.blob``
     - Binary assets generated during chat tool workflows.
   * - ``logs/InferencePort-Server.log``
     - Local hosting/proxy server logs.
   * - ``supabase-session.json``
     - Persisted Supabase auth session token payload.
   * - ``profiles.json``
     - Profile-related local data.
   * - ``spaces/*.import`` and ``websites/*.import``
     - Imported/shared marketplace card metadata.
   * - ``first-run-2.0.0.json``
     - First-launch marker used by onboarding logic.

Security boundaries
-------------------

* Renderer does not directly access Node APIs.
* Privileged operations are exposed only through preload bridge methods.
* Markdown/HTML inputs are sanitized before rendering.
* Proxy hosting uses token verification and role checks.
