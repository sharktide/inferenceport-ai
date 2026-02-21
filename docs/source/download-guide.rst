Download Guide
==============

If you are downloading from ``https://inference.js.org`` and see multiple
files, use this page to pick the right one.

Find releases
-------------

Open the releases page at https://inference.js.org/install.html

Pick by operating system
------------------------

Windows
^^^^^^^

Common options:

* ``.exe`` (NSIS installer): best default for most users.
* ``.msi``: useful in managed/business Windows environments.
* ``.zip``: portable/manual setup style.

.. image:: https://get.microsoft.com/images/en-us%20dark.svg
   :target: https://apps.microsoft.com/detail/9P5D3XX84L28
   :alt: Download from Microsoft Store

Recommended: choose ``.exe`` or the Microsoft Store version for the best experience. The ``.msi`` is a good choice if you need to deploy across multiple machines in a business environment. The ``.zip`` is for users who prefer a portable version without installation.

macOS
^^^^^

Common options:

* ``.dmg``: best default for most users.
* ``.pkg``: installer package style.
* ``.zip``: portable app archive.

Recommended: choose ``.dmg``.

Linux
^^^^^

Common options:

* ``.AppImage``: easiest no-install style for many distros.
* ``.deb``: Debian/Ubuntu package install.
* ``.tar.xz``: archive/manual setup.

Recommended: choose ``.AppImage`` unless your distro workflow prefers
``.deb``.

Pick by hardware acceleration
-----------------------------

Some releases may include acceleration variants in the filename.

* Standard/no label: safest default for most users.
* ``CUDA``: for NVIDIA GPU acceleration.
* ``ROCM``: for AMD GPU acceleration.
* ``JETPACK``: for NVIDIA Jetson devices.

If you are unsure, choose the standard build first.

32-bit vs 64-bit / architecture labels
---------------------------------------

You may see architecture tags such as ``x64``, ``arm64``, or ``amd64``:

* ``x64`` / ``amd64``: most modern desktop/laptop CPUs.
* ``arm64``: Apple Silicon Macs and some ARM-based systems.

Choose the build that matches your system architecture.

If you are still not sure
-------------------------

1. Start with the standard installer for your OS.
2. Run the app and test model usage.
3. Switch to an accelerator build later only if you need it.
