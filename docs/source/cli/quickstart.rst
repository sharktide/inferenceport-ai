Quick Start
===========

Five minutes from install to a first result.

1. Sign in
----------

.. code-block:: console

   $ ipx auth login

Pick email and password, GitHub, Google, Microsoft, Hugging Face, single sign-on or an API key. OAuth providers open
your browser and return to the terminal automatically. See :doc:`authentication` for every option, including
non-interactive use in CI.

2. Chat with the cloud
----------------------

.. code-block:: console

   $ ipx gen chat                      # uses your Lightning subscription
   $ ipx gen text "Explain CRDTs in two sentences"

``ipx gen chat`` opens an interactive session with streaming Markdown. Type ``/help`` inside for the in-chat commands
(``/model``, ``/system``, ``/retry``, ``/save`` and more). ``ipx gen text`` prints a single answer to standard output,
so you can pipe it.

3. Generate media
-----------------

.. code-block:: console

   $ ipx gen image "a lighthouse at dawn, oil painting" -o lighthouse.jpg
   $ ipx gen video "a drone shot over a canyon at sunset" --seconds 8 -o canyon.mp4
   $ ipx gen audio speech "Welcome to InferencePort" -o hello.mp3

Video and 3D run as background jobs; ``ipx`` shows a progress bar and downloads the result when it finishes.

4. Use credits (Pay-2-Go)
-------------------------

.. code-block:: console

   $ ipx p2g balance
   $ ipx p2g chat
   $ ipx p2g 3d --image chair.jpg -o chair.glb

5. Work with an organization
----------------------------

.. code-block:: console

   $ ipx org list
   $ ipx auth context acme            # remember the organization for later commands
   $ ipx org members list
   $ ipx p2g chat                     # now billed to the organization's wallet

6. Run models locally
---------------------

.. code-block:: console

   $ ipx model pull llama3.2
   $ ipx local chat llama3.2
   $ ipx server start --allow teammate@example.com --detach     # share it

What next?
----------

* :doc:`lightning` and :doc:`p2g` - every cloud generation command.
* :doc:`organizations` - members, teams, keys, billing and policy.
* :doc:`local-models` and :doc:`server` - local chat and hosting.
* :doc:`scripting` - ``--json``, pipes and automation.
