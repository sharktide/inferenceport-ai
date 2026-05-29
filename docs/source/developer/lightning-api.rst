Lightning API
=============

InferencePort AI exposes two hosted API experiences on the same Lightning
backend:

* The **Generation API** is the subscription-backed API used for normal cloud
  chatting and the app's default Lightning chat flow.
* The **Pay-2-Go (P2G) API** is the credit-backed API intended for enterprise
  integrations, stable production workloads, and other usage that should be
  metered independently of a subscription.

Both APIs run on ``https://sharktide-lightning.hf.space`` and both can be used
with either a Supabase access token or a dashboard-generated Lightning API key.

Which API should I use?
-----------------------

Use this rule of thumb:

* **Generation (Subscription) API**: best for high-volume, regular chatting
  with low token usage. This is the default for chatting in the product, but it
  comes with strict abuse controls and per-plan token limits.
* **P2G API**: best for enterprise integrations, stable production APIs, and
  workloads that need predictable credit-based billing instead of plan quotas.

In other words:

* If you are building a chat UI and want the same behavior as the app, start
  with the Generation API.
* If you are building an external service, customer-facing integration, or
  production backend, use the P2G API.

How they work together
----------------------

The two APIs are complementary, not competing:

* A single account can use both.
* Subscription access controls the generation/chat experience and the daily
  plan limits shown in the app.
* P2G credits are separate and are spent from the wallet when you call the
  hosted ``/v1`` routes.
* The hosted console at ``https://inference.js.org/console`` is where you can
  review balances, inspect usage, buy credit packs, and create API keys.

Authentication
--------------

Lightning accepts either of these bearer credentials:

* A Supabase access token for the signed-in user.
* A dashboard-generated Lightning API key.

Use the same ``Authorization`` header for both APIs:

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/subscription \
     -H "Authorization: Bearer YOUR_TOKEN"

Create and manage API keys
--------------------------

1. Sign in at ``https://inference.js.org/console``.
2. Open the API key section in the console dashboard.
3. Enter a label for the key.
4. Optionally add an ISO-8601 expiration timestamp.
5. Copy the key immediately after creation. The raw secret is only shown once.

Generation API
--------------

The Generation API is the subscription-backed API. It uses plan resolution and
plan quotas to control access to cloud chat, images, video, and audio.

Base URL
~~~~~~~~

.. code-block:: text

   https://sharktide-lightning.hf.space

Plan and usage endpoints
~~~~~~~~~~~~~~~~~~~~~~~~

``GET /subscription``
^^^^^^^^^^^^^^^^^^^^^

Returns the authenticated user's resolved plan and subscription view.

Response fields:

* ``email``
* ``signed_up``
* ``plan_key``
* ``plan_name``
* ``subscription``: ``null`` for free users, otherwise a list of active or
  recent subscription rows
* ``auth_type``: ``jwt`` or ``api_key``

``GET /usage``
^^^^^^^^^^^^^^

Returns the current usage snapshot for the resolved identity.

Response fields:

* ``plan_key``
* ``plan_name``
* ``generated_at``
* ``usage.cloudChatDaily``
* ``usage.imagesDaily``
* ``usage.videosDaily``
* ``usage.audioWeekly``

Each usage metric contains:

* ``limit``
* ``used``
* ``remaining``
* ``window``
* ``period``

``GET /tier-config``
^^^^^^^^^^^^^^^^^^^^^

Returns the normalized plan catalog used by the UI.

* ``defaultPlanKey``
* ``plans[]`` with ``key``, ``name``, ``url``, ``price``, ``limits``, and
  ``order``

``GET /tiers``
^^^^^^^^^^^^^^

Returns the paid plans only, mainly for upgrade UI.

Status and discovery endpoints
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``GET /``
^^^^^^^^^

Permanent redirect to the public site.

``GET /models``
^^^^^^^^^^^^^^^

Scrapes the Ollama library page and returns public model metadata used by the
marketplace UI.

``GET /status``
^^^^^^^^^^^^^^^

Returns overall Lightning service health with:

* ``state``
* ``services``
* ``notifications``
* ``latest``

``HEAD /status/image``, ``/status/video``, ``/status/sfx``, ``/status/text``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Lightweight capability checks that return content-type headers only.

Generation endpoints
~~~~~~~~~~~~~~~~~~~~

All generation routes are rooted at ``/gen``.

``POST /gen/chat/completions``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

OpenAI-compatible chat completions endpoint.

Important request fields:

* ``messages``: required array
* ``stream``: optional boolean
* ``tools``: optional tool list
* ``tool_choice``: optional tool selection

Behavior notes:

* Lightning chooses an upstream model automatically based on prompt complexity,
  code signals, tools, and image presence.
* Authenticated requests consume ``cloudChatDaily`` usage from the resolved
  plan.
* Streaming responses are returned as ``text/event-stream``.
* The first streaming metadata chunk includes ``router_metadata.model_name``.

Example:

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/gen/chat/completions \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "messages": [
         {"role": "user", "content": "Write a haiku about shipping software."}
       ]
     }'

``POST /gen/image`` and ``GET /gen/image/{prompt}``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Image generation endpoint.

Request fields:

* ``prompt``: required
* ``mode``: optional, ``fantasy`` or ``realistic``
* ``image_urls``: optional list with up to two URLs or base64 image strings

Notes:

* Base64 image inputs are stored temporarily and re-served through
  ``/asset-cdn/assets/{image_id}``.
* Image generation consumes ``imagesDaily`` usage.

``POST /gen/video`` and ``GET /gen/video/{prompt}``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Pollinations-backed video generation.

Request fields:

* ``prompt``: required
* ``ratio``: optional, ``3:2``, ``2:3``, or ``1:1``
* ``mode``: optional, ``normal`` or ``fun``
* ``duration``: optional integer, clamped to ``1`` through ``10``
* ``image_urls``: optional list with up to two URLs or base64 image strings

Video generation consumes ``videosDaily`` usage.

``POST /gen/video/airforce`` and ``GET /gen/video/airforce/{prompt}``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Alternate Airforce-backed video endpoint with the same auth model. It also
consumes ``videosDaily`` usage.

``POST /gen/sfx`` and ``GET /gen/sfx/{prompt}``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Music and sound-effect generation. Requires ``prompt`` and consumes
``audioWeekly`` usage.

``POST /gen/tts`` and ``GET /gen/tts/{prompt}``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Text-to-speech generation. Requires ``prompt`` and also consumes
``audioWeekly`` usage.

``POST /gen/prompt_analyze``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Returns the router's chosen display model for a prompt payload. The request
body expects ``prompt`` as a message array.

Asset CDN
~~~~~~~~~

``GET /asset-cdn/assets/{image_id}``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Returns temporary PNG files created when image or video generation receives
base64 image inputs.

Rate limits and identity
~~~~~~~~~~~~~~~~~~~~~~~~

Lightning tracks these metrics per resolved identity:

* ``cloudChatDaily``
* ``imagesDaily``
* ``videosDaily``
* ``audioWeekly``

If no bearer token is present, Lightning falls back to a free-tier identity
derived from ``X-Client-ID`` when available, otherwise from request IP and
user-agent.

Rate limits and fit
~~~~~~~~~~~~~~~~~~~

Generation is the right choice when you want:

* Regular chat traffic.
* Low token usage.
* The same routing behavior used by the app's default chat flow.

It is not the best choice when you need:

* Enterprise-style billing isolation.
* A stable public API surface for production systems.
* A usage model that does not depend on subscription quotas.

P2G API
-------

The Pay-2-Go API is the credit-billed API. It keeps its own wallet and ledger
and charges credits per request.

Base URL
~~~~~~~~

.. code-block:: text

   https://sharktide-lightning.hf.space/v1

Auth and identity
~~~~~~~~~~~~~~~~~

The P2G router resolves either a Supabase JWT or a dashboard-generated API key.
It returns the authenticated user's wallet and usage history.

``GET /config``
^^^^^^^^^^^^^^^

Returns the public dashboard configuration used by the web console.

``GET /models``
^^^^^^^^^^^^^^^

Returns the configured model list.

``GET /me``
^^^^^^^^^^^

Returns the current wallet and usage summary.

``GET /credits/ledger``
^^^^^^^^^^^^^^^^^^^^^^^

Returns the latest ledger rows.

``GET /stripe/reconcile/{session_id}``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Looks up a Stripe checkout session and returns reconciliation details used by
the console confirm page.

Example:

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/v1/me \
     -H "Authorization: Bearer YOUR_TOKEN"

Credit-backed generation endpoints
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``POST /chat/completions``
^^^^^^^^^^^^^^^^^^^^^^^^^^

OpenAI-compatible chat completions with metered credit charging.

Behavior notes:

* Requests are rate-limited per identity.
* The server checks wallet balance before generating.
* Streamed responses include a ``payg-usage`` event when the final charge is
  known.
* The response usage object includes ``payg_input_tokens``,
  ``payg_output_tokens``, ``payg_total_tokens``, and ``payg_credits_charged``.

Example:

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/v1/chat/completions \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "messages": [
         {"role": "user", "content": "Give me a concise API summary."}
       ]
     }'

``POST /images/generations``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Generates an image and returns an OpenAI-style base64 payload.

``POST /videos/generations``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Generates a video and returns an ``video/mp4`` response.

``POST /audio/generations``
^^^^^^^^^^^^^^^^^^^^^^^^^^^

Generates audio and returns an ``audio/mpeg`` response.

Pricing
~~~~~~~

P2G pricing is credit-based. The current default server rates in
``helper/payg.py`` are:

* ``textCreditPerMillionTokens``: ``0.75`` credits per 1,000,000 text tokens
* ``imageCreditPerImage``: ``0.02`` credits per image
* ``videoCreditPerSecond``: ``0.01`` credits per second of video
* ``audioCreditPerSecond``: ``0.01`` credits per second of audio

The hosted configuration can override those defaults, and the console always
shows the live dashboard values.

API key behavior
----------------

API keys are long-lived bearer tokens that can be created from the console.
They are stored hashed in the database, and only the prefix is retained for
display purposes. A key can be revoked from the console at any time, after
which it stops authenticating requests immediately.

Failure modes
-------------

Common status codes:

* ``400`` for invalid request payloads
* ``401`` for invalid, expired, or revoked bearer credentials
* ``402`` when a P2G wallet does not have enough credits
* ``413`` for prompts that exceed configured size limits
* ``429`` for plan or spam-limit exhaustion
* ``500`` for upstream provider or server configuration failures
