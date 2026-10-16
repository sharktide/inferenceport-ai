Lightning: ``ipx gen``
======================

``ipx gen`` uses the **Generation API** (``/gen``): the same subscription-backed Lightning service as the desktop
app's cloud mode. Requests consume your plan's daily quotas (see :doc:`usage`). The commands are identical to
:doc:`p2g` for chat and media; the differences are what pays (your plan, not credits) and that 3D is not available.

All commands need you to be signed in (:doc:`authentication`).

Chat
----

.. code-block:: console

   $ ipx gen chat
   $ ipx gen chat -m lightning --system "You are a terse code reviewer."

An interactive session with streaming Markdown, a live reasoning preview for models that think, and a footer showing
the model that answered (``lightning`` is the auto-router), tokens and elapsed time.

Inside the chat:

.. list-table::
   :widths: 25 75

   * - ``/help``
     - List the in-chat commands.
   * - ``/model [name]``
     - Show or switch the model.
   * - ``/models``
     - List models you can use.
   * - ``/system <text>``
     - Set the system prompt (clears history).
   * - ``/retry``
     - Regenerate the last answer.
   * - ``/clear``
     - Forget the conversation.
   * - ``/save [file]``
     - Save the transcript as Markdown.
   * - ``/usage``
     - Tokens and credits used in this chat.
   * - ``/exit``
     - Leave (or press Ctrl+D). Start a multi-line message with ``"""`` on its own line, or end a line with ``\``.

Press Ctrl+C while an answer is streaming to stop it and keep what was generated.

Text
----

.. code-block:: console

   $ ipx gen text "Summarize the Rust borrow checker"
   $ git diff | ipx gen text "Write a commit message for this diff" --stdin
   $ echo "why is the sky blue" | ipx gen text -
   $ ipx gen text "Review this" -f src/main.py --system "Be strict"

The answer streams to standard output; model and timing details go to standard error, so redirects stay clean.
``--no-stream`` waits for the full answer. ``--json`` returns ``{"text", "model", "usage"}``.

Images
------

.. code-block:: console

   $ ipx gen image "a lighthouse at dawn" -o lighthouse.jpg
   $ ipx gen image "cyberpunk city" -n 4 --mode fantasy -o city.jpg          # city-1.jpg ... city-4.jpg
   $ ipx gen image "same scene at night" --ref lighthouse.jpg                # image-to-image

``--mode`` is ``fantasy`` (stylized) or ``realistic``. ``--ref`` takes up to two local files or URLs. Without ``-o``
the file is named ``image-<timestamp>.jpg`` in ``output_dir`` (or the current directory).

Video
-----

Video generation is asynchronous. ``ipx`` submits the job, shows a progress bar and downloads the result:

.. code-block:: console

   $ ipx gen video "a drone flying over a canyon at sunset" --seconds 8 --size 1280x720 -o canyon.mp4
   $ ipx gen video "a slow zoom" --ref frame.jpg           # image-to-video
   $ ipx gen video "a slow zoom" --no-wait                 # print the job id and return
   $ ipx gen video --status vid_a1b2c3d4e5f6
   $ ipx gen video --download vid_a1b2c3d4e5f6 -o clip.mp4

Sizes: ``1280x720`` (default), ``720x1280``, ``1792x1024``, ``1024x1792``. Durations: 4, 8, 12, 20 or 30 seconds
(the server clamps to what the model supports). Completed videos expire after 24 hours; see :doc:`/api/video-async-api`.

Audio
-----

.. code-block:: console

   $ ipx gen audio speech "Welcome to InferencePort" --voice alloy --format mp3 -o hello.mp3
   $ ipx gen audio sfx "gentle rain and distant thunder" --seconds 10 -o rain.mp3
   $ ipx gen audio timestamps "Hello world" -o hello.mp3      # also writes hello.json with word timing
   $ ipx gen audio transcribe meeting.mp3 -o meeting.txt
   $ ipx gen audio isolate noisy.wav -o clean.mp3
   $ ipx gen audio voice-change me.wav --field voice_id=abc123
   $ ipx gen audio stems song.mp3

``transcribe``, ``isolate``, ``voice-change`` and ``stems`` upload a file (up to 50 MB). Extra form fields go through
repeatable ``--field KEY=VALUE``.

Models and plan
---------------

.. code-block:: console

   $ ipx gen models                     # everything
   $ ipx gen models --type image -s flux
   $ ipx gen plan                       # your plan and upgrade options

3D
--

3D generation is only part of the Pay-2-Go API. ``ipx gen 3d`` explains this and points you to ``ipx p2g 3d``.

Embeddings and realtime
-----------------------

Embeddings and realtime voice sessions are also Pay-2-Go only. ``ipx gen embed`` and ``ipx gen realtime`` explain this and
point you to ``ipx p2g embed`` and ``ipx p2g realtime`` (:doc:`p2g`).
