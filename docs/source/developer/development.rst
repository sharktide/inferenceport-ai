Development Guide
=================

Repository layout
-----------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Path
     - Purpose
   * - ``src/main.ts``
     - Electron startup, single-instance behavior, deep links, menu.
   * - ``src/preload.cts``
     - Typed bridge from renderer to privileged IPC handlers.
   * - ``src/node-apis/``
     - Main-process integrations (Ollama, auth, spaces, utility services).
   * - ``src/public/``
     - Renderer HTML pages, UI scripts, styles, static assets.
   * - ``src/scripts/``
     - Build helpers (vendor bundling, archive extraction, cleanup).
   * - ``docs/source/``
     - Sphinx documentation source.

TypeScript settings
-------------------

``src/tsconfig.json`` enables strict mode and modern ``nodenext`` module
resolution. Keep new files consistent with current settings:

* ``strict: true``
* ``noUncheckedIndexedAccess: true``
* ``exactOptionalPropertyTypes: true``
* ``isolatedModules: true``

Local development loop
----------------------

From ``src/``:

.. code-block:: powershell

   npm install
   npm run watch

In another terminal:

.. code-block:: powershell

   cd src
   npm start

Adding a new IPC feature
------------------------

1. Implement handler in an appropriate ``src/node-apis/*.ts`` module.
2. Register channel in module ``register()`` function.
3. Expose a typed preload bridge method in ``src/preload.cts``.
4. Update global renderer typings in ``src/global.d.ts``.
5. Consume the method from renderer script.
6. Add or update docs in :doc:`ipc-api`.

Debugging tips
--------------

* Use the View menu action to toggle developer tools.
* Check proxy logs using ``window.ollama.getServerLogs()``.
* Verify data files in ``app.getPath("userData")`` paths listed in
  :doc:`architecture`.

Documentation maintenance
-------------------------

Build docs locally:

.. code-block:: powershell

   python -m pip install -r docs/requirements.txt
   sphinx-build -b html docs/source docs/build/html

When IPC methods, storage paths, or startup flows change, update:

* :doc:`architecture`
* :doc:`ipc-api`
* :doc:`../user-guide`
