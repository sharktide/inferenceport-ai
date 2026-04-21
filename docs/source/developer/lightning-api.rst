Lightning API
=============

The Lightning API is the hosted cloud API behind InferencePort AI Lightning.
Its base URL is ``https://sharktide-lightning.hf.space`` and the generation
routes live under ``/gen``.

Authentication
--------------

Lightning accepts either of these bearer tokens:

* A Supabase access token for the signed-in user.
* A dashboard-generated Lightning API key.

Send both forms the same way:

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/subscription \
     -H "Authorization: Bearer YOUR_TOKEN"

Generating API keys in the app
------------------------------

1. Sign in inside the desktop app.
2. Open ``Settings``.
3. Open the ``Account`` tab.
4. In ``Lightning API``, choose ``Generate API Key``.
5. Copy the key immediately. Only the unhashed secret is shown once.

The backing Supabase schema and RLS policies live in ``MISC/api.sql``.
Keys are stored hashed in ``public.lightning_api_keys`` and are scoped to the
owning user via ``auth.uid()`` RLS policies.

Headers
-------

Common request headers:

* ``Authorization: Bearer <supabase-jwt-or-api-key>`` for authenticated usage.
* ``X-Client-ID: <stable-client-id>`` to bind free-tier and usage tracking to a
  stable desktop/browser client.
* ``Accept: application/json`` for JSON endpoints.

Plan and usage endpoints
------------------------

``GET /subscription``
~~~~~~~~~~~~~~~~~~~~~

Returns the authenticated user's resolved plan and Stripe subscription view.

Response fields:

* ``email``
* ``signed_up``
* ``plan_key``
* ``plan_name``
* ``subscription``: ``null`` for free users, otherwise a list of active or
  recent subscription rows
* ``auth_type``: ``jwt`` or ``api_key``

``GET /usage``
~~~~~~~~~~~~~~

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
~~~~~~~~~~~~~~~~~~~~

Returns the normalized plan catalog used by the app UI:

* ``defaultPlanKey``
* ``plans[]`` with ``key``, ``name``, ``url``, ``price``, ``limits``, and
  ``order``

``GET /tiers``
~~~~~~~~~~~~~~

Returns the paid plans only, mainly for upgrade UI.

Status and discovery endpoints
------------------------------

``GET /``
~~~~~~~~~

Permanent redirect to the public site.

``GET /models``
~~~~~~~~~~~~~~~

Scrapes the Ollama library page and returns public model metadata used by the
marketplace UI.

``GET /status``
~~~~~~~~~~~~~~~

Returns overall Lightning service health with:

* ``state``
* ``services``
* ``notifications``
* ``latest``

``HEAD /status/image``, ``/status/video``, ``/status/sfx``, ``/status/text``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Lightweight capability checks that return content-type headers only.

Generation endpoints
--------------------

All generation routes are rooted at ``/gen``.

``POST /gen/chat/completions``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Pollinations-backed video generation.

Request fields:

* ``prompt``: required
* ``ratio``: optional, ``3:2``, ``2:3``, or ``1:1``
* ``mode``: optional, ``normal`` or ``fun``
* ``duration``: optional integer, clamped to ``1`` through ``10``
* ``image_urls``: optional list with up to two URLs or base64 image strings

Video generation consumes ``videosDaily`` usage.

``POST /gen/video/airforce`` and ``GET /gen/video/airforce/{prompt}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Alternate Airforce-backed video endpoint with the same auth model. It also
consumes ``videosDaily`` usage.

``POST /gen/sfx`` and ``GET /gen/sfx/{prompt}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Music and sound-effect generation. Requires ``prompt`` and consumes
``audioWeekly`` usage.

``POST /gen/tts`` and ``GET /gen/tts/{prompt}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Text-to-speech generation. Requires ``prompt`` and also consumes
``audioWeekly`` usage.

``POST /gen/prompt_analyze``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns the router's chosen display model for a prompt payload. The request body
expects ``prompt`` as a message array.

Asset CDN
---------

``GET /asset-cdn/assets/{image_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns temporary PNG files created when image or video generation receives
base64 image inputs.

Rate limits
-----------

Lightning currently tracks these metrics per resolved identity:

* ``cloudChatDaily``
* ``imagesDaily``
* ``videosDaily``
* ``audioWeekly``

If no bearer token is present, Lightning falls back to a free-tier identity
derived from ``X-Client-ID`` when available, otherwise from request IP and
user-agent.

Failure modes
-------------

Common status codes:

* ``400`` for invalid request payloads
* ``401`` for invalid, expired, or revoked bearer credentials
* ``413`` for prompts that exceed configured size limits
* ``429`` for plan rate-limit exhaustion
* ``500`` for upstream provider or server configuration failures

Implementation notes
--------------------

Relevant files:

* ``lightning-api/app.py``
* ``lightning-api/gen.py``
* ``lightning-api/helper/ratelimit.py``
* ``lightning-api/helper/subscriptions.py``
* ``MISC/api.sql``
