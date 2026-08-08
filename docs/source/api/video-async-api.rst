Async Video Generation API (OpenAI-Compatible)
===============================================

The Async Video Generation API follows the official OpenAI Videos API
specification. Because video diffusion rendering takes a significant amount of
time (up to several minutes), this API uses an **asynchronous state machine**
with three key routes:

1. ``POST /v1/videos`` — Create a generation job
2. ``GET  /v1/videos/{video_id}`` — Poll job status
3. ``GET  /v1/videos/{video_id}/content`` — Retrieve the finished video

These endpoints are available on both the **Generation API** (``/gen/videos``)
and the **P2G API** (``/v1/videos``). The P2G variant charges credits from your
wallet; the Generation variant consumes from your plan's daily quotas.

Available on both tiers
-----------------------

.. list-table::
   :widths: 25 35 35
   :header-rows: 1

   * - Endpoint
     - Generation API (subscription)
     - P2G API (credit-metered)
   * - Create job
     - ``POST /gen/videos``
     - ``POST /v1/videos``
   * - Poll status
     - ``GET /gen/videos/{video_id}``
     - ``GET /v1/videos/{video_id}``
   * - Get content
     - ``GET /gen/videos/{video_id}/content``
     - ``GET /v1/videos/{video_id}/content``

Video models
------------

* You can view video models in the "Video" tab of the `Models Catalog <https://inferenceport.ai/marketplace.html>`__

Job lifecycle
-------------

.. code-block:: text

   ┌─────────┐      ┌─────────────┐      ┌───────────┐
   │ pending │ ───► │ processing  │ ───► │ completed │
   └─────────┘      └─────────────┘      └───────────┘
                          │
                          ▼
                    ┌──────────┐
                    │  failed  │
                    └──────────┘

When you create a video job, the server returns immediately with
``"status": "pending"``. A background worker picks up the job and sets the
status to ``"processing"``. When the upstream provider finishes rendering, the
status becomes ``"completed"`` and the ``completed_at`` timestamp is set. If the
upstream fails, the status becomes ``"failed"`` and the ``error`` field contains
details.

Completed videos expire after **24 hours**. The ``expires_at`` field in the
response indicates when the download URL will stop working.

Endpoint: Create video job
--------------------------

``POST /gen/videos`` (subscription) / ``POST /v1/videos`` (credit-metered)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Initiates an asynchronous video generation job.

Request body (``application/json``):

.. code-block:: json

   {
     "model": "wan-fast",
     "prompt": "Cinematic wide panning shot of an abandoned space cruiser on a red sand planet.",
     "size": "1280x720",
     "seconds": 8,
     "input_reference": {
       "image_url": "https://example.com/frame.jpg"
     }
   }

Request parameters:

* ``prompt`` — **required**, string. Natural language description of the scene,
  camera actions, lighting, and composition. Maximum 32,000 characters.

* ``model`` — optional string. The video model to use. Defaults to ``wan-fast``.
  See the `Video models`_ table for available options.

* ``size`` — optional string. Output dimensions. Defaults to ``1280x720``.
  Allowed values:

  - ``"720x1280"`` — Vertical / Portrait
  - ``"1280x720"`` — Widescreen Landscape (default)
  - ``"1024x1792"`` — High-Res Vertical
  - ``"1792x1024"`` — High-Res Landscape

* ``seconds`` — optional integer. Video duration. Defaults to ``8``. Allowed
  values: ``4``, ``8``, ``12``, ``20``, ``30``. Note: some models cap at 10s or
  12s; the server clamps to the model's maximum.

* ``input_reference`` — optional object. Image-to-video conditioning. Provide
  exactly one of:

  - ``image_url`` — A URL or base64 data URI of a JPG/PNG anchor image (max
    20 MB).

  Example:

  .. code-block:: json

     "input_reference": {
       "image_url": "https://example.com/reference.png"
     }

* ``image_urls`` — optional array of strings (legacy). Up to 2 image URLs for
  conditioning. Prefer ``input_reference`` for OpenAI compatibility.

Response: HTTP ``201 Created``

.. code-block:: json

   {
     "id": "vid_a1b2c3d4e5f6",
     "object": "video",
     "model": "wan-fast",
     "prompt": "Cinematic wide panning shot of an abandoned space cruiser on a red sand planet.",
     "status": "pending",
     "progress": 0.0,
     "created_at": 1786193000,
     "completed_at": null,
     "expires_at": null,
     "seconds": "8",
     "error": null
   }

P2G API (``/v1/videos``) — credit metering
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

When using the P2G API, credits are charged **upfront** at job creation time.
The cost is calculated as ``seconds × price_per_second`` for the selected model.
If the generation fails, credits are automatically refunded.

The response includes the same ``VideoObject`` schema. You can check the
``usage`` field on the poll endpoint to see how many credits were charged.

cURL example:

.. code-block:: bash

   curl -X POST https://api.inferenceport.ai/v1/videos \
     -H "Authorization: Bearer ipa_live_YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "wan-fast",
       "prompt": "Ocean waves crashing on a rocky shore at sunset, golden hour lighting",
       "size": "1280x720",
       "seconds": 8
     }'

Python example:

.. code-block:: python

   import httpx

   resp = httpx.post(
       "https://api.inferenceport.ai/v1/videos",
       headers={"Authorization": "Bearer ipa_live_YOUR_API_KEY"},
       json={
           "model": "wan-fast",
           "prompt": "Ocean waves crashing on a rocky shore at sunset",
           "size": "1280x720",
           "seconds": 8,
       },
   )
   job = resp.json()
   video_id = job["id"]
   print(f"Job created: {video_id}")

Endpoint: Poll video status
---------------------------

``GET /gen/videos/{video_id}`` / ``GET /v1/videos/{video_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Retrieves the current status of a video generation job.

Path parameters:

* ``video_id`` — required string. The video ID returned by the create endpoint
  (e.g. ``vid_a1b2c3d4e5f6``).

Response: The same ``VideoObject`` schema as the create endpoint.

HTTP status codes:

* ``200`` — Job is completed or failed. The ``status`` field indicates which.
* ``202`` — Job is still processing (``pending`` or ``processing``). Keep
  polling.
* ``404`` — Video not found.

.. code-block:: json

   {
     "id": "vid_a1b2c3d4e5f6",
     "object": "video",
     "model": "wan-fast",
     "prompt": "Cinematic wide panning shot...",
     "status": "completed",
     "progress": 1.0,
     "created_at": 1786193000,
     "completed_at": 1786193120,
     "expires_at": 1786279400,
     "seconds": "8",
     "error": null
   }

If the job failed:

.. code-block:: json

   {
     "id": "vid_a1b2c3d4e5f6",
     "object": "video",
     "model": "wan-fast",
     "prompt": "...",
     "status": "failed",
     "progress": 0.0,
     "created_at": 1786193000,
     "completed_at": 1786193050,
     "expires_at": null,
     "seconds": "8",
     "error": {
       "code": "video_generation_failed",
       "message": "Upstream video generation failed (status 502): ..."
     }
   }

cURL example:

.. code-block:: bash

   curl https://api.inferenceport.ai/v1/videos/vid_a1b2c3d4e5f6 \
     -H "Authorization: Bearer ipa_live_YOUR_API_KEY"

Python example:

.. code-block:: python

   import time

   while True:
       resp = httpx.get(
           f"https://api.inferenceport.ai/v1/videos/{video_id}",
           headers={"Authorization": "Bearer ipa_live_YOUR_API_KEY"},
       )
       if resp.status_code == 200:
           job = resp.json()
           print(f"Status: {job['status']}")
           break
       elif resp.status_code == 202:
           print("Still processing...")
           time.sleep(5)
       else:
           print(f"Error: {resp.status_code} {resp.text}")
           break

Endpoint: Get video content
---------------------------

``GET /gen/videos/{video_id}/content`` / ``GET /v1/videos/{video_id}/content``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Retrieves the generated video file. Instead of returning the video inline, this
endpoint returns an **HTTP 303 See Other** redirect to the signed storage URL
containing the MP4 file.

Path parameters:

* ``video_id`` — required string. The video ID.

Response:

* ``303 See Other`` — The ``Location`` header contains the URL to download the
  MP4 video file.
* ``202 Accepted`` — Video is still being generated. Poll the status endpoint.
* ``409 Conflict`` — Generation failed. The response body contains the error.
* ``404 Not Found`` — Video not found.

cURL example (follows redirects automatically):

.. code-block:: bash

   curl -L -o video.mp4 \
     https://api.inferenceport.ai/v1/videos/vid_a1b2c3d4e5f6/content \
     -H "Authorization: Bearer ipa_live_YOUR_API_KEY"

Python example:

.. code-block:: python

   # The content endpoint returns a 303 redirect
   resp = httpx.get(
       f"https://api.inferenceport.ai/v1/videos/{video_id}/content",
       headers={"Authorization": "Bearer ipa_live_YOUR_API_KEY"},
       follow_redirects=False,
   )

   if resp.status_code == 303:
       video_url = resp.headers["location"]
       # Download the actual video
       video_resp = httpx.get(video_url)
       with open("output.mp4", "wb") as f:
           f.write(video_resp.content)

Complete polling workflow
-------------------------

Here is a complete end-to-end example:

.. code-block:: python

   import httpx
   import time

   API_BASE = "https://api.inferenceport.ai"
   API_KEY = "ipa_live_YOUR_API_KEY"
   HEADERS = {"Authorization": f"Bearer {API_KEY}"}

   # 1. Create the video job
   resp = httpx.post(
       f"{API_BASE}/v1/videos",
       headers=HEADERS,
       json={
           "model": "wan-fast",
           "prompt": "Timelapse of clouds moving over a mountain range",
           "size": "1280x720",
           "seconds": 8,
       },
   )
   resp.raise_for_status()
   job = resp.json()
   video_id = job["id"]
   print(f"Created job: {video_id}")

   # 2. Poll until completed
   while True:
       resp = httpx.get(
           f"{API_BASE}/v1/videos/{video_id}",
           headers=HEADERS,
       )
       if resp.status_code == 200:
           break
       if resp.status_code != 202:
           print(f"Error: {resp.status_code} {resp.text}")
           exit(1)
       print(f"Status: {resp.json()['status']} — waiting...")
       time.sleep(5)

   status_job = resp.json()
   print(f"Completed at: {status_job['completed_at']}")
   print(f"Expires at: {status_job['expires_at']}")

   # 3. Download the video via the content endpoint
   resp = httpx.get(
       f"{API_BASE}/v1/videos/{video_id}/content",
       headers=HEADERS,
       follow_redirects=False,
   )
   if resp.status_code == 303:
       video_url = resp.headers["location"]
       video_resp = httpx.get(video_url)
       with open("output.mp4", "wb") as f:
           f.write(video_resp.content)
       print(f"Saved video to output.mp4 ({len(video_resp.content)} bytes)")

VideoObject schema
------------------

Every response from the create and status endpoints returns a ``VideoObject``:

.. list-table::
   :widths: 20 15 65
   :header-rows: 1

   * - Field
     - Type
     - Description
   * - ``id``
     - string
     - Unique identifier (e.g. ``vid_abc123``).
   * - ``object``
     - string
     - Always ``"video"``.
   * - ``model``
     - string
     - The model that processed this video.
   * - ``prompt``
     - string | null
     - The prompt used for generation.
   * - ``status``
     - string
     - ``"pending"``, ``"processing"``, ``"completed"``, or ``"failed"``.
   * - ``progress``
     - number
     - Float from ``0.0`` to ``1.0``.
   * - ``created_at``
     - integer
     - Unix timestamp when the job was created.
   * - ``completed_at``
     - integer | null
     - Unix timestamp when rendering finished.
   * - ``expires_at``
     - integer | null
     - Unix timestamp when the download URL expires (24h after completion).
   * - ``seconds``
     - string
     - The requested video duration.
   * - ``error``
     - object | null
     - Error details if the job failed. Contains ``code`` and ``message``.

Error object:

.. code-block:: json

   {
     "code": "video_generation_failed",
     "message": "Upstream video generation failed (status 502): ..."
   }

Advanced endpoints (not yet implemented)
-----------------------------------------

The following endpoints are defined in the OpenAI Videos API specification but
are **not yet implemented**. They return HTTP ``501 Not Implemented``.

``POST /v1/videos/extensions``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Extend an already completed video track seamlessly forwards or backwards. Useful
for continuing a scene beyond its original duration.

``POST /v1/videos/edits``
~~~~~~~~~~~~~~~~~~~~~~~~~

Inpaint or edit a specific region of an existing video. Regenerate frames
within a masked area while preserving the rest.

``POST /v1/videos/characters``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Extract and register a character identity from an uploaded image or video clip.
Returns a ``character_id`` that can be attached to subsequent generation calls
to preserve visual continuity across multiple videos.

Rate limits
-----------

**Generation API** (``/gen/videos``): Subject to your plan's ``videosDaily``
quota. See ``GET /usage`` for current limits.

**P2G API** (``/v1/videos``): Subject to per-identity requests-per-minute
limits (default 120 RPM). Credits are charged per-second based on the model's
configured price.

Troubleshooting
---------------

**Job stays in ``pending`` or ``processing`` forever**

Video generation can take 30 seconds to 3 minutes depending on the model and
duration. If a job exceeds 10 minutes, it times out and the status becomes
``"failed"`` with a ``timeout`` error code.

**``404 Video not found``**

Videos expire 24 hours after completion. The ``expires_at`` field in the
``VideoObject`` indicates when the video will no longer be available.

**``409 Conflict`` on content endpoint**

The video generation failed. Check the ``error`` field in the status response
for details. Credits are automatically refunded for failed jobs on the P2G API.

**Model not found**

Ensure the model ID is listed in the `Video models`_ table and that you are
calling the correct tier (``/gen`` for subscription, ``/v1`` for credits).
