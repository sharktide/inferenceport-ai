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

* ``402`` — Insufficient credits. The wallet balance is below the minimum
  required for the operation. Check ``/v1/me`` for your current balance and
  purchase more credits from the console.
* ``402`` (text) — At least the minimum balance (typically 10 credits) is
  required for text generation.
