User Guide
==========

This guide covers all major user features in InferencePort AI.

Everyday Workflow
-----------------

1. Open ``Chat``.
2. Select a ``Host`` and ``Model``.
3. Send prompts and review streamed output.
4. Reopen older sessions from the sidebar when needed.

Chat Basics
-----------

1. Go to ``Chat``.
2. Choose your host (local or remote).
3. Choose a model.
4. Type a prompt and press Enter.

Helpful chat controls:

* ``+ New chat`` starts a fresh session.
* ``Stop`` aborts an in-progress response.
* ``Reset`` clears chat state for the current run.
* Right-click a session for rename/delete actions.

Lightning Mode
--------------

Chat includes a Lightning toggle in the sidebar.

* Turn Lightning on to use Lightning model flow.
* Turn it off to use your normal host/model selections.

Sessions
--------

* Sessions are saved locally by default.
* You can continue, rename, favorite, or delete sessions.
* ``Delete All Sessions`` is available from the session context menu.

Marketplace Overview
--------------------

Marketplace includes:

* ``Local Chat`` (Ollama models)
* ``Hugging Face`` chatbot discovery/import
* ``Import Model`` for ``.gguf``/``Modelfile``
* ``Hugging Face Spaces`` demos
* ``Websites`` cards
* ``Import .import File`` for supported cards/imports

Local Models (Ollama)
---------------------

1. Open ``Marketplace`` -> ``Local Chat``.
2. Browse recommended or all available models.
3. Download a model.
4. Open ``Chat`` and select the model.

You can also:

* Search installed and available models.
* Remove models you no longer need.
* Add/manage remote hosts from host controls.

Import GGUF / Modelfile
-----------------------

1. Open ``Marketplace``.
2. Select ``Import Model``.
3. Drop ``.gguf`` and/or ``Modelfile``.
4. Start import and wait for completion.

If your Modelfile references a GGUF, provide both files together.

Installed Page
--------------

The ``Installed`` page helps you manage what you already added:

* Installed chat models
* Saved Hugging Face Spaces
* Saved website cards

Use launch/delete actions per card as needed.

Spaces and Websites
-------------------

* Launch Spaces from ``Marketplace`` to use hosted demos.
* Save useful Spaces/websites for quick access.
* Remove saved cards when you do not need them.
* Some sites may open externally if embedding is blocked.

Account (Optional)
------------------

You can use the app without an account.

If needed, sign in from ``Auth`` using:

* Email + password
* GitHub
* Google

Settings includes account actions such as username change and account deletion.

Sync (Optional)
---------------

1. Sign in.
2. Open ``Settings``.
3. Enable ``chat sync``.

Notes:

* Sync is off by default.
* Local usage works without sync.

Remote Host and Hosting (Advanced)
----------------------------------

Two separate advanced features are available:

* ``Remote host``: connect this app to a model host running elsewhere.
* ``Host (Proxy)`` in Settings: run a local proxy server for allowed users.

For hosting/proxy mode you can:

* Set port and allowed emails
* Start/stop hosting
* View server logs

Troubleshooting
---------------

If you hit issues with install, model pulls, streaming, auth, or sync, use
:doc:`troubleshooting`.
