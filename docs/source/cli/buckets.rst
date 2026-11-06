Buckets commands
================

``ipx bucket`` manages private object storage using your existing account and
``-O/--org`` or ``--personal`` context. It requires a server with Buckets enabled
and the appropriate access. API keys have a fixed workspace; use an organization
key or an interactive session for organization actions.

.. code-block:: console

   ipx bucket status
   ipx bucket pricing
   ipx bucket connection
   ipx --org acme bucket connection
   ipx bucket create models --quota-bytes 10737418240
   ipx bucket list
   ipx bucket info models
   ipx bucket update models --quota-bytes 21474836480
   ipx bucket update models --name weights
   ipx bucket update weights --status read_only
   ipx bucket upload models ./weights.bin --key checkpoints/weights.bin
   ipx bucket ls models --prefix checkpoints/
   ipx bucket download models checkpoints/weights.bin ./download.bin
   ipx bucket usage models
   ipx bucket rm models checkpoints/weights.bin
   ipx bucket delete models

``connection`` shows the authenticated workspace ID and its S3 endpoint. The
personal endpoint contains your user UUID; an organization endpoint contains the
organization UUID. Copy that complete endpoint into S3 clients. Credentials must
belong to the same workspace. Different workspaces can use the same bucket name.
Uploads and downloads resolve this workspace before transferring files.

``update`` changes a bucket's name, maximum logical size or upload status. The
maximum must cover stored bytes and active upload reservations. Increasing it does
not charge for unused space. Renaming preserves objects and bucket-scoped
credentials; update client configurations to use the new name. ``read_only`` pauses
uploads, including completion of pending uploads; set ``active`` to resume.

Large transfers use bounded multipart parts; failures abort unfinished uploads.
Downloads stream into a new file and do not overwrite existing paths. ``ls``
returns one page; pass its opaque token with ``--continuation-token`` to continue.
``--json`` produces machine-readable results. Empty buckets with active uploads
cannot be deleted. Retained versions can remain billable after deletion.

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

Credential requests use a retry UUID and automatically retry one ambiguous
network/server failure. If recovery still fails, the error supplies a request UUID;
repeat the same command and options with ``--request-id UUID`` within ten minutes.
Reusing that UUID with different options fails. Review and revoke orphaned
credentials before starting a new intent after the retry window.

Rotation preserves scopes and expiration, leaving the old credential active until revoked.
Use ``--revoke-previous`` for immediate replacement after checking client impact.
Never commit credential files or place secrets in logs, telemetry or shell history.

Local E2E sandbox
-----------------

The server repository's ``tools/run_buckets_sandbox.py`` starts an isolated local
HTTPS gateway with two users/orgs, Postgres and a local storage emulator. Set ``IPX_BASE_URL`` to
``https://localhost:58080``, ``IPX_CA_BUNDLE`` to its generated ``localhost.pem``,
and load a generated test key into ``IPX_API_KEY`` without printing it. The CLI
repository's opt-in lifecycle test runs with ``BUCKETS_RUN_E2E=1``. No production
migration is applied by this setup.

See :doc:`../api/buckets` for the endpoint, supported S3 operations, pricing and
credit holds. ``ipx bucket pricing`` shows the published service catalog. All
usage is billable from the first unit; unavailable prices are never substituted
with examples or a free allowance.
