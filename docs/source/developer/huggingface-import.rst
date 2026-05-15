Hugging Face Import Guide
=========================

Use this flow to pull GGUF-based models from Hugging Face into your selected
runtime host.

What this importer expects
--------------------------

* A model repository in ``username/repo`` format
* At least one ``.gguf`` file in that repository

You can enter either a plain ``username/repo`` path or a Hugging Face URL; the
app normalizes supported formats.

Open the Hugging Face importer
------------------------------

1. Open ``Marketplace``.
2. Select ``Hugging Face``.
3. Enter the model path.

Select host
-----------

Set ``Host`` in the modal:

* ``Local`` to pull into local runtime
* A configured remote host to pull into remote runtime

Choose quantization and pull
----------------------------

After you enter a valid model path:

1. The app checks Hugging Face and finds available GGUF quantizations.
2. Select one quantization from the dropdown.
3. Click ``Pull Model``.

The app then starts model pull for an ID like ``hf.co/username/repo:QUANT`` on
your selected host.

After pull completes
--------------------

1. Open ``Chat``.
2. Select the same host used during pull.
3. Choose the pulled model and send a test prompt.

Troubleshooting
---------------

* ``Format: username/repo`` message: fix the model ID format.
* ``Model not found``: confirm the repo exists and is public/accessible.
* Quantization list does not appear: repo may not contain GGUF files.
* Pull fails: verify host connectivity and available disk space.
