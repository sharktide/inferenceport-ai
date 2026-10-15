Imports: ``ipx import``
=======================

Add Hugging Face Spaces and websites to the **Installed** library of the desktop app, without opening it.

.. code-block:: console

   $ ipx import space black-forest-labs/FLUX.1-schnell
   $ ipx import website https://excalidraw.com --title Excalidraw --emoji 🎨
   $ ipx import file shared-card.import
   $ ipx import list [--type space|website]
   $ ipx import rm https://excalidraw.com        # by URL, title or user/space

How it works
------------

``ipx`` writes the same ``.import`` files the app writes, into its library folder: ``spaces/`` and ``websites/`` under
the app's data directory (``%APPDATA%\InferencePortAI``, ``~/Library/Application Support/InferencePortAI`` or
``~/.config/InferencePortAI``). Space cards use the Space's own colors, emoji and description from Hugging Face; website
cards use the page title (or ``--title``) and a random gradient.

The app reads the folder when it opens the Installed page, so restart it if it is already running. If the app is not
installed yet, the folder is created and picked up whenever you install it.

To import GGUF files or Hugging Face *models* (not Spaces), see :doc:`local-models`.
