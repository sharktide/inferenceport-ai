Authentication and Organization Context
=======================================

``ipx auth`` manages who you are and, optionally, which organization you act for.

.. code-block:: console

   $ ipx auth login        # interactive menu
   $ ipx auth status       # who am I? (alias: whoami)
   $ ipx auth logout       # alias: signout
   $ ipx auth context acme # act as an organization
   $ ipx auth token        # print the bearer token (for curl and other tools)

Sign-in methods
---------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Command
     - Notes
   * - ``ipx auth login --email me@example.com``
     - Email and password. Prompts for the password; for scripts use ``--password-stdin``
       (``echo "$PW" | ipx auth login --email me@example.com --password-stdin``).
   * - ``ipx auth login --provider github``
     - Also ``google``, ``microsoft`` and ``huggingface``. Opens your browser; the CLI listens on a random
       ``127.0.0.1`` port to receive the result.
   * - ``ipx auth login --sso me@company.com``
     - Single sign-on. The CLI looks up your organization's identity provider from your email domain.
   * - ``ipx auth login --api-key ipa_live_...``
     - A Lightning API key created in the console or with ``ipx p2g keys create``. Best for servers and CI.
   * - ``ipx auth login --provider github --paste``
     - If the browser and the terminal are on different machines (SSH, containers): open the printed link anywhere,
       then paste the final address back into the terminal.

Sessions refresh automatically. Sign-in tokens are stored in ``credentials.json`` in the ipx config folder
(see :doc:`configuration`) with owner-only permissions.

.. note::

   Some routes need a *signed-in session* rather than an API key - for example ``ipx org list``, ``ipx org create`` and
   the organization policy check. With an API key these commands explain why they cannot run instead of failing
   with a raw ``403``.

Organization context
--------------------

Organizations can pay for your usage, set policy for what you may do, and own the ``ipx org`` commands. Select one:

.. code-block:: console

   $ ipx auth context            # show the current one, or pick from a list in a terminal
   $ ipx auth context acme       # by slug, id or name
   $ ipx auth context --clear    # back to your personal account

The context is remembered and sent as the ``X-InferencePort-Org`` header on API calls, which bills generation to the
organization's wallet and applies its policy. Override it for a single command:

.. code-block:: console

   $ ipx -O other-org usage get       # a different organization
   $ ipx --personal p2g balance       # ignore the context this once

Commands that manage an organization (``ipx org ...``) require a context and fail with a clear message if there is
none.

Organization policy in the CLI
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

When a context is set and your organization has a managed *desktop policy*, ``ipx`` applies the same controls as the
desktop app, before doing anything:

* ``ipx model pull`` obeys the pull mode (anything, an allow-list, or blocked).
* ``ipx model import`` and ``ipx model create`` obey *allow model import*.
* ``ipx server start`` obeys *server hosting* (anyone, admins only, disabled) and builds the allowed-user list from
  the organization or chosen teams.
* ``ipx gen`` is refused when the organization restricts members to local models.

The policy is cached for five minutes. If the policy cannot be checked and there is no recent cache, restricted
actions are refused rather than allowed. These client-side checks stop accidents; the server's own model and
modality policy and budgets remain the hard guard for anything billed to the organization.

Environment variables
---------------------

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Variable
     - Effect
   * - ``IPX_API_KEY``
     - Use this API key without logging in (ideal for CI).
   * - ``IPX_TOKEN``
     - Use this access token without logging in.
   * - ``IPX_ORG``
     - Organization slug to act as (same as ``--org``).
   * - ``IPX_BASE_URL``
     - API endpoint (default ``https://api.inferenceport.ai``).

Where the authentication is handled
-----------------------------------

Password, OAuth and SSO sign-in go to InferencePort's identity service (the same one the desktop app and web console
use); ``ipx`` reads its public address and publishable key from ``GET /v1/config`` at runtime. Every cloud request is
then a normal API call with ``Authorization: Bearer <token>``. See :doc:`/api/index` for the API itself.
