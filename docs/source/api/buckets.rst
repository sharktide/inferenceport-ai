InferencePort Buckets
=====================

Buckets provides private and public object storage for model weights, datasets, checkpoints
and generated artifacts using your existing account or organization workspace.
A server without storage configuration reports ``not_available`` and rejects
storage operations with ``503``.

Endpoints and ownership
-----------------------

The S3 endpoint is ``https://api.inferenceport.ai/{workspace-id}/s3/``. Copy the
exact endpoint from the console's Connect tab, ``ipx bucket connection``, or the
credential issuance response. The workspace ID is your personal user UUID or the
organization UUID. Use path-style URLs
``/{workspace-id}/s3/{logical-bucket}/{opaque-key}``. The entire path, including
the workspace ID and ``/s3/``, is part of the SigV4 signature. Preserve raw path,
percent encoding, query and Host; signed requests cannot be redirected or normalized.

Bucket names are unique only within a workspace. Two users or organizations can
both create ``models``. Credentials select the authorized workspace; the endpoint
must match it. Changing the workspace ID in a URL grants no access. The original
``https://api.inferenceport.ai/s3/`` endpoint remains supported for existing clients.

Native HTTP and ``ipx`` use existing ``ipa_live_*`` Bearer keys. Console actions
use existing signed-in sessions and authorized organization selection. API keys
have a fixed personal or organization workspace; an unsigned header cannot move
a key into another workspace. Current membership, suspension, role, parent-key
revocation/expiry, IP limits and credential scopes apply on every operation.

S3 SDKs use a separate InferencePort-issued Access Key ID and Secret Access Key,
not an AWS account key or existing scrypt-hashed API key. Secrets are returned only during issuance/rotation and bounded retries,
and stored as AES-GCM envelopes wrapped by an external encryption key. Keep
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
   * - GET
     - ``/v1/buckets/workspace``
     - Authenticated workspace ID, kind, S3 endpoint, signing region and addressing style
   * - POST
     - ``/v1/buckets/metadata``
     - Refresh up to 100 known bucket IDs; only visible buckets in the authenticated workspace are returned
   * - GET / POST
     - ``/v1/buckets``
     - List / create logical buckets
   * - GET / PATCH / DELETE
     - ``/v1/buckets/{id}``
     - Metadata / rename, quota, visibility or read-only status / delete empty bucket
   * - GET
     - ``/v1/buckets/{id}/objects``
     - JSON browser listing, prefix and continuation token
   * - GET / HEAD / DELETE
     - ``/v1/buckets/{id}/object?key=...``
     - Native object actions preserving dot-only keys in browsers
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
     - Quote a quantity in published pricing units at a selected immutable rate version

Create a bucket with ``{"name":"models","quota_bytes":10737418240}``. Owner IDs
are derived from authentication, never accepted as authority in request bodies.
The console's Settings action and ``ipx bucket update`` expose name, maximum-size
visibility and upload-status changes. Quota must be a whole number between one byte and one
TiB and cannot be smaller than stored plus reserved bytes. Names remain unique
within the workspace; a conflict returns ``409``. Renaming preserves bucket ID,
objects and bucket-scoped credentials, but S3 clients must use the new name.
Finish or abort active uploads before renaming a bucket.

Public and private access
-------------------------

Buckets are private by default, including all existing buckets. Set
``"visibility":"public"`` when creating a bucket, or PATCH its ID with
``{"visibility":"public"}``. Only workspace administrators can change visibility.
The console exposes this in Create and Settings; use Copy public URL in the file
browser to share a file.

Public means anyone with a known object URL can GET or HEAD that file without an
account or S3 credential. Public access does not allow listing, uploading,
deleting, changing settings or viewing usage. Private downloads still require
authorized account access, scoped S3 credentials or an unexpired signed URL.

Object listings from a public bucket include a server-issued ``public_url``:
``https://api.inferenceport.ai/public/buckets/{bucket-id}/object?key=...``.
Use the API's returned URL, especially on separate storage hosts. The UUID keeps
names independent across workspaces and URLs stable when a bucket is renamed;
query encoding preserves opaque keys, including dot-only path segments.
Visibility alone does not grant S3 listing or management access.
Owner-only ACL requests accept ``private``, ``bucket-owner-full-control``, or the
canonical owner's sole full-control XML grant. Public/external ACL grants are
rejected. These requests preserve existing bucket visibility and policy access;
``private`` does not override an explicit public bucket policy. Anonymous S3
listing requires a policy grant; visibility alone does not grant it.

Public download operations and transfer are billed to the bucket's personal or
organization wallet. Organization-wide spending limits and available credits
still apply. Anonymous requests are recorded without an invented member/key actor;
they do not use a publishing administrator's individual budget. Downloads may
fail when pricing or credits are unavailable. Public access has IP and bucket
request limits.

PATCH ``{"visibility":"private"}`` blocks new anonymous requests. Responses use
``Cache-Control: no-store``; already downloaded files and transfers already
accepted cannot be recalled. Pausing uploads does not disable public downloads.
Deleted buckets and unavailable owners cannot serve public objects. Object
responses retain attachment, nosniff and sandbox protections.

Credential issuance and rotation accept an optional UUID ``Idempotency-Key``
header. Identical retries from the same authenticated owner, actor and parent key
return the same result for ten minutes. Changed options, revoked/expired results
and retries after that window fail explicitly. A new intent requires a new UUID.
Rotation preserves the original expiry. Secrets are not otherwise recoverable.

Credentials accept ``permissions``, optional ``bucket_ids``/``key_prefixes``,
``expires_in`` (60 seconds to 90 days), IP allowlist and rate limit. Administration
requires the appropriate current account/org rights. Prefix credentials cannot
administer buckets. Rotation defaults to keeping the previous key active until
clients are updated; ``{"revoke_previous":true}`` revokes it atomically.

Supported S3 operations
-----------------------

The gateway supports bucket/object operations, copy and multipart copy,
legacy/v2 listing, paginated multipart discovery, bucket/object tags, and owner
ACL inspection. HTTP content metadata, signed response overrides, ranges,
part-number reads, durable part attributes, all ten modeled checksum algorithms,
SigV4 headers and signed/checksummed ``aws-chunked`` uploads are supported.
Browser uploads can use SDK-generated SigV4 POST policies with expiry, field,
key-prefix and content-length conditions.

Versioning is opt-in using ``put_bucket_versioning``. Enabled buckets preserve
older versions and create delete markers; explicit version IDs select historical
GET/HEAD/COPY/DELETE/tag/attribute operations. Suspended versioning preserves
numbered versions while replacing the null version. Retained versions count
toward bucket quota and prevent deleting the bucket until removed.

Copy requires source read and destination write access in the same workspace,
with both credential scopes enforced. Content metadata and tags are preserved
unless replaced explicitly. Object tags allow ten entries and bucket tags fifty.
Tag changes do not change an object's LastModified.

Bucket policies enforce Allow/Deny rules beneath existing workspace, role and
credential limits. Public-access blocks constrain public visibility and policy
access. Per-bucket CORS rules apply on workspace-scoped endpoints. Explicit public
policies can grant anonymous reads or listing; visibility alone grants only
known-object downloads. Requester Pays requires the request acknowledgment while
charges continue to use the owning workspace wallet. Cross-account AWS IAM
semantics are not implemented.

New uploads use authenticated AES-256 encryption. SSE-C requires the same customer
key on applicable operations and does not store that key. Managed key modes use
the existing external key service and workspace key identifiers; AWS KMS account
keys/ARNs are not supported. Lifecycle rules support expiration, noncurrent-version
expiration, marker cleanup and incomplete-upload abort.

Use ``us-east-1`` as the signing region. Presigns can last up to seven days,
subject to live credential expiry/revocation and server limits. Requests/parts
can contain up to 5 GiB; larger objects use multipart. Concurrent replacement can
return ``OperationAborted``; retry as a new upload. Active uploads prevent bucket
deletion. Stored HTTP cache metadata is honored: choose cache directives with
your private-data and revocation requirements in mind.

This remains an S3 subset. Provider-enforced retention/legal hold, replication,
notifications, inventory/analytics, website hosting, public/external ACL grants, SigV2,
temporary session tokens, archival classes, tier transitions and restoration
remain unsupported. ``STANDARD`` is the supported storage class. The API
repository's operation matrix records remaining parameter and operation gaps.

For example, AWS CLI server-side copy, move, sync and recursive removal use the
same endpoint and profile as uploads. Check the selected workspace and credential
scopes before running mutations:

.. code-block:: console

   aws --profile inferenceport --endpoint-url https://api.inferenceport.ai/WORKSPACE_UUID/s3 s3 cp s3://models/source.bin s3://models/copied.bin
   aws --profile inferenceport --endpoint-url https://api.inferenceport.ai/WORKSPACE_UUID/s3 s3 sync s3://models/ ./downloaded-models/

Bulk deletion accepts up to 1000 keys and reports failures per key; an HTTP 200
response can still contain individual deletion errors. Copying objects larger
than 5 GiB requires multipart copy. AWS CLI chooses multipart copy from its
configured multipart threshold and preserves tags using tagging operations.

SDK configuration
-----------------

Use InferencePort-issued credentials from a secure provider/profile. Force SigV4
and path addressing. Some default boto3 presign configurations otherwise choose
SigV2. Replace ``WORKSPACE_UUID`` below with the ID returned by the authenticated
workspace endpoint; do not use the bucket name in its place:

.. code-block:: console

   aws configure set s3.addressing_style path --profile inferenceport
   aws configure set s3.signature_version s3v4 --profile inferenceport
   aws --profile inferenceport --region us-east-1 \
     --endpoint-url https://api.inferenceport.ai/WORKSPACE_UUID/s3/ s3 ls

.. code-block:: python

   import boto3
   from botocore.config import Config

   client = boto3.client(
       "s3", endpoint_url="https://api.inferenceport.ai/WORKSPACE_UUID/s3/",
       region_name="us-east-1",
       config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
   )

.. code-block:: javascript

   import { S3Client } from "@aws-sdk/client-s3";
   const client = new S3Client({
     endpoint: "https://api.inferenceport.ai/WORKSPACE_UUID/s3/",
     region: "us-east-1",
     forcePathStyle: true,
   });

rclone
------

Use ``rclone config`` to create an S3 remote with the following settings. Enter
the InferencePort-issued Access Key ID and Secret Access Key when prompted:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Setting
     - Value
   * - Provider
     - ``Other``
   * - Endpoint
     - The exact workspace endpoint from Connect, including ``/{workspace-id}/s3/``
   * - Region
     - ``us-east-1``
   * - Force path style
     - ``true``
   * - ACL
     - Default ``private`` or ``bucket-owner-full-control``

For a remote named ``inferenceport`` and an existing permitted bucket ``models``:

.. code-block:: console

   rclone copy ./models inferenceport:models/
   rclone check ./models inferenceport:models/
   rclone copy inferenceport:models/ ./downloaded-models/

Multipart upload, checksum-based sync/check, server-side copy/move, empty files,
Unicode names and modification-time updates are tested with rclone v1.76.0.
Read/write credentials can ensure an existing permitted destination without
changing its quota, visibility or data. Creating new buckets, changing settings
or deleting a bucket requires admin capability. Prefix and bucket scopes still
constrain object access.

Object responses default to attachments, with content sniffing disabled and
sandbox restrictions. Content metadata can select other delivery headers; this
is not an application-hosting service.

Keys are opaque UTF-8, decoded once. SDK requests preserve Unicode, encoded
slashes, repeated separators and dot segments. Browser WHATWG URL/fetch handling
normalizes literal ``..`` path segments: use a client that preserves the original
request target for those presigned URLs, and never edit a URL after signing.

Pricing and credits
-------------------

``GET /v1/buckets/pricing`` publishes current storage, operation and transfer
prices in USD with volume bands, effective dates and an immutable rate version.
All usage is billed from the first unit; there is no free storage or transfer
allowance. Always use the returned catalog for current prices. Stored and retained
data is prorated by byte-hours using the actual UTC month length.

``POST /v1/buckets/pricing/quote`` accepts a meter, quantity and optional rate
version and returns ``cost`` in USD. A quote does not reserve credits. Historical
quotes and recorded usage retain their original rate versions when new prices
are published. Volume bands are shared across the service.

Existing personal/org wallets and ledgers are reused. Refundable holds reduce
available credits before billable work; closed-day settlement refunds holds and
debits measured charges under the owner-wallet lock. Deterministic IDs prevent
retry charges. Fractions carry at the existing 0.0001-credit precision. Retained
versions and pending data remain billable after logical deletion. Insufficient
credits pause new writes; they never cause automatic object deletion.

Compatibility
-------------

AWS CLI v2, boto3 and JavaScript SDK v3 are tested with path-style addressing and
an endpoint containing ``/s3/``. Other clients must support that configuration and
the operation subset listed above. Bucket names are unique within a workspace;
the credentials determine which personal or organization workspace is accessed.

Prefix-scoped credentials can list their allowed prefixes, but cannot list the
bucket root. For clients that require whole-bucket browsing, issue a credential
with the object-prefix field blank. Turn off read-only access when uploads are
required. Rotation preserves the old credential's scope.

See the `API setup and operations guide <https://github.com/sharktide/InferencePort-Lightning/blob/main/docs/buckets/README.md>`_.
