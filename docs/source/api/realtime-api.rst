Realtime API
============

The Realtime API gives you low-latency, two-way sessions over a WebSocket: live voice conversations with a speech model, or
streaming transcription of microphone audio. It speaks the **OpenAI Realtime protocol**, so existing Realtime clients work
by changing the URL and key. Sessions are billed while they run from your Pay-2-Go wallet (:doc:`p2g-api`).

.. note::

   Realtime is part of the **Pay-2-Go API only**. It is not available on the subscription Generation API (``/gen``).

Connect
-------

.. code-block:: text

   wss://api.inferenceport.ai/v1/realtime?model=gpt-realtime-2.1

.. list-table::
   :widths: 28 72
   :header-rows: 1

   * - Parameter
     - Description
   * - ``model``
     - Realtime model id or alias (see `Models`_). Defaults to ``gpt-realtime-2.1``.
   * - ``org``
     - Optional organization slug to bill, for clients that cannot set headers. The ``X-InferencePort-Org`` header works too.

Authenticate with an ``Authorization: Bearer`` header (an API key such as ``ipa_live_...`` or a Supabase access token). Browsers
cannot set headers on a WebSocket, so they pass the key in a **subprotocol** instead, exactly like the OpenAI API:

.. code-block:: javascript

   const ws = new WebSocket(
     "wss://api.inferenceport.ai/v1/realtime?model=gpt-realtime-2.1",
     ["realtime", "openai-insecure-api-key." + token],
   );

.. warning::

   A key placed in a browser WebSocket is visible to the page. Use a short-lived session token for the signed-in user, never
   a long-lived key you do not want exposed. For server-side use, send the header.

Once connected, use the protocol of the model you picked. Frames are relayed unchanged in both directions; InferencePort only
reads three things in order to bill the session: the audio format you declare in ``session.update``, the audio you send with
``input_audio_buffer.append``, and the usage reported in ``response.done``.

.. code-block:: python

   import asyncio, base64, json
   import websockets

   async def main():
       url = "wss://api.inferenceport.ai/v1/realtime?model=gpt-realtime-2.1-mini"
       async with websockets.connect(url, additional_headers={"Authorization": "Bearer ipa_live_..."},
                                     subprotocols=["realtime"]) as ws:
           await ws.send(json.dumps({"type": "session.update",
                                     "session": {"modalities": ["text", "audio"], "voice": "marin"}}))
           await ws.send(json.dumps({"type": "conversation.item.create", "item": {
               "type": "message", "role": "user",
               "content": [{"type": "input_text", "text": "Say hello in one sentence."}]}}))
           await ws.send(json.dumps({"type": "response.create"}))
           async for raw in ws:
               event = json.loads(raw)
               if event["type"].endswith("text.delta") or event["type"].endswith("transcript.delta"):
                   print(event["delta"], end="", flush=True)
               if event["type"] == "response.done":
                   break

   asyncio.run(main())

.. note::

   The exact ``session.update`` schema (and the names of some events) follow the underlying provider and can differ between
   models. The console's Realtime studio lets you edit the ``session.update`` JSON, and ``ipx p2g realtime ... --events``
   prints every raw event, which is the quickest way to see what a model expects.

Models
------

``GET /v1/realtime/models`` lists the realtime models with their pricing (they are also part of ``GET /v1/models`` with
``type: "realtime"``; from the CLI use ``ipx p2g models --type realtime``). Prices are credits (1 credit = 1 USD).

.. list-table::
   :widths: 27 33 40
   :header-rows: 1

   * - Model id
     - Does
     - Billed
   * - ``gpt-realtime-2.1``
     - Voice conversations (text, audio and image in; text and audio out), tools and reasoning.
     - Per million tokens: audio in 32 (cached 0.40) / audio out 64; text in 4 (cached 0.40) / text out 24; image in 5 (cached 0.50).
   * - ``gpt-realtime-2.1-mini``
     - Lower-cost voice conversations with the same inputs and outputs.
     - Per million tokens: audio in 10 (cached 0.30) / audio out 20; text in 0.60 (cached 0.06) / text out 2.40; image in 0.80 (cached 0.08).
   * - ``gpt-live-transcribe``
     - Low-latency streaming speech recognition over the OpenAI Realtime protocol.
     - 1.02 credits per hour of streamed audio.
   * - ``scribe-v2-realtime``
     - Live transcription in 90+ languages with incremental and final results.
     - 0.39 credits per hour of streamed audio.
   * - ``mai-transcribe-2-streaming``
     - Live multilingual transcription with incremental finalized text and manual commits; 16 or 24 kHz PCM.
     - 0.54 credits per hour of streamed audio.

Each model also answers to its provider id (for example ``openai/gpt-realtime-2.1``) and the aliases shown by the list endpoint.

Billing
-------

**Token-billed models** (``gpt-realtime-*``) are charged after **every** ``response.done`` event, from the usage it reports:
text, audio and image input tokens, cached input tokens (at the cheaper cached rate for their own modality) and text and audio
output tokens. A conversation therefore shows up as several small charges in your ledger.

**Transcription models** are charged for the **audio you stream**, measured from ``input_audio_buffer.append`` events and
settled about every 10 seconds of audio and when the session ends. The duration is computed from the bytes sent and the format
you declare in ``session.update`` (``pcm16`` is 24 kHz; ``{"type": "audio/pcm", "rate": 16000}``, ``pcm_16000`` and
``g711_ulaw`` / ``g711_alaw`` are understood). **If you declare nothing, 24 kHz PCM16 is assumed**, so declare your real sample
rate when you stream something else. Amounts below 0.0001 credits accumulate until they round to a charge.

For both kinds:

* A session needs at least **0.25 credits** to start, and ends with close code ``4402`` when the balance reaches zero.
* Reward discounts and per-user markups apply, and charges appear in the ledger as ``usage_kind: "realtime"``
  (``ipx p2g ledger``, console Activity).
* Nothing is charged for a session that never produced usage.
* With an organization context the organization's wallet is billed and its model and ``realtime`` modality policy applies.

The Realtime studio in the console shows a running **estimate** from the usage it sees; the ledger has the exact amounts.

Limits
------

.. list-table::
   :widths: 40 20 40
   :header-rows: 1

   * - Limit
     - Default
     - Notes
   * - Concurrent sessions per account
     - 3
     - Closed with ``4429`` when exceeded.
   * - Maximum session length
     - 3,600 s
     - Closed with ``4408``.
   * - New connections
     - 120 / minute
     - Same per-identity limit as the other P2G endpoints.

Errors
------

When a session cannot start or has to end, you receive a Realtime ``error`` event (``error.code`` and ``error.message``)
followed by a WebSocket close with one of these codes:

.. list-table::
   :widths: 14 22 64
   :header-rows: 1

   * - Close code
     - ``error.code``
     - Meaning
   * - ``4400``
     - ``invalid_request``
     - The request was invalid.
   * - ``4401``
     - ``unauthorized``
     - Missing, invalid or revoked credential.
   * - ``4402``
     - ``insufficient_credits``
     - Not enough credits to start, or the balance ran out during the session.
   * - ``4403``
     - ``forbidden``
     - The organization's policy blocks this model or the ``realtime`` modality.
   * - ``4404``
     - ``model_not_found``
     - Unknown realtime model.
   * - ``4408``
     - ``session_time_limit``
     - The maximum session length was reached.
   * - ``4429``
     - ``rate_limited``
     - Too many concurrent sessions, or the connection rate limit was reached.
   * - ``1011``
     - -
     - The realtime provider is unavailable. Try again shortly.

Realtime models are not chat models: sending one to ``/v1/chat/completions`` returns ``400`` with a pointer to this endpoint.

Try it
------

* **Console**: Playground, Realtime. Speak or type, see live transcripts and an estimated cost, and edit the
  ``session.update`` payload.
* **CLI**: ``ipx p2g realtime chat "Say hello" --audio-out hello.wav`` and ``ipx p2g realtime transcribe meeting.wav``
  (:doc:`/cli/p2g`).
