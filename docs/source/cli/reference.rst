Command Reference
=================

Run ``ipx <command> --help`` for options and examples of any command. ``<org>`` means the command needs an
organization context (or ``-O``).

Account
-------

.. list-table::
   :header-rows: 1
   :widths: 38 62

   * - Command
     - Purpose
   * - ``ipx auth login``
     - Sign in (email, OAuth providers, SSO, API key).
   * - ``ipx auth logout`` / ``signout``
     - Sign out and delete local credentials.
   * - ``ipx auth status`` / ``whoami``
     - Show the active identity, plan and context.
   * - ``ipx auth context [org] [--clear]``
     - Show or set the organization context.
   * - ``ipx auth token``
     - Print the current bearer token.
   * - ``ipx usage get`` / ``tiers`` / ``ledger``
     - Quotas, wallet and organization spend.

Organizations (``<org>`` except where noted)
--------------------------------------------

.. list-table::
   :header-rows: 1
   :widths: 38 62

   * - Command
     - Purpose
   * - ``ipx org list`` / ``plans`` / ``create`` (no context)
     - Discover and create organizations.
   * - ``ipx org info`` / ``update`` / ``delete`` / ``transfer``
     - Manage the active organization.
   * - ``ipx org members list|role|remove|suspend|unsuspend|limits``
     - Members and their roles and limits.
   * - ``ipx org invite create|list|revoke|resend``, ``accept`` (no context)
     - Invitations.
   * - ``ipx org teams list|create|update|delete|members|add|remove``
     - Teams.
   * - ``ipx org keys list|create|update|revoke``
     - Organization API keys.
   * - ``ipx org billing info|ledger|plan|credits|portal|invoices|details|promo|contact-sales``
     - Wallet, plan and invoices.
   * - ``ipx org usage breakdown|export|report``
     - Usage reporting.
   * - ``ipx org audit list|export|webhook``
     - Audit log.
   * - ``ipx org domains list|add|verify|remove``, ``ipx org sso get|set|remove``
     - Domain verification and single sign-on.
   * - ``ipx org policy get|set``, ``desktop-policy get|set``, ``notifications get|set|test``
     - Policy and alerts.

Cloud generation
----------------

``ipx gen`` (Lightning, subscription) and ``ipx p2g`` (Pay-2-Go, credits) share these:

.. list-table::
   :header-rows: 1
   :widths: 38 62

   * - Command
     - Purpose
   * - ``chat [-m MODEL] [--system TEXT]``
     - Interactive chat.
   * - ``text [PROMPT|-] [-m] [--system] [-f FILE] [--stdin] [--no-stream]``
     - One-off text generation.
   * - ``image PROMPT [-n 1-4] [--mode fantasy|realistic] [--ref IMG] [-o]``
     - Image generation.
   * - ``video PROMPT [--size] [--seconds] [--ref] [--no-wait] [-o]``; ``--status ID``; ``--download ID``
     - Asynchronous video.
   * - ``audio speech|sfx|timestamps|transcribe|voice-change|isolate|stems``
     - Audio generation and processing.
   * - ``models [-t TYPE] [-s TEXT]``
     - Available models.

Only ``ipx gen``: ``plan``. Only ``ipx p2g``: ``3d``, ``balance``, ``ledger``, ``pricing``, ``keys list|create|revoke``,
``deploy models|status|create|list|get|usage|cancel|uncancel|delete``.

Local
-----

.. list-table::
   :header-rows: 1
   :widths: 38 62

   * - Command
     - Purpose
   * - ``ipx model list|search|pull|show|ps|copy|rm|create``
     - Manage local models.
   * - ``ipx model import gguf|hf``
     - Import a GGUF file or Hugging Face model.
   * - ``ipx local chat|text``
     - Chat with local models.
   * - ``ipx server start|stop|status|logs``
     - Host your models.
   * - ``ipx import space|website|file|list|rm``
     - Desktop library imports.

Tools
-----

.. list-table::
   :header-rows: 1
   :widths: 38 62

   * - Command
     - Purpose
   * - ``ipx config list|get|set|unset|path``
     - Preferences.
   * - ``ipx status``
     - Service health.
   * - ``ipx doctor``
     - Diagnose your setup.
   * - ``ipx api METHOD PATH [-d JSON] [-q key=value]``
     - Raw authenticated request.
   * - ``ipx rewards list|summary|claim``
     - Rewards and discounts.
   * - ``ipx completion bash|zsh|fish``
     - Shell completion script.
