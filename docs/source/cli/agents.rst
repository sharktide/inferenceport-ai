Agents: ``ipx agent``
=====================

An **agent** is a backing model plus a system prompt and optional MCP servers, saved under your agent username and
called anywhere as ``agent/<username>/<agent-id>``. Calls are billed at the standard per-token rates, either to the
caller or (``--payer owner``) to the agent's owner.

.. code-block:: console

   $ ipx agent profile set acme-bot                         # one-time: your public agent username
   $ ipx agent create support --name "Support" -m lightning --system-file prompt.md
   $ ipx agent chat acme-bot/support
   $ ipx agent ask acme-bot/support "How do I reset my password?"
   $ ipx agent list

References are ``username/agent-id``; ``agent/username/agent-id`` also works, and a bare ``agent-id`` means one of
yours. Agents belong to people, so management commands ignore the organization context. **Chatting** with an agent
(``chat``, ``ask``) does respect it: with ``-O acme`` the usage is billed to the organization wallet and its model
policy applies.

Create and edit
---------------

.. code-block:: console

   $ ipx agent create docs-bot --name "Docs bot" -m lightning \
         --system "Answer from the docs." --visibility public --registry published \
         --mcp docs=https://mcp.example.com/mcp
   $ ipx agent update docs-bot --system-file new-prompt.md      # only the options you pass change
   $ ipx agent get acme-bot/docs-bot                            # owners/editors also see the prompt and members
   $ ipx agent delete acme-bot/docs-bot

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Option
     - Meaning
   * - ``--name``, ``--description``
     - Display name (required on create) and a short description (500 characters at most).
   * - ``-m, --model``
     - Backing catalog model (required on create). Agents cannot be backed by another agent or a Featherless
       deployment, and MCP servers need a model that supports tool calling.
   * - ``--system``, ``--system-file``
     - System prompt (32,000 characters at most). ``--system-file -`` reads standard input.
   * - ``--visibility private|public``
     - Private agents are only callable by you and invited members; public agents by any signed-in user.
   * - ``--registry published|unlisted``
     - Public agents can be listed in ``ipx agent registry`` or stay callable only by id.
   * - ``--payer caller|owner``
     - Who pays for each call.
   * - ``--mcp NAME=URL``, ``--mcp-file FILE``
     - Attach MCP servers. ``--mcp`` is unauthenticated; use ``--mcp-file`` (a JSON object or list with ``name``,
       ``url``, ``transport``, ``auth_type`` and a token) for bearer or API-key auth. Passing either replaces the
       whole list on ``update``.

Discovering agents
------------------

``ipx agent list`` shows agents you own or were invited to (``--mine`` for only yours). ``ipx agent registry -q TEXT``
searches the public registry.

Sharing
-------

An invite grants nothing until the invitee accepts it.

.. code-block:: console

   $ ipx agent roles                                              # what each role can do
   $ ipx agent invite create acme-bot/support dev@acme.com --role editor   # user | editor | inviter | administrator
   $ ipx agent invite list                                        # invites sent to you
   $ ipx agent invite preview <token-or-link>
   $ ipx agent invite accept <token-or-link>                      # or: deny
   $ ipx agent invite revoke <token>
   $ ipx agent members list acme-bot/support
   $ ipx agent members role acme-bot/support <user-id> administrator
   $ ipx agent members remove acme-bot/support <user-id>

Settings
--------

.. code-block:: console

   $ ipx agent settings show
   $ ipx agent settings set --include-in-models     # also list agents in /v1/models for OpenAI-style tooling
