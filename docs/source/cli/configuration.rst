Configuration
=============

Global options
--------------

These work before the command, e.g. ``ipx --json usage get``, and also after it (``ipx usage get --json``).

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Option
     - Meaning
   * - ``--json``
     - Print machine-readable JSON instead of formatted output (also ``IPX_JSON=1``).
   * - ``-O, --org SLUG``
     - Run the command in this organization, overriding the saved context.
   * - ``--personal``
     - Ignore the organization context for this command.
   * - ``--base-url URL``
     - Use a different API endpoint (also ``IPX_BASE_URL``).
   * - ``-q, --quiet``
     - Only print results and errors.
   * - ``-y, --yes``
     - Answer yes to confirmation prompts (required for destructive commands in scripts).
   * - ``--no-color``
     - Disable colors (``NO_COLOR`` is also respected).
   * - ``-V, --version``, ``-h, --help``
     - Version and help.

Settings
--------

.. code-block:: console

   $ ipx config list
   $ ipx config set default_gen_model lightning
   $ ipx config get ollama_url
   $ ipx config unset output_dir
   $ ipx config path

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Key
     - Meaning
   * - ``base_url``
     - API endpoint. Default ``https://api.inferenceport.ai``.
   * - ``ollama_url``
     - Where the local Ollama runtime listens. Default ``http://localhost:11434`` (``IPX_OLLAMA_URL``).
   * - ``org``
     - Active organization (prefer ``ipx auth context``).
   * - ``default_gen_model``, ``default_p2g_model``, ``default_local_model``
     - Model used when you do not pass ``-m`` / a model argument.
   * - ``output_dir``
     - Folder generated images, video and audio are saved to when you do not pass ``-o``. Default: the current
       directory.

Files
-----

The config folder is ``%APPDATA%\ipx`` on Windows, ``~/Library/Application Support/ipx`` on macOS and
``$XDG_CONFIG_HOME/ipx`` (``~/.config/ipx``) on Linux. Set ``IPX_HOME`` to use another folder.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - File
     - Purpose
   * - ``config.json``
     - Preferences and the organization context. Also holds a stable ``X-Client-ID`` used for rate-limit identity.
   * - ``credentials.json``
     - Sign-in tokens or API key (owner-only permissions on macOS/Linux).
   * - ``policy-cache.json``
     - Cached organization desktop policy.
   * - ``server.pid``, ``server.log``
     - State and log of ``ipx server``.

Exit codes
----------

.. list-table::
   :widths: 12 88

   * - ``0``
     - Success.
   * - ``1``
     - The command failed (error message on standard error). ``ipx auth status`` also returns ``1`` when you are not
       signed in, and ``ipx doctor`` when a check fails.
   * - ``2``
     - Usage error (unknown option, missing argument).
   * - ``130``
     - Cancelled with Ctrl+C.
