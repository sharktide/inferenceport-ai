Pay-2-Go (P2G) API
===================

The Pay-2-Go API is the credit-billed API for enterprise and production
integrations. Each request is metered against your wallet balance rather than
plan quotas.

Base URL
--------

.. code-block:: text

   https://sharktide-lightning.hf.space/v1

Authentication
--------------

The P2G router resolves either a Supabase JWT or a dashboard-generated API key.
All requests require an ``Authorization: Bearer`` header.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/v1/me \
     -H "Authorization: Bearer YOUR_TOKEN"

Account and config
------------------

``GET /v1/config``
~~~~~~~~~~~~~~~~~~

Returns the public dashboard configuration used by the web console.

.. code-block:: json

   {
     "dashboard": {
       "appName": "InferencePort AI",
       "homeUrl": "https://inference.js.org",
       "apiBaseUrl": "https://sharktide-lightning.hf.space",
       "supportEmail": "inferenceportai@gmail.com"
     },
     "supabase": {
       "url": "https://...",
       "publishableKey": "...",
       "resetRedirectUrl": "https://inference.js.org/reset.html"
     },
     "billing": {
       "currency": "USD",
       "packs": []
     },
     "pricing": {
       "textCreditPerMillionTokens": 0.75,
       "imageCreditPerImage": 0.02,
       "videoCreditPerSecond": 0.01,
       "audioCreditPerSecond": 0.01,
       "audioDefaultSeconds": 10
     },
     "models": [],
     "notices": [],
     "limits": {
       "requestsPerMinutePerIdentity": 120,
       "minimumTextCreditsBalance": 10
     },
     "generated_at": "2026-06-13T12:00:00Z"
   }

``GET /v1/me``
~~~~~~~~~~~~~~

Returns the current wallet and usage summary for the authenticated identity.

.. code-block:: json

   {
     "identity": {
       "email": "user@example.com",
       "auth_type": "jwt",
       "user_id": "uuid-here"
     },
     "wallet": {
       "balance_credits": "42.5000",
       "total_purchased": "100.0000",
       "total_spent": "57.5000"
     },
     "usage_summary": {
       "text": { "total_tokens": 15000, "total_credits": "0.0113" },
       "image": { "total_images": 5, "total_credits": "0.1000" },
       "video": { "total_seconds": 30, "total_credits": "0.3000" },
       "audio": { "total_seconds": 60, "total_credits": "0.6000" }
     },
     "generated_at": "2026-06-13T12:00:00Z"
   }

``GET /v1/credits/ledger``
~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns the latest credit ledger entries.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/v1/credits/ledger?limit=50 \
     -H "Authorization: Bearer YOUR_TOKEN"

Query parameters:

* ``limit`` — optional integer (default 50, max 500).

Response:

.. code-block:: json

   {
     "entries": [
       {
         "id": "uuid",
         "user_id": "uuid",
         "delta_credits": "-0.0113",
         "entry_type": "usage",
         "usage_kind": "text",
         "source": "v1_chat",
         "source_ref": "text:abc123",
         "unit_label": "tokens",
         "metadata": { "input_tokens": 100, "output_tokens": 50, "total_tokens": 150 },
         "created_at": "2026-06-13T12:00:00Z"
       }
     ]
   }

Model listing
--------------

``GET /v1/models``
~~~~~~~~~~~~~~~~~~

Returns the same model list as ``/gen/models`` in OpenAI-compatible format.

.. code-block:: text

   {
     "object": "list",
     "data": [ ... ]
   }

API key management
------------------

``GET /v1/lightning-api-keys``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Lists all API keys for the authenticated user.

.. code-block:: json

   {
     "items": [
       {
         "id": "uuid",
         "name": "My Production Key",
         "keyPrefix": "ipa_live_AbCdEf",
         "createdAt": "2026-01-01T00:00:00Z",
         "lastUsedAt": "2026-06-12T00:00:00Z",
         "expiresAt": null,
         "revokedAt": null,
         "isRevoked": false,
         "isExpired": false
       }
     ]
   }

``POST /v1/lightning-api-keys``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Creates a new API key.

.. code-block:: bash

   curl -X POST https://sharktide-lightning.hf.space/v1/lightning-api-keys \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "My Production Key",
       "expiresAt": "2027-01-01T00:00:00Z"
     }'

Request fields:

* ``name`` — required string (max 64 chars).
* ``expiresAt`` — optional ISO-8601 timestamp.

Response includes the ``rawKey`` — save it immediately as it is only shown
once:

.. code-block:: text

   {
     "apiKey": { ... },
     "rawKey": "ipa_live_AbCdEf123456..."
   }

``DELETE /v1/lightning-api-keys/{key_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Revokes an API key immediately.

.. code-block:: bash

   curl -X DELETE https://sharktide-lightning.hf.space/v1/lightning-api-keys/uuid-here \
     -H "Authorization: Bearer YOUR_TOKEN"

Chat completions
----------------

``POST /v1/chat/completions``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Credit-metered chat completions. The server checks wallet balance before
generating and charges credits based on actual token usage.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/v1/chat/completions \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "messages": [
         { "role": "user", "content": "Give me a concise API summary." }
       ],
       "model": "lightning",
       "stream": false
     }'

Request fields:

* ``messages`` — required array of message objects.
* ``model`` — optional string. Defaults to ``lightning`` (the auto-router).
  Specify an override model ID to route to a specific configured provider.
* ``stream`` — optional boolean. When ``true``, the response is streamed as
  ``text/event-stream``.

Streaming behavior:

* The stream includes a ``payg-usage`` event (not a ``data:`` event) at the
  end with final credit charge details:

.. code-block:: text

   event: payg-usage
   data: {"payg_input_tokens": 50, "payg_output_tokens": 120, "payg_total_tokens": 170, "payg_credits_charged": 0.0001275}

Non-streaming response includes payg fields in the ``usage`` object:

.. code-block:: text

   {
     "id": "...",
     "object": "chat.completion",
     "choices": [ ... ],
     "usage": {
       "prompt_tokens": 50,
       "completion_tokens": 120,
       "total_tokens": 170,
       "payg_input_tokens": 50,
       "payg_output_tokens": 120,
       "payg_total_tokens": 170,
       "payg_credits_charged": 0.0001275
     }
   }

Image generation
----------------

``POST /v1/images/generations``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Credit-metered image generation. Charges per image from your wallet.

.. code-block:: bash

   curl -X POST https://sharktide-lightning.hf.space/v1/images/generations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "A futuristic cityscape at night",
       "n": 1,
       "mode": "fantasy",
       "image_urls": []
     }'

Request fields:

* ``prompt`` — required string.
* ``n`` — optional integer (1–4). Number of images to generate. Default 1.
* ``mode`` — optional string. ``fantasy`` or ``realistic``.
* ``image_urls`` — optional array of up to 2 URLs or base64 data URIs for
  image-to-image conditioning.

Response:

.. code-block:: json

   {
     "created": 1718300000,
     "data": [
       {
         "b64_json": "/9j/4AAQ...",
         "mime_type": "image/jpeg"
       }
     ],
     "usage": {
       "payg_credits_charged": 0.02,
       "image_count": 1
     }
   }

Video generation
----------------

``POST /v1/videos/generations``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Credit-metered video generation. Charges per second of video from your wallet.

.. code-block:: bash

   curl -X POST https://sharktide-lightning.hf.space/v1/videos/generations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "Time-lapse of a flower blooming",
       "ratio": "3:2",
       "mode": "normal",
       "duration": 5,
       "image_urls": []
     }'

Request fields:

* ``prompt`` — required string.
* ``ratio`` — optional string. ``3:2`` (default), ``2:3``, or ``1:1``.
* ``mode`` — optional string. ``normal`` (default) or ``fun``.
* ``duration`` — optional integer. Seconds, clamped to 1–10. Default 5.
* ``image_urls`` — optional array of up to 2 URLs or base64 data URIs.

Response is raw ``video/mp4`` bytes with credit charge headers:

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Header
     - Value
   * - ``X-Payg-Credits-Charged``
     - Decimal credits charged for this request (e.g. ``0.05``)
   * - ``X-Payg-Units``
     - Duration in seconds (e.g. ``5``)
   * - ``X-Payg-Unit-Label``
     - Always ``seconds``

Audio generation
----------------

``POST /v1/audio/generations``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Credit-metered audio/sound-effect generation. Charges per second of audio from
your wallet.

.. code-block:: bash

   curl -X POST https://sharktide-lightning.hf.space/v1/audio/generations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "Gentle rain and thunder",
       "duration_seconds": 10
     }'

Request fields:

* ``prompt`` — required string.
* ``duration_seconds`` — optional integer. Clamped to 1–90. Default depends on
  server configuration (typically 10).

Response is raw ``audio/mpeg`` bytes with credit charge headers:

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Header
     - Value
   * - ``X-Payg-Credits-Charged``
     - Decimal credits charged for this request (e.g. ``0.10``)
   * - ``X-Payg-Units``
     - Duration in seconds (e.g. ``10``)
   * - ``X-Payg-Unit-Label``
     - Always ``seconds``

3D generation
-------------

3D generation uses an **asynchronous job model** by default. Submitting a
request returns a ``job_id`` immediately (HTTP 202); you then poll
``GET /v1/3d/jobs/{job_id}`` until the job reaches ``completed`` or
``failed`` status.

Credits are charged at submission time and refunded automatically if the job
fails.

.. note::

   A **legacy synchronous mode** is available via ``?sync=true`` for existing
   integrations. It blocks until completion and returns the same response shape
   as before. It is not recommended for production use because 3D generation can
   take several minutes and may cause HTTP timeouts on slow connections.

``POST /v1/3d/generations``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Submit a 3D generation job. Returns ``202 Accepted`` in async mode (default)
or ``200 OK`` in sync mode.

.. code-block:: bash

   # Async (recommended)
   curl -X POST https://sharktide-lightning.hf.space/v1/3d/generations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "tripoSR",
       "image_urls": ["https://example.com/object.jpg"]
     }'

   # Legacy sync
   curl -X POST "https://sharktide-lightning.hf.space/v1/3d/generations?sync=true" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "asset-harvester",
       "prompt": "A wooden chair",
       "image_urls": ["https://example.com/chair.jpg"]
     }'

Query parameters:

* ``sync`` — optional boolean (default ``false``). Set ``true`` to use legacy
  blocking behaviour.

Request body fields:

* ``model`` — required string. ``"asset-harvester"`` or ``"tripoSR"``.
* ``image_urls`` — required array. At least one URL or base64 data URI.
  The first element is used as the input image.
* ``prompt`` — required string **when** ``model`` is ``"asset-harvester"``.
  Not used by TripoSR.
* ``n`` — optional integer (1–4, default 1). Number of models to generate.
  Ignored when ``model`` is ``"tripoSR"`` (always 1).

Async response (HTTP 202):

.. code-block:: json

   {
     "job_id": "a3f1c2e4b5d6...",
     "status": "pending",
     "created_at": 1718300000.0,
     "poll_url": "/v1/3d/jobs/a3f1c2e4b5d6...",
     "usage": {
       "payg_credits_charged": 0.07,
       "model_count": 1
     }
   }

Sync response (HTTP 200, ``?sync=true`` only):

.. code-block:: json

   {
     "created": 1718300000,
     "data": [ { "model_glb_b64_bytes": "<BASE64>" } ],
     "usage": {
       "payg_credits_charged": 0.07,
       "model_count": 1
     }
   }

``GET /v1/3d/jobs/{job_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Poll the status of an async 3D job. Returns HTTP 202 while the job is still
running and HTTP 200 once it has completed or failed.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/v1/3d/jobs/a3f1c2e4b5d6... \
     -H "Authorization: Bearer YOUR_TOKEN"

Possible ``status`` values:

.. list-table::
   :widths: 20 80
   :header-rows: 1

   * - Status
     - Meaning
   * - ``pending``
     - Job queued, not yet started.
   * - ``processing``
     - Generation is underway.
   * - ``completed``
     - Generation finished. ``data`` field contains the model output.
   * - ``failed``
     - Generation failed. ``error`` field contains a human-readable reason.
       Credits have been refunded automatically.

Response while pending or processing (HTTP 202):

.. code-block:: json

   {
     "job_id": "a3f1c2e4b5d6...",
     "status": "processing",
     "model": "tripoSR",
     "created_at": 1718300000.0,
     "completed_at": null,
     "usage": { "payg_credits_charged": 0.07, "model_count": 1 }
   }

Response on completion (HTTP 200):

.. code-block:: json

   {
     "job_id": "a3f1c2e4b5d6...",
     "status": "completed",
     "model": "tripoSR",
     "created_at": 1718300000.0,
     "completed_at": 1718300312.5,
     "usage": { "payg_credits_charged": 0.07, "model_count": 1 },
     "data": [
       { "model_glb_b64_bytes": "<BASE64_ENCODED_GLB>" }
     ]
   }

Response on failure (HTTP 200):

.. code-block:: json

   {
     "job_id": "a3f1c2e4b5d6...",
     "status": "failed",
     "model": "tripoSR",
     "created_at": 1718300000.0,
     "completed_at": 1718300045.1,
     "usage": { "payg_credits_charged": 0.07, "model_count": 1 },
     "error": "TripoSR job abc123 failed: out of memory"
   }

**Recommended polling interval**: 4–10 seconds. Most jobs complete within
1–5 minutes depending on model and server load.

**Full async workflow example** (Python):

.. code-block:: python

   import base64, time, httpx

   TOKEN = "YOUR_TOKEN"
   BASE  = "https://sharktide-lightning.hf.space/v1"
   HEADERS = {"Authorization": f"Bearer {TOKEN}"}

   # 1. Submit
   r = httpx.post(f"{BASE}/3d/generations", headers=HEADERS, json={
       "model": "tripoSR",
       "image_urls": ["https://example.com/object.jpg"],
   })
   r.raise_for_status()
   job_id = r.json()["job_id"]

   # 2. Poll
   while True:
       r = httpx.get(f"{BASE}/3d/jobs/{job_id}", headers=HEADERS)
       r.raise_for_status()
       body = r.json()
       if body["status"] == "completed":
           glb_bytes = base64.b64decode(body["data"][0]["model_glb_b64_bytes"])
           break
       if body["status"] == "failed":
           raise RuntimeError(body["error"])
       time.sleep(5)

Output fields in ``data[]``:

* ``model_glb_b64_bytes`` — Base64-encoded GLB bytes. Present when
  ``model`` is ``"tripoSR"``.
* ``model_ply_b64_bytes`` — Base64-encoded PLY (Gaussian Splat) bytes.
  Present when ``model`` is ``"asset-harvester"``.
* ``orbit_video_b64_bytes`` — Base64-encoded MP4 showing a 360° orbit.
  Present when ``model`` is ``"asset-harvester"``.

.. note::

   All ``_b64_bytes`` fields contain Base64-encoded raw bytes. Decode them
   with ``base64.b64decode()`` (Python) or ``Buffer.from(str, 'base64')``
   (Node.js) to obtain the file content.

.. note::

   The 3D generation endpoint is currently in early access and may be subject
   to change. Contact support if you're interested in using or providing
   feedback on this feature.

Stripe
------

``GET /v1/stripe/reconcile/{session_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Looks up a Stripe checkout session and returns reconciliation details,
including payment method info and receipt URL. Used by the console confirm
page.

Pricing
-------

P2G pricing is credit-based. The default server rates are:

* **Text**: 0.75 credits per 1,000,000 tokens.
* **Image**: 0.02 credits per image.
* **Video**: 0.01 credits per second.
* **Audio**: 0.01 credits per second.
* **3D**: 0.07 credits per model.

The hosted configuration can override these defaults. The console at
``https://console.inferenceport.ai`` always shows the live dashboard values.

A minimum balance of 10 credits is required before text generation is allowed.

Rate limits
-----------

P2G requests are rate-limited per identity at 120 requests per minute by
default. Exceeding the limit returns HTTP 429.

Error codes
-----------

In addition to the common status codes, the P2G API returns:

* ``202`` — Job accepted (async 3D generation). Poll ``/v1/3d/jobs/{job_id}``
  for results.
* ``402`` — Insufficient credits. The wallet balance is below the minimum
  required for the operation. Check ``/v1/me`` for your current balance and
  purchase more credits from the console.
* ``402`` (text) — At least the minimum balance (typically 10 credits) is
  required for text generation.
* ``404`` — Job not found (``GET /v1/3d/jobs/{job_id}``).
* ``504`` — Sync 3D request timed out. Use async mode instead.
