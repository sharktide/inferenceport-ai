Pay-2-Go: ``ipx p2g``
=====================

``ipx p2g`` uses the **Pay-2-Go API** (``/v1``): each request is metered against your credit wallet. It is the
production-oriented API and the one that lets an organization pay (set a context with ``ipx auth context``, see
:doc:`authentication`).

``chat``, ``text``, ``image``, ``video``, ``audio`` and ``models`` work exactly as described in :doc:`lightning`
(replace ``gen`` with ``p2g``); after each generation the credits charged are shown. This page covers what is specific
to Pay-2-Go.

.. code-block:: console

   $ ipx p2g chat                    # per-token billing, footer shows credits per answer
   $ ipx p2g image "a red fox" -o fox.jpg
   $ ipx --json p2g text "hi" | jq .usage.credits

Wallet and pricing
------------------

.. code-block:: console

   $ ipx p2g balance          # balance, purchased/spent and usage by modality
   $ ipx p2g ledger --limit 50
   $ ipx p2g pricing          # live credit prices and top-up packs (no sign-in needed)

When an organization context is set, requests are billed to the organization's wallet. Use ``--personal`` to bill your
own wallet for one command. Top up credits in the console at https://console.inferenceport.ai.

3D generation
-------------

.. code-block:: console

   $ ipx p2g 3d --image chair.jpg -m tripoSR -o chair.glb
   $ ipx p2g 3d --image logo.png -m trellis2 --resolution high
   $ ipx p2g 3d --image obj.png -m asset-harvester --prompt "a wooden chair"
   $ ipx p2g 3d --image chair.jpg --no-wait          # print the job id
   $ ipx p2g 3d --image chair.jpg --job a3f1c2e4b5   # fetch the result of an earlier job

Models: ``tripoSR`` (default), ``sf3d``, ``trellis2`` (with ``--resolution low|medium|high``) and
``asset-harvester`` (needs ``--prompt``; produces a Gaussian-splat ``.ply`` and an orbit ``.mp4``). The job runs
asynchronously and credits are refunded automatically if it fails. This feature is in early access; see
:doc:`/api/p2g-api`.

API keys
--------

.. code-block:: console

   $ ipx p2g keys list
   $ ipx p2g keys create ci-bot --expires 2027-01-01      # the secret is shown once
   $ ipx p2g keys revoke <key-id>

Personal keys (``ipa_live_...``) are used with ``Authorization: Bearer`` or ``ipx auth login --api-key``. Organization
keys, with spend caps and restrictions, are managed with ``ipx org keys`` (:doc:`organizations`).

Deployments
-----------

Personal Featherless deployments billed through your wallet. For organization deployments and the full command set
(``list``, ``restore``, ``terminate``, cost and state checks) use :doc:`featherless`:

.. code-block:: console

   $ ipx p2g deploy models                 # what can be deployed
   $ ipx p2g deploy status <model-id>      # availability
   $ ipx p2g deploy create <model-id>
   $ ipx p2g deploy list
   $ ipx p2g deploy get <deployment-id>
   $ ipx p2g deploy usage <deployment-id>
   $ ipx p2g deploy cancel <deployment-id>   # and: uncancel, delete

Errors you may see
------------------

``402 Insufficient credits``
   The wallet is below the minimum for the operation. Check ``ipx p2g balance`` and top up.

``429``
   Rate limit reached (120 requests per minute per identity by default).
