InferencePort Buckets (private beta)
====================================

Buckets provides private object storage for model weights, datasets, checkpoints
and generated artifacts. Access is staff-gated. The service is disabled by default;
an unconfigured server reports ``not_available`` and rejects storage operations
with ``503``. This is not a claim of complete AWS S3 compatibility or GA readiness.

Endpoints and ownership
-----------------------

The canonical S3 endpoint is ``https://api.inferenceport.ai/s3/``. Use path-style
URLs ``/s3/{logical-bucket}/{opaque-key}``. The public ``/s3/`` prefix is part of
the SigV4 signature. Requests must preserve raw path, percent encoding, query and
Host; signed requests cannot be redirected or normalized.

Native HTTP and ``ipx`` use existing ``ipa_live_*`` Bearer keys. Console actions
use existing signed-in sessions and authorized organization selection. API keys
have a fixed personal or organization workspace; an unsigned header cannot move
a key into another workspace. Current membership, suspension, role, parent-key
revocation/expiry, IP limits and credential scopes apply on every operation.

S3 SDKs use a separate InferencePort-issued Access Key ID and Secret Access Key,
not an AWS account key or existing scrypt-hashed API key. Secrets are revealed
once and stored as AES-GCM envelopes wrapped by an external Key Vault key. Keep
Authorization, secret values and presigned query strings out of logs/telemetry.

Management API
--------------

All management responses are JSON; S3 operations return S3 XML/errors. Errors
carry request IDs. These routes use the existing account/session authentication:

.. list-table::
   :header-rows: 1
   :widths: 20 45 35

   * - Method
     - Path
     - Behavior
   * - GET
     - ``/v1/buckets/status`` and ``/v1/buckets/pricing``
     - Public availability and verified rate catalog
   * - GET / POST
     - ``/v1/buckets``
     - List / create logical buckets
   * - GET / PATCH / DELETE
     - ``/v1/buckets/{id}``
     - Metadata / rename, quota or read-only status / delete empty bucket
   * - GET
     - ``/v1/buckets/{id}/objects``
     - JSON browser listing, prefix and continuation token
   * - GET
     - ``/v1/buckets/{id}/usage``
     - Measured operations, bytes and versioned settlements
   * - GET / POST
     - ``/v1/buckets/s3-credentials``
     - List metadata / issue a reveal-once scoped credential
   * - DELETE
     - ``/v1/buckets/s3-credentials/{id}``
     - Revoke immediately
   * - POST
     - ``/v1/buckets/s3-credentials/{id}/rotate``
     - Reveal-once replacement with the same scopes; optionally revoke previous
   * - POST
     - ``/v1/buckets/pricing/quote``
     - Quote a quantity in Azure meter units at a selected immutable rate version

Create a bucket with ``{"name":"models","quota_bytes":10737418240}``. Owner IDs
are derived from authentication, never accepted as authority in request bodies.
Credentials accept ``permissions``, optional ``bucket_ids``/``key_prefixes``,
``expires_in`` (60 seconds to 90 days), IP allowlist and rate limit. Administration
requires the appropriate current account/org rights. Prefix credentials cannot
administer buckets. Rotation defaults to keeping the previous key active until
clients are updated; ``{"revoke_previous":true}`` revokes it atomically.

Supported S3 operations
-----------------------

The beta implements List/Create/Head/DeleteBucket, GetBucketLocation,
Put/Get/Head/DeleteObject, ListObjectsV2, and multipart initiate/upload/list-parts/
complete/abort. It supports streamed uploads, ranges, metadata, conditional writes,
S3 ETags, CRC32/CRC32C/CRC64NVME/SHA/MD5 checksums, SigV4 header signing, short-lived
presigned URLs and signed/checksummed ``aws-chunked`` bodies. Uploads, parts,
reservations and object pointers are durable across server replicas. Listing
supports prefix, slash delimiter and signed scoped continuation tokens.

The signing region is ``us-east-1``, independent of Azure's physical ``eastus``.
Presigns are limited to 15 minutes. A request/part can contain up to 5 GiB;
larger objects use multipart. Concurrent replacement can return
``OperationAborted``; retry a new upload. A same-size overwrite can succeed at full
logical quota. Active uploads prevent deleting an otherwise empty bucket.

Not enabled: SigV2, temporary session tokens, CopyObject, tagging/version APIs,
lifecycle, Bucket CORS/policies/events, non-slash delimiters or ``start-after``.
Only Hot / S3 ``STANDARD`` is enabled. Cool, Cold and Archive are not advertised;
Archive would require rehydration and cannot promise immediate GET.

SDK configuration
-----------------

Use InferencePort-issued credentials from a secure provider/profile. Force SigV4
and path addressing. Some default boto3 presign configurations otherwise choose
SigV2. These are endpoint configurations for an enabled beta/test service:

.. code-block:: console

   aws configure set s3.addressing_style path --profile inferenceport
   aws configure set s3.signature_version s3v4 --profile inferenceport
   aws --profile inferenceport --region us-east-1 \
     --endpoint-url https://api.inferenceport.ai/s3/ s3 ls

.. code-block:: python

   import boto3
   from botocore.config import Config

   client = boto3.client(
       "s3", endpoint_url="https://api.inferenceport.ai/s3/",
       region_name="us-east-1",
       config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
   )

.. code-block:: javascript

   import { S3Client } from "@aws-sdk/client-s3";
   const client = new S3Client({
     endpoint: "https://api.inferenceport.ai/s3/",
     region: "us-east-1",
     forcePathStyle: true,
   });

Keys are opaque UTF-8, decoded once. SDK requests preserve Unicode, encoded
slashes, repeated separators and dot segments. Browser WHATWG URL/fetch handling
normalizes literal ``..`` path segments: use a client that preserves the original
request target for those presigned URLs, and never edit a URL after signing.

Azure retail pricing and credits
--------------------------------

The backing design is one dedicated private eastus StorageV2 Standard_LRS account
and one container, separate from managed-agent storage. No account-wide Azure
credentials or physical blob paths are returned to customers. LRS does not provide
regional disaster recovery; restore/backup validation remains a launch gate.

The catalog imports official Azure public retail meters daily, with immutable
versions, effective dates, actual region/redundancy/tier and no markup. It includes
storage GB-month, actual Blob operations and applicable transfer. One S3 operation
can generate several billed Azure calls; SQL-only listing does not invent an
Azure transaction tariff. Account-wide capacity/transfer bands are shared across
measured tenants, not reset as a personal free allowance. Quantities use binary
GiB/byte-hour conversion and actual UTC month hours for capacity prorating.

Existing personal/org wallets and ledgers are reused. Refundable holds reduce
available credits before billable work; closed-day settlement refunds holds and
debits measured costs under the owner-wallet lock. Deterministic IDs prevent
retry charges. Fractions carry at the existing 0.0001-credit precision. Retained
versions, soft-deleted and pending data remain billable. Insufficient credits
pause new writes; they never cause automatic object deletion.

No funded promotional or reserved-capacity offer is available. Microsoft
account-specific promotions are not tenant credits. Unverified/missing rates are
not replaced with examples or presented as free storage. Historical quotes do not
change settled charges.

Testing and current limits
--------------------------

The repository includes a local HTTPS/Postgres/Azurite E2E launcher, current
boto3, AWS CLI v2 and JS SDK v3 checks, browser/CLI lifecycle checks, two-replica
concurrency tests and pgTAP isolation tests. Real Key Vault wrap/unwrap is verified.
Real Azure Blob and 5 GiB+ conformance remain blocked by the managed session's
Blob-host proxy restriction and required Blob data RBAC; the large-file runner is
provided and must pass before such compatibility is claimed. Production migration,
load/recovery drills, invoice reconciliation, private networking and financial
review remain rollout gates.

See the `implementation and E2E runbook <https://github.com/sharktide/InferencePort-Lightning/blob/feat/168-inferenceport-buckets/docs/buckets/README.md>`_
and `epic #168 <https://github.com/sharktide/InferencePort-Lightning/issues/168>`_.
