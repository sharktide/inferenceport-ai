InferencePort Buckets (planned)
===============================

.. important::

   Buckets is not available yet. The current implementation is a security and
   protocol foundation, not a launched object-storage service. Bucket creation,
   transfers, credentials and billing are disabled. AWS CLI, boto3 and JavaScript
   SDK compatibility has not been established. No production migration or Azure
   storage change is included in the foundation.

Availability and pricing discovery
----------------------------------

``GET /v1/buckets/status`` and ``GET /v1/buckets/pricing`` return a public,
non-mutating catalog. A server without this foundation may return ``404``.
The initial response includes ``status: not_available``,
``sdk_compatibility: unverified``, empty tiers/meters/offers and a null active
rate version. No illustrative rates or discounts are substituted.
Management requests return JSON ``503``; reserved S3 routes return XML
``ServiceUnavailable`` with ``x-amz-request-id``. There are no working object
operations in this release.

Target endpoint and authentication
----------------------------------

The canonical endpoint is ``https://api.inferenceport.ai/s3/``. The intended
path-style form is ``/s3/{logical-bucket}/{opaque-key}``. The public ``/s3/``
prefix participates in SigV4 signing. Proxies must preserve the original raw
path, percent encoding, Host and query bytes; signed requests cannot be
redirected or normalized.

First-party clients will reuse existing ``ipa_live_*`` Bearer keys. Standard
S3 SDKs need a separate InferencePort-issued Access Key ID and Secret Access
Key. Existing API-key hashes cannot be used for SigV4. S3 secrets will be
revealed once and stored as envelopes encrypted with an external Key Vault
key. Never put either credential in URLs, source control, shell history,
telemetry or logs. Presigned URL query strings are credentials too.

Personal scope comes from the authenticated user. Organization scope requires
live membership, role, suspension, key and billing checks. An object key,
URL or unsigned header cannot grant access to another owner. S3 credentials
have fixed owner and optional bucket/key-prefix restrictions. Revoking the
credential, parent key or actor rights must remove access on every replica.

Client examples for future sandbox validation
---------------------------------------------

These are target configurations, **not working-service instructions**. Do not
point tests at production or interpret these examples as a compatibility claim.
Use credentials issued by the future test service, not AWS account credentials.

Configure ``addressing_style = path`` under the AWS CLI profile's ``s3``
configuration, then test the public prefix:

.. code-block:: console

   aws --profile inferenceport-test --region us-east-1 \
     --endpoint-url https://api.inferenceport.ai/s3/ s3 ls

.. code-block:: python

   import boto3
   from botocore.config import Config

   client = boto3.client(
       "s3", endpoint_url="https://api.inferenceport.ai/s3/",
       region_name="us-east-1",
       config=Config(s3={"addressing_style": "path"}),
       # Load InferencePort-issued test credentials from your secure profile.
   )

.. code-block:: javascript

   import { S3Client } from "@aws-sdk/client-s3";
   const client = new S3Client({
     endpoint: "https://api.inferenceport.ai/s3/",
     region: "us-east-1",
     forcePathStyle: true,
     // Load InferencePort-issued test credentials with a secure provider.
   });

The SigV4 signing region ``us-east-1`` is independent of Azure's physical
``eastus`` region. Full release tests must include multipart 5GB+ uploads,
header signing, presigned URLs, current SDK checksum/streaming modes, XML
errors, listing pagination, ranges, revocation and two-user/two-org isolation.
The foundation verifier rejects SigV2, session tokens and ``aws-chunked``
streaming signatures; no SDK compatibility is claimed until the required modes
are implemented and tested. Copy, tagging, versioning APIs, lifecycle, CORS,
policies and event notifications are not currently supported.

Azure pricing, durability and tiers
-----------------------------------

The initial deployment design is a dedicated private Azure account in
``eastus``, LRS redundancy, one ``inferenceport-buckets`` container and Hot
storage. These are design choices, not provisioned infrastructure. LRS does
not protect against a regional loss. Recovery and backup drills are launch
requirements. Customers never receive physical Azure paths or account keys.

The pricing contract is Azure's published retail unit rates for the actual
backing configuration, without markup. Rates will come from a daily refreshed,
versioned official Azure Retail Prices API catalog. Applicable charges include
capacity, actual Azure calls, retrieval, outbound transfer, versions/soft-deleted
data and retention. One S3 request can make multiple billed Azure operations.
GB/GiB conversions, prorating, capacity bands and effective dates must accompany
the published catalog. Existing personal and org credit ledgers will be reused.

There are no published rates yet. Cool, Cold and Archive remain unavailable
until supported and verified on the deployed account. Cool/Cold/Archive can
have minimum-retention and early-deletion charges; Archive requires rehydration
before GET. Microsoft account promotions do not transfer to customers. Free
allowances and reserved-capacity offers remain unavailable without approved,
funded equivalent terms. Insufficient credits must not trigger object deletion.

See the `implementation epic <https://github.com/sharktide/InferencePort-Lightning/issues/168>`_
for launch acceptance criteria and remaining work.
