Organizations: ``ipx org``
==========================

Organizations let a team share billing, keys and policy. ``ipx org`` is the command-line version of the organization
pages in the web console. Most subcommands act on the **organization context** (:doc:`authentication`); pass
``-O <slug>`` to target another one for a single command.

.. code-block:: console

   $ ipx org list                       # organizations you belong to (the context is marked with a dot)
   $ ipx auth context acme              # choose one
   $ ipx org info

The server decides what you may do from your role (owner, admin, billing manager, auditor, member) and the
organization's plan. When an action is not allowed you will see the server's message.

Listing, creating and changing
------------------------------

.. code-block:: console

   $ ipx org plans                                       # plan catalog
   $ ipx org create --name "Acme Inc" --slug acme        # you become the owner; sets the context
   $ ipx org update --name "Acme Corp" --billing-email billing@acme.com
   $ ipx org update --data '{"settings": {"default_member_role": "member"}}'
   $ ipx org transfer <user-id>                          # hand over ownership
   $ ipx org delete                                      # asks you to type the slug

``org list``, ``create`` and ``plans`` need a signed-in session (not an API key).

Members and invitations
-----------------------

.. code-block:: console

   $ ipx org members list
   $ ipx org members role <user-id> admin               # admin | billing_manager | auditor | member
   $ ipx org members remove <user-id>
   $ ipx org members suspend <user-id>                  # and: unsuspend
   $ ipx org members limits <user-id> --monthly-credits 20 --models lightning --modalities text,image

   $ ipx org invite create dev@acme.com --role admin --team <team-id>
   $ ipx org invite list
   $ ipx org invite resend <invitation-id>
   $ ipx org invite revoke <invitation-id>
   $ ipx org invite accept <token-from-the-invite-link>   # add --preview to look first

Teams
-----

.. code-block:: console

   $ ipx org teams list
   $ ipx org teams create --name "Platform" --slug platform
   $ ipx org teams add <team-id> <user-id>              # and: remove, members, update, delete

API keys
--------

Organization keys bill the organization and can be restricted:

.. code-block:: console

   $ ipx org keys create ci --monthly-limit 25 --models lightning --modalities text \
         --ip 203.0.113.0/24 --rpm 60 --expires 2027-01-01
   $ ipx org keys list
   $ ipx org keys update <key-id> --data '{"monthly_credit_limit": 50}'
   $ ipx org keys revoke <key-id>

The secret is displayed once at creation. Use it with ``ipx auth login --api-key`` or ``IPX_API_KEY``.

Billing
-------

.. code-block:: console

   $ ipx org billing info
   $ ipx org billing ledger --limit 100
   $ ipx org billing plan team                  # prints a checkout link when payment is needed
   $ ipx org billing credits pack_25            # buy credits for the organization wallet
   $ ipx org billing portal                     # Stripe billing portal
   $ ipx org billing invoices [--upcoming]
   $ ipx org billing details [--data '{...}']   # show, or replace the billing details
   $ ipx org billing promo SPRING25
   $ ipx org billing contact-sales "We need 200 seats"

Usage and audit
---------------

.. code-block:: console

   $ ipx org usage breakdown --days 30 --by model       # user | model | key | modality
   $ ipx org usage export --days 90 --format csv -o usage.csv
   $ ipx org usage report                               # email the report now

   $ ipx org audit list --action member.role_changed --actor admin@acme.com --since 2026-01-01
   $ ipx org audit export --format json -o audit.json
   $ ipx org audit webhook --url https://example.com/hook --secret s3cret    # --remove to delete

Identity: domains and SSO
-------------------------

.. code-block:: console

   $ ipx org domains add acme.com                # prints the DNS record to publish
   $ ipx org domains verify <domain-id>
   $ ipx org sso set --file saml.json            # see the console for the connection settings
   $ ipx org sso get
   $ ipx org sso remove

Policy and the desktop app
--------------------------

.. code-block:: console

   $ ipx org policy get
   $ ipx org policy set --file policy.json

   $ ipx org desktop-policy get
   $ ipx org desktop-policy set --pull-mode allowlist --pull-models llama3.2,qwen2.5 \
         --block-import --server-hosting admins --server-access org

The **desktop policy** controls what members may do in the desktop app *and* in ``ipx``: cloud (Lightning) use or
local-only, whether Lightning is billed to the organization, which models may be pulled, whether models may be imported,
and who may host a server (:doc:`server`). See :ref:`cli/authentication:Organization policy in the CLI`.

Notifications
-------------

.. code-block:: console

   $ ipx org notifications get
   $ ipx org notifications set --file notifications.json
   $ ipx org notifications test

Anything not covered by a flag
------------------------------

Commands that take a JSON body accept ``--data '<json>'`` or ``--file path.json`` (``-`` reads standard input), using
the same field names as the REST API. For anything else, ``ipx api METHOD /v1/orgs/<slug>/...`` calls any endpoint with
your credentials and the organization header.
