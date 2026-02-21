Security and Privacy
====================

Local-first data model
----------------------

InferencePort AI stores chat/session/runtime data primarily in local files
under Electron's user-data directory.

Examples:

* ``chat-sessions/sessions.json``
* ``assets/*.blob``
* ``logs/InferencePort-Server.log``
* ``supabase-session.json``

Renderer isolation
------------------

Security posture relies on Electron preload boundaries:

* Renderer code cannot directly call Node APIs.
* Approved operations are mediated via ``contextBridge`` in
  ``src/preload.cts``.
* Main process validates and executes privileged file/network operations.

Content sanitization
--------------------

``src/node-apis/utils.ts`` sanitizes markdown/HTML output before rendering
using:

* ``markdown-it`` for markdown parsing
* ``sanitize-html`` for output sanitization

This reduces risk of unsafe markup from model output or imported content.

Local proxy host protections
----------------------------

The optional hosting proxy in ``src/node-apis/helper/server.ts`` includes:

* Bearer token requirement
* Remote token verification via Supabase edge function
* Role-aware restrictions for non-admin users
* Rate-limiting on health and forwarded requests
* Header sanitization and request size limits
* Log rotation for local log files

Auth/session handling
---------------------

``src/node-apis/auth.ts`` persists auth session payloads locally for relaunch
continuity and clears session files on sign-out.

Operational recommendations
---------------------------

* Keep machine and OS account secure since local files may include chat data.
* Restrict allowed user emails when using hosted proxy mode.
* Avoid sharing imported files containing sensitive metadata.
* Rotate credentials and review Supabase policies for production deployments.
