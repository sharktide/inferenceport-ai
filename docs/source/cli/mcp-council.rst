Council of LLMs: ``ipx mcp council``
====================================

The **Council of LLMs** is a hosted MCP server. It sends your problem to several models in parallel, has them review
each other's answers for mistakes over one to three rounds, and then has judge models synthesize one final answer.
``ipx mcp council`` calls it straight from the terminal; no MCP client is needed.

.. code-block:: console

   $ ipx mcp council tiers
   $ ipx mcp council reason "Design a rate limiter for 10k requests per second"
   $ ipx mcp council reason -f spec.md --tier pro --rounds 2
   $ cat bug.txt | ipx mcp council reason --stdin "What is the root cause?"
   $ ipx -O acme mcp council reason "..."          # bill the organization

Billing
-------

Each model call is billed at normal per-token rates, plus a flat **council surcharge** per run that depends on the
tier (see ``tiers``). Both come out of your wallet, or the organization wallet when an organization context is set
(``-O acme`` or ``ipx auth context``). The surcharge is not charged if no council member answers. A signed-in
session or an API key works; an organization key already carries its organization.

Commands
--------

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Command
     - Purpose
   * - ``tiers``
     - Tiers with model count, judge count and surcharge in credits.
   * - ``models [-t TIER]``
     - Council members, judges and fallbacks of a tier.
   * - ``reason [PROBLEM]``
     - Run a problem through the council. Add text with ``-f FILE`` (repeatable) or ``--stdin``.
   * - ``tools``
     - MCP tools the server exposes.
   * - ``test``
     - Run the MCP handshake with your sign-in and show the endpoint.
   * - ``connect [CLIENT]``
     - Print the config for ``claude-code``, ``claude-desktop``, ``cursor``, ``vscode`` or a generic ``json`` client.

``reason`` options:

``-t, --tier``
   Council tier (default ``basic``); higher tiers use more and better models.

``-r, --rounds 1-3``
   Review rounds. More rounds catch more errors and cost more.

``--model ID`` / ``--judge ID``
   Override the council members or judges for this run (repeatable). Ids must be models InferencePort serves; the
   server enforces per-tier limits.

``--log``
   Include the per-round iteration log (always omitted from ``--json`` output otherwise).

The answer is printed to standard output; a one-line summary (models used, rounds, surcharge, tokens) goes to standard
error, so ``ipx mcp council reason "..." > answer.md`` captures only the answer. With ``--json`` you get the full
result: ``answer``, ``council``, ``billing`` and ``usage``. A run can take a few minutes; the server stops it after its
time limit and suggests a lower tier or fewer rounds.

Using the council from other MCP clients
----------------------------------------

The server is at ``https://api.inferenceport.ai/mcp/council/`` (Streamable HTTP). ``ipx mcp council connect`` prints a
ready-made snippet; for example:

.. code-block:: console

   $ ipx mcp council connect claude-code
   claude mcp add --transport http council https://api.inferenceport.ai/mcp/council/

   $ ipx -O acme mcp council connect cursor      # adds the X-InferencePort-Org header

Clients sign in with OAuth, or send an InferencePort API key (``ipa_live_...``) as a Bearer token. With OAuth, the
``X-InferencePort-Org`` header chooses the organization to bill; without it you are billed personally.
