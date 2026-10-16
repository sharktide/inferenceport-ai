Pay-2-Go: ``ipx p2g``
=====================

``ipx p2g`` uses the **Pay-2-Go API** (``/v1``): each request is metered against your credit wallet. It is the
production-oriented API and the one that lets an organization pay (set a context with ``ipx auth context``, see
:doc:`authentication`).

``chat``, ``text``, ``image``, ``video``, ``audio`` and ``models`` work exactly as described in :doc:`lightning`
(replace ``gen`` with ``p2g``); after each generation the credits charged are shown. This page covers what is specific
to Pay-2-Go: 3D, embeddings, realtime voice, wallet, keys and deployments.

.. code-block:: console

   $ ipx p2g chat                    # per-token billing, footer shows credits per answer
   $ ipx p2g image "a red fox" -o fox.jpg
   $ ipx --json p2g text "hi" | jq .usage.credits

Wallet and pricing
------------------

.. code-block:: console

   $ ipx p2g balance          # balance, purchased/spent and usage by modality
   $ ipx p2g ledger --limit 50
   $ ipx p2g pricing          # live credit prices and top-up packs (no sign-in needed)

When an organization context is set, requests are billed to the organization's wallet. Use ``--personal`` to bill your
own wallet for one command. Top up credits in the console at https://console.inferenceport.ai.

3D generation
-------------

.. code-block:: console

   $ ipx p2g 3d --image chair.jpg -m tripoSR -o chair.glb
   $ ipx p2g 3d --image logo.png -m trellis2 --resolution high
   $ ipx p2g 3d --image obj.png -m asset-harvester --prompt "a wooden chair"
   $ ipx p2g 3d --image chair.jpg --no-wait          # print the job id
   $ ipx p2g 3d --image chair.jpg --job a3f1c2e4b5   # fetch the result of an earlier job

Models: ``tripoSR`` (default), ``sf3d``, ``trellis2`` (with ``--resolution low|medium|high``) and
``asset-harvester`` (needs ``--prompt``; produces a Gaussian-splat ``.ply`` and an orbit ``.mp4``). The job runs
asynchronously and credits are refunded automatically if it fails. This feature is in early access; see
:doc:`/api/p2g-api`.

Embeddings
----------

.. code-block:: console

   $ ipx p2g embed "The quick brown fox"                           # one input, shows the vector summary
   $ ipx p2g embed "first" "second" -m text-embedding-3-large --dimensions 256
   $ ipx p2g embed -f notes.txt --lines -o vectors.json            # one input per non-empty line; full response saved
   $ cat docs.txt | ipx p2g embed --lines --json | jq '.data[0].embedding | length'
   $ ipx p2g models --type embedding                               # models and prices

Inputs can be arguments, files (``-f``, repeatable; a whole file is one input unless ``--lines``), or standard input. The
default model is ``text-embedding-3-small``. The API takes at most 32 inputs per request, so larger sets (up to 1,024) are sent
in batches of 32 and merged; the token and credit totals are summed. ``--dimensions`` accepts 128-4096 (model limits apply),
``--input-type query|document`` is for Cohere and ``--task-type`` for Gemini. You are billed per input token and the credits
charged are printed after the result; ``--json`` prints one JSON document (the merged response, including
``usage.payg_credits_charged``). See :doc:`/api/embeddings-api`.

Realtime
--------

.. code-block:: console

   $ ipx p2g realtime chat "Tell me a one-line joke"                   # streams the reply as text
   $ ipx p2g realtime chat "Say hello" --voice marin --audio-out hello.wav
   $ ipx p2g realtime chat --audio-in question.wav                     # ask by speaking a WAV file
   $ ipx p2g realtime chat                                             # interactive: one message per line, Ctrl+D to end
   $ ipx p2g realtime transcribe meeting.wav
   $ ipx p2g realtime transcribe talk.wav -m scribe-v2-realtime -o talk.txt
   $ arecord -f S16_LE -r 24000 -c 1 -t raw | ipx p2g realtime transcribe - --rate 24000
   $ ipx p2g models --type realtime

``realtime chat`` talks to a conversational model (default ``gpt-realtime-2.1``). Replies are **text only** unless you pass
``--audio-out FILE`` (then the model speaks, the transcript is still printed, and the audio is saved as a WAV, even if the session
fails part-way), so a plain text chat is never billed for audio. ``realtime transcribe`` streams a recording (a WAV file, or raw
PCM16 on standard input with ``-`` and ``--rate``) to a transcription model (default ``gpt-live-transcribe``) and prints the
transcript; a conversational model is refused with a pointer to ``chat``, and the other way round. Audio is converted to 24 kHz
mono PCM16 while it streams (nothing is held in memory, and a live ``arecord`` pipe is sent as it is recorded). ``ipx`` has no
microphone capture of its own; pipe from ``arecord``, ``sox`` or ``ffmpeg``.

Sessions use the model's default from ``GET /v1/realtime/models`` (the GA Realtime shape). Models with manual commits
(``mai-transcribe-2-streaming``, ``scribe-v2-realtime``) are committed when the audio ends; models with server-side turn
detection (``gpt-live-transcribe``) get 1.5 seconds of silence at the end so the last sentence is closed. The command then waits
for the transcript itself (``--wait``, default 60 s) and until the server has been quiet for ``--idle`` seconds. An error event
from the server, or a connection that drops before the end, fails the command with a clear message and a non-zero exit status.

Useful options: ``--pace`` sends audio at real-time speed, ``--session '{...}'`` replaces the default ``session.update``
payload, and ``--events`` prints every raw event to standard error. With ``--json``, standard output is exactly one JSON
document (``text``, ``usage`` and ``audio_file`` for ``chat``; ``text``, ``segments`` and ``audio_seconds`` for ``transcribe``).
The WebSocket uses the same base URL as every other command (path prefixes are kept) and is always encrypted except for
``localhost``. Sessions are billed while they run (per token for ``gpt-realtime-*``,
per streamed second for the transcription models); ``ipx p2g ledger`` shows the exact charges, and a session ends with a clear
message and hint when credits run out or an organization policy blocks the model. See :doc:`/api/realtime-api`.

API keys
--------

.. code-block:: console

   $ ipx p2g keys list
   $ ipx p2g keys create ci-bot --expires 2027-01-01      # the secret is shown once
   $ ipx p2g keys revoke <key-id>

Personal keys (``ipa_live_...``) are used with ``Authorization: Bearer`` or ``ipx auth login --api-key``. Organization
keys, with spend caps and restrictions, are managed with ``ipx org keys`` (:doc:`organizations`).

Deployments
-----------

Personal Featherless deployments billed through your wallet. For organization deployments and the full command set
(``list``, ``restore``, ``terminate``, cost and state checks) use :doc:`featherless`:

.. code-block:: console

   $ ipx p2g deploy models                 # what can be deployed
   $ ipx p2g deploy status <model-id>      # availability
   $ ipx p2g deploy create <model-id>
   $ ipx p2g deploy list
   $ ipx p2g deploy get <deployment-id>
   $ ipx p2g deploy usage <deployment-id>
   $ ipx p2g deploy cancel <deployment-id>   # and: uncancel, delete

Errors you may see
------------------

``402 Insufficient credits``
   The wallet is below the minimum for the operation. Check ``ipx p2g balance`` and top up.

``429``
   Rate limit reached (120 requests per minute per identity by default).
