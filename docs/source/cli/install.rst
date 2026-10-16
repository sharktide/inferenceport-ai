Install
=======

``ipx`` is delivered as a self-contained native executable, compiled with `Nuitka <https://nuitka.net>`_. Whichever
package manager you use, the only thing you need installed is that package manager - there is no Python, Node or
Rust runtime to manage.

.. list-table::
   :header-rows: 1
   :widths: 22 48 30

   * - You have
     - Install command
     - What you get
   * - **pip** (Python 3.9+)
     - ``pip install inferenceport-cli``
     - The pure-Python package; ``pip`` installs its three small dependencies (``click``, ``rich``, ``certifi``).
   * - **npm** (Node 14+)
     - ``npm install -g @inferenceport/ipx``
     - A tiny launcher plus the native binary for your OS and CPU, installed as a platform package.
   * - **cargo** (Rust 1.70+)
     - ``cargo install ipx-cli``
     - A Rust launcher with the native binary embedded.
   * - macOS / Linux shell
     - ``curl -fsSL https://raw.githubusercontent.com/inferenceport-ai/cli/main/install.sh | sh``
     - The release binary in ``~/.local/bin`` (checksum verified).
   * - Windows PowerShell
     - ``irm https://raw.githubusercontent.com/inferenceport-ai/cli/main/install.ps1 | iex``
     - The release binary in ``%LOCALAPPDATA%\Programs\ipx`` (checksum verified, added to your PATH).
   * - Nothing
     - Download from the `GitHub releases <https://github.com/inferenceport-ai/cli/releases>`_
     - A single file per platform plus a ``.sha256`` checksum.

Supported platforms for the native binary: Windows (x64, arm64), macOS (Intel, Apple silicon) and Linux (x64, arm64).

Check the install
-----------------

.. code-block:: console

   $ ipx --version
   ipx 0.1.0
   $ ipx doctor

``ipx doctor`` verifies connectivity, your sign-in, the organization context, whether the local Ollama runtime is
running and whether the host-server port is free.

Updating
--------

Use the same tool you installed with: ``pip install -U inferenceport-cli``, ``npm update -g @inferenceport/ipx``,
``cargo install ipx-cli --force``, or re-run the install script.

Shell completion
----------------

.. code-block:: console

   $ ipx completion bash >> ~/.bashrc
   $ ipx completion zsh > ~/.zfunc/_ipx
   $ ipx completion fish > ~/.config/fish/completions/ipx.fish

First-run notes
---------------

* The first launch of the native binary unpacks itself once into a per-version cache folder (a second or two); later
  launches start immediately.
* Local-model features need the **Ollama** runtime. If you already use the InferencePort AI desktop app it is
  provided for you; otherwise install it from https://ollama.com. Cloud features need nothing extra.
