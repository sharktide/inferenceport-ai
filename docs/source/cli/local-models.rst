Local Models: ``ipx model`` and ``ipx local``
=============================================

Local commands use the **Ollama** runtime on your machine - the same engine, and the same model store, as the
InferencePort AI desktop app. Models you pull with ``ipx`` appear in the app and the other way round. Nothing leaves
your computer.

If Ollama is not running you get a clear message with install guidance. The endpoint defaults to
``http://localhost:11434``; change it with ``ipx config set ollama_url <url>`` or ``IPX_OLLAMA_URL``.

Manage models
-------------

.. code-block:: console

   $ ipx model list                     # installed models with size, parameters and quantization
   $ ipx model search coder             # search the public catalog (no sign-in needed)
   $ ipx model pull llama3.2            # live per-layer progress; several names at once is fine
   $ ipx model show llama3.2            # parameters, capabilities, context length
   $ ipx model ps                       # what is loaded in memory right now
   $ ipx model copy llama3.2 my-llama
   $ ipx model rm llama3.2:1b
   $ ipx model create my-assistant -f Modelfile

``ipx models`` is an alias for ``ipx model``.

Import your own
---------------

.. code-block:: console

   $ ipx model import gguf ./model.Q4_K_M.gguf --name my-model --system "You are concise."
   $ ipx model import hf bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M

Organization policy applies: with a context set, an organization can block pulls, allow only an approved list, or block
imports (see :doc:`organizations`).

Chat
----

.. code-block:: console

   $ ipx local chat llama3.2
   $ ipx local chat                      # picks your default or lets you choose among installed models
   $ ipx local text llama3.2 "Explain monads in one sentence"
   $ cat main.rs | ipx local text llama3.2 --stdin "Find bugs in this"

``ipx local chat`` has the same interface as the cloud chats: streaming Markdown, ``/help``, ``/model``, ``/system``,
``/retry``, ``/save`` and multi-line input. Set a default with ``ipx config set default_local_model llama3.2``.
