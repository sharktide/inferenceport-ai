Buckets commands
================

``ipx bucket`` manages private beta storage using your existing account and
``-O/--org`` or ``--personal`` context. It requires a server with Buckets enabled
and the appropriate access. API keys have a fixed workspace; use an organization
key or an interactive session for organization actions.

.. code-block:: console

   ipx bucket status
   ipx bucket pricing
   ipx bucket create models --quota-bytes 10737418240
   ipx bucket list
   ipx bucket info models
   ipx bucket upload models ./weights.bin --key checkpoints/weights.bin
   ipx bucket ls models --prefix checkpoints/
   ipx bucket download models checkpoints/weights.bin ./download.bin
   ipx bucket usage models
   ipx bucket rm models checkpoints/weights.bin
   ipx bucket delete models

Large transfers use bounded multipart parts; failures abort unfinished uploads.
Downloads stream into a new file and do not overwrite existing paths. ``ls``
returns one page; pass its opaque token with ``--continuation-token`` to continue.
``--json`` produces machine-readable results. Empty buckets with active uploads
cannot be deleted. Retained Azure versions can remain billable after deletion.

S3 credentials
--------------

Standard S3 clients need separate signing credentials. Secrets are revealed once
and saved in a new mode-0600 file; they are not printed by these commands:

.. code-block:: console

   ipx bucket credentials create --read-only --output ./s3-read.json
   ipx bucket credentials create --bucket-id BUCKET_UUID --prefix checkpoints/ \
     --expires-in 86400 --output ./s3-checkpoints.json
   ipx bucket credentials list
   ipx bucket credentials rotate CREDENTIAL_UUID --output ./replacement.json
   ipx bucket credentials revoke CREDENTIAL_UUID

Rotation preserves scopes and leaves the old credential active until revoked.
Use ``--revoke-previous`` for immediate replacement after checking client impact.
Never commit credential files or place secrets in logs, telemetry or shell history.

Local E2E sandbox
-----------------

The server repository's ``tools/run_buckets_sandbox.py`` starts an isolated local
HTTPS gateway with two users/orgs, Postgres and Azurite. Set ``IPX_BASE_URL`` to
``https://localhost:58080``, ``IPX_CA_BUNDLE`` to its generated ``localhost.pem``,
and load a generated test key into ``IPX_API_KEY`` without printing it. The CLI
repository's opt-in lifecycle test runs with ``BUCKETS_RUN_E2E=1``. No production
migration is applied by this setup.

See :doc:`../api/buckets` for the exact endpoint, supported S3 subset, Azure retail
catalog/credit holds and remaining real-Azure launch checks. A server without the
feature returns unavailable status rather than fictional prices or free storage.
