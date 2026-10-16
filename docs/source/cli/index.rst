ipx Command Line
================

``ipx`` is the InferencePort AI command line. It is one native program that talks to everything InferencePort offers:

* **Lightning** (``ipx gen``) - chat and generate images, video and audio with your subscription.
* **Pay-2-Go** (``ipx p2g``) - the credit-billed API: chat, images, video, audio, 3D, embeddings, realtime voice and
  transcription, API keys and deployments.
* **Featherless** (``ipx featherless``) - deploy catalog models for yourself or an organization.
* **Agents** (``ipx agent``) - create, share and chat with managed agents.
* **Council MCP** (``ipx mcp council``) - multi-model reasoning from the terminal.
* **AI Shield** (``ipx shield``) - detect prompt attacks, abuse, fraud, malicious uploads, disposable emails and leaked secrets; bulk indicator checks and CI gates.
* **Organizations** (``ipx org``) - members, teams, keys, billing, usage, audit log, SSO and policy.
* **Local models** (``ipx model``, ``ipx local``) - pull, manage and chat with models on your own machine, using the
  same Ollama engine as the desktop app.
* **Host server** (``ipx server``) - share your local models with approved people, like the desktop app's *Host
  (Proxy)* mode.
* **Desktop library** (``ipx import``) - add Hugging Face Spaces and websites to the desktop app.

.. code-block:: console

   $ ipx auth login
   $ ipx gen chat
   $ ipx p2g image "a lighthouse at dawn" -o lighthouse.jpg
   $ ipx auth context acme
   $ ipx org members list
   $ ipx model pull llama3.2 && ipx local chat llama3.2
   $ ipx usage get

Designed for people and for scripts
-----------------------------------

* Rich, readable output in a terminal: streaming Markdown in chat, progress bars for downloads and long jobs,
  usage meters and tidy tables.
* Pipe-friendly: one-shot commands write only the result to standard output; decoration goes to standard error.
* ``--json`` on any command prints machine-readable JSON instead - see :doc:`scripting`.
* Clear errors with a hint on how to fix them (not signed in, not enough credits, organization policy, Ollama not
  running).

.. toctree::
   :maxdepth: 2
   :caption: Getting started

   install
   quickstart
   authentication
   configuration

.. toctree::
   :maxdepth: 2
   :caption: Command guides

   lightning
   p2g
   featherless
   agents
   mcp-council
   shield
   organizations
   local-models
   server
   imports
   usage

.. toctree::
   :maxdepth: 2
   :caption: Reference

   scripting
   reference
   troubleshooting
   packaging
