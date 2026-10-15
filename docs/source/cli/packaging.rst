Building and Packaging ipx
==========================

This page is for contributors and release engineers. The CLI lives in https://github.com/inferenceport-ai/cli.

Layout
------

.. code-block:: text

   src/ipx/                 the CLI (Python; deps: click, rich, certifi)
     commands/              one module per command group (auth, org, p2g/gen via cloudgen, model, local, server, import …)
     http.py                dependency-free HTTP client (auth, org header, refresh, SSE, multipart)
     auth.py                Supabase password / OAuth loopback / SSO / API-key flows
     policy.py              client-side enforcement of the organization desktop policy
     proxy.py               the `ipx server` host proxy
   tests/                   mocked-API suite (no network, no credentials)
   packaging/
     build_binary.py        Nuitka build → dist/ipx-<os>-<arch>[.exe] + .sha256
     npm/                   launcher package + generator for per-platform packages
     cargo/                 Rust launcher crate that embeds the release binary
   install.sh, install.ps1  one-line installers that verify the checksum
   .github/workflows/       ci.yml, release.yml

How each channel ships
----------------------

One native binary per platform is the single artifact. Every channel delivers it - or, for pip, the source it is built from.

``pip`` (``inferenceport-cli``)
   A universal wheel and sdist. The installer resolves ``click``, ``rich`` and ``certifi`` itself. Console script
   ``ipx``.

``npm`` (``@inferenceport/ipx``)
   The same pattern as esbuild and swc: the main package is a ~2 KB launcher (``bin/ipx.js``) with the six platform
   packages (``@inferenceport/ipx-win32-x64`` … ``-linux-arm64``) as ``optionalDependencies``. Each platform package
   declares ``os`` and ``cpu``, so npm installs only the matching one. There is no postinstall download and no Python.
   The launcher forwards arguments, standard I/O, exit code and signals. ``IPX_BINARY_PATH`` overrides the binary.

``cargo`` (``ipx-cli``)
   ``build.rs`` downloads the release binary for the build target, verifies its SHA-256 against the published
   ``.sha256`` and embeds it with ``include_bytes!``. At run time the launcher unpacks it once into a per-version cache
   folder and runs it (``exec`` on Unix). ``IPX_BINARY_PATH`` at build time embeds a local binary instead of downloading
   (offline builds, CI), ``IPX_RELEASE_BASE`` points at a mirror, and ``IPX_CACHE_DIR`` moves the unpack location.

Installer scripts and GitHub release assets
   ``ipx-<os>-<arch>[.exe]`` with ``.sha256`` files and an aggregated ``SHA256SUMS``.

Building the native binary
--------------------------

Requires Python 3.9-3.13 and a C compiler (MSVC on Windows - Nuitka can fetch MinGW if none is found - plus Xcode tools
on macOS, or ``gcc`` and ``patchelf`` on Linux):

.. code-block:: console

   $ pip install -e ".[build]"
   $ python packaging/build_binary.py            # add --no-lto for a faster, larger build
   $ dist/ipx-linux-x64 --version

The build is ``--onefile``: the executable unpacks itself on first start into a per-version cache
(``{CACHE_DIR}/ipx/<version>``), so later runs start immediately. Build on the oldest OS you want to support, because
the result links against that system's C library. The release workflow uses ``ubuntu-22.04`` for Linux.

Releasing
---------

1. Bump the version in ``src/ipx/__init__.py``, ``packaging/cargo/Cargo.toml`` and
   ``packaging/npm/ipx/package.json`` (including the six ``optionalDependencies``). ``python packaging/check_versions.py``
   fails if they disagree.
2. Tag and push: ``git tag v0.2.0 && git push origin v0.2.0``.
3. The *Release* workflow runs the tests, builds the six binaries (smoke-testing each), publishes the GitHub release, then
   publishes to PyPI (trusted publishing), npm (platform packages first, then the launcher) and crates.io.

Required repository setup: a ``pypi`` environment with a PyPI trusted publisher, and the secrets ``NPM_TOKEN`` and
``CARGO_REGISTRY_TOKEN``.

Tests
-----

.. code-block:: console

   $ pip install -e ".[dev]"
   $ pytest

The suite starts an in-process fake InferencePort API, Supabase endpoint and Ollama, points the CLI at it with
``IPX_BASE_URL`` / ``IPX_OLLAMA_URL`` / ``IPX_HOME``, and covers authentication, cloud generation, organizations, local
models, the host proxy, imports, organization policy gates, the interactive chat and the rendering of every command's
help.
