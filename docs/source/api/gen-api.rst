Generation API
==============

The Generation API is the subscription-backed API for cloud chat, image,
video, and audio generation. It resolves your plan's daily usage quotas and
routes requests through an intelligent model router.

Base URL
--------

.. code-block:: text

   https://sharktide-lightning.hf.space

Plan and usage endpoints
------------------------

``GET /subscription``
~~~~~~~~~~~~~~~~~~~~~

Returns the authenticated user's resolved plan and subscription view.

.. code-block:: text

   {
     "email": "user@example.com",
     "signed_up": "2025-01-15T00:00:00Z",
     "plan_key": "light",
     "plan_name": "Light Plan",
     "subscription": [ { ... } ],
     "auth_type": "jwt"
   }

``GET /usage``
~~~~~~~~~~~~~~

Returns the current usage snapshot for the resolved identity.

.. code-block:: json

   {
     "plan_key": "light",
     "plan_name": "Light Plan",
     "usage": {
       "cloudChatDaily": { "limit": 500, "used": 42, "remaining": 458, "window": "daily", "period": "day" },
       "imagesDaily": { "limit": 50, "used": 3, "remaining": 47, "window": "daily", "period": "day" },
       "videosDaily": { "limit": 10, "used": 1, "remaining": 9, "window": "daily", "period": "day" },
       "audioWeekly": { "limit": 100, "used": 5, "remaining": 95, "window": "weekly", "period": "week" }
     },
     "generated_at": "2026-06-13T12:00:00Z"
   }

``GET /tier-config``
~~~~~~~~~~~~~~~~~~~~

Returns the normalized plan catalog used by the UI.

.. code-block:: text

   {
     "defaultPlanKey": "free",
     "plans": [
       { "key": "free", "name": "Free Tier", "url": "", "price": 0, "limits": { ... }, "order": 0 },
       { "key": "light", "name": "Light Plan", "url": "https://...", "price": 5, "limits": { ... }, "order": 1 }
     ]
   }

``GET /tiers``
~~~~~~~~~~~~~~

Returns the paid plans only, for upgrade UI.

Status and discovery endpoints
------------------------------

``GET /``
~~~~~~~~~

Permanent redirect to ``https://inference.js.org``.

``GET /models``
~~~~~~~~~~~~~~~

Returns public Ollama library model metadata scraped from the catalog. Used by
the marketplace UI.

.. code-block:: json

   [
     {
       "name": "llama3.2",
       "description": "Meta Llama 3.2...",
       "sizes": ["1B", "3B"],
       "pulls": "10M+",
       "tags": ["vision", "multilingual"],
       "updated": "2025-02-15",
       "link": "/library/llama3.2"
     }
   ]

``GET /status``
~~~~~~~~~~~~~~~

Returns overall Lightning service health.

.. code-block:: text

   {
     "state": "operational",
     "services": { ... },
     "notifications": [],
     "latest": { ... }
   }

``HEAD /status/image``, ``/status/video``, ``/status/sfx``, ``/status/text``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Lightweight capability checks that return content-type headers only. No body.

Model listing
-------------

``GET /gen/models``
~~~~~~~~~~~~~~~~~~~

Returns the available models in OpenAI-compatible format. This includes the
default ``lightning`` router model and any override models configured in
``models_override.json``.

.. code-block:: json

   {
     "object": "list",
     "data": [
       {
         "id": "lightning",
         "name": "Lightning",
         "created": 1767225600,
         "context_length": 128000,
         "max_output_length": 32000,
         "input_modalities": ["text", "image", "file"],
         "output_modalities": ["text"],
         "pricing": {
           "prompt": "0.000000750000",
           "completion": "0.000000750000",
           "image": "0.1125",
           "request": "0",
           "input_cache_read": "0"
         },
         "supported_features": ["tools", "json_mode", "streaming", "structured_outputs"]
       },
       {
         "id": "my-custom-model",
         "upstream_id": "gpt-4o",
         "name": "My Custom Model",
         "created": 1767225600,
         "context_length": 128000,
         "hugging_face_id": "org/model",
         "quantization": "none",
         "input_modalities": ["text"],
         "output_modalities": ["text"],
         "supported_sampling_parameters": ["temperature", "stop", "max_tokens"],
         "supported_features": ["streaming"],
         "is_ready": true,
         "is_free": false,
         "openrouter": { "slug": null }
       }
     ]
   }

When you pass the ``model`` field in a chat completion request, the server
checks whether the model ID matches an override entry in
``models_override.json``. If it does, the request is routed to that model's
configured provider instead of the default router.

Chat completions
----------------

``POST /gen/chat/completions``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

OpenAI-compatible chat completions endpoint with intelligent model routing.

Request body:

.. code-block:: json

   {
     "messages": [
       { "role": "user", "content": "Write a haiku about shipping software." }
     ],
     "stream": false,
     "model": "lightning",
     "tools": [],
     "tool_choice": null
   }

* ``messages`` — required array of message objects (``role``, ``content``).
* ``stream`` — optional boolean (default ``false``). When ``true``, responses
  are streamed as ``text/event-stream``.
* ``model`` — optional string. Defaults to ``lightning`` (the auto-router).
  Specify an override model ID from ``/gen/models`` to route directly.
* ``tools`` — optional tool definitions array.
* ``tool_choice`` — optional tool selection control.

The router selects an upstream model automatically based on prompt complexity,
code signals, tools, and image presence. The first streaming metadata chunk
includes ``router_metadata.model_name`` indicating which model was selected.

Streaming response includes an initial metadata event:

.. code-block:: text

   data: {"router_metadata": {"model_name": "Meta Llama 3.3 70B Versatile"}}

Image generation
----------------

``POST /gen/images/generations``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

OpenAI-compatible image generation. Returns a ``created`` timestamp and
``data`` array with base64 or URL payloads.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/gen/images/generations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "A serene mountain lake at sunrise",
       "n": 1,
       "mode": "realistic",
       "response_format": "b64_json"
     }'

Request fields:

* ``prompt`` — required string. The image description.
* ``n`` — optional integer (default 1). Number of images to generate.
* ``mode`` — optional string. Either ``fantasy`` (artistic, stylized) or
  ``realistic`` (photorealistic). The server also auto-detects cinematic
  prompts and selects the appropriate model.
* ``image_urls`` — optional array of up to 2 URLs or base64 data URIs for
  image-to-image conditioning. When provided, the server uses a different
  underlying model (``klein``).
* ``response_format`` — optional string. ``b64_json`` (default) returns
  base64-encoded JPEG data. ``url`` re-serves the image through the
  ``/asset-cdn/assets/{image_id}`` endpoint.

Response:

.. code-block:: json

   {
     "created": 1718300000,
     "data": [
       { "b64_json": "/9j/4AAQ..." }
     ]
   }

``POST /gen/image`` and ``GET /gen/image/{prompt}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Legacy image generation endpoints. Returns raw ``image/jpeg`` bytes.

* ``POST /gen/image`` — accepts ``prompt``, ``mode``, and ``image_urls`` as
  JSON body.
* ``GET /gen/image/{prompt}`` — accepts query params ``mode`` and
  ``image_urls``.

Video generation
----------------

``POST /gen/videos/generations``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

OpenAI-style video generation. Returns a ``created`` timestamp and ``data``
array with base64 or URL payloads.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/gen/videos/generations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "A drone flying over a canyon",
       "ratio": "3:2",
       "mode": "normal",
       "duration": 5,
       "response_format": "b64_json"
     }'

Request fields:

* ``prompt`` — required string. The video description.
* ``ratio`` — optional string. Aspect ratio: ``3:2`` (default), ``2:3``, or
  ``1:1``.
* ``mode`` — optional string. ``normal`` (default) or ``fun`` (enhanced).
* ``duration`` — optional integer. Duration in seconds, clamped to 1–10.
  Default ``5``.
* ``image_urls`` — optional array of up to 2 URLs or base64 data URIs for
  video conditioning.
* ``response_format`` — optional string. ``b64_json`` (default) or ``url``.

Response:

.. code-block:: json

   {
     "created": 1718300000,
     "data": [
       { "b64_json": "AAAAIGZ0e..." }
     ]
   }

``POST /gen/video`` and ``GET /gen/video/{prompt}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Legacy video generation endpoints. Returns raw ``video/mp4`` bytes. Accepts
the same ``prompt``, ``ratio``, ``mode``, ``duration``, and ``image_urls``
parameters.

A ``HEAD /gen/video`` request returns parameter documentation in response
headers (``Y-prompt``, ``Y-ratio``, ``Y-mode``, ``Y-duration``,
``Y-image_urls``, ``Y-response_format``, ``Y-model``).

Airforce video
~~~~~~~~~~~~~~

``POST /gen/video/airforce`` and ``GET /gen/video/airforce/{prompt}``

Alternate Airforce-backed video endpoint using the ``grok-imagine-video``
model. Same prompt, ratio, mode, and image_urls parameters. Returns raw
``video/mp4`` bytes.

Audio generation
----------------

``POST /gen/audio/speech`` and ``POST /gen/audio/generations``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

OpenAI-compatible text-to-speech and audio generation. Returns raw
``audio/mpeg`` bytes.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/gen/audio/speech \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "input": "Hello, welcome to InferencePort AI."
     }'

Request fields:

* ``input`` — required string (OpenAI-compatible). Falls back to ``prompt``
  for legacy callers.
* ``prompt`` — optional alternative for ``input``.

``POST /gen/sfx`` and ``GET /gen/sfx/{prompt}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Sound-effect and music generation. Returns raw ``audio/mpeg`` bytes. Accepts
``prompt`` as JSON body (POST) or URL path param (GET).

``POST /gen/tts`` and ``GET /gen/tts/{prompt}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Text-to-speech generation. Returns raw ``audio/mpeg`` bytes. Accepts
``prompt`` as JSON body (POST) or URL path param (GET).

Prompt analysis
---------------

``POST /gen/prompt_analyze``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns the router's chosen display model for a given prompt payload. Does not
generate any content — only returns the model that *would* be selected.

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/gen/prompt_analyze \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": [
         { "role": "user", "content": "Solve this differential equation" }
       ]
     }'

Response returns the selected model display name as a JSON array.

Asset CDN
---------

``GET /asset-cdn/assets/{image_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns temporary asset files (PNG images, MP4 videos) created when generation
endpoints receive base64 image inputs. Assets are cleaned up automatically.

Rate limits and identity
------------------------

The Generation API tracks these metrics per resolved identity:

* ``cloudChatDaily`` — daily chat message limit.
* ``imagesDaily`` — daily image generation limit.
* ``videosDaily`` — daily video generation limit.
* ``audioWeekly`` — weekly audio generation limit.

If no bearer token is present, the server falls back to a free-tier identity
derived from the ``X-Client-ID`` header when available, otherwise from the
request IP and user-agent.

Usage notes
-----------

* All generation endpoints consume from the resolved plan's daily quotas.
* Streaming responses use server-sent events (``text/event-stream``).
* Prompt size is limited: chat prompts to 32,768 characters / 65,536 bytes,
  media prompts to 2,048 characters / 4,096 bytes.
* Base64 image inputs are temporarily stored and cleaned up after generation
  completes.
