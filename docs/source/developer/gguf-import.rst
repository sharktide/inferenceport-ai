GGUF Import Guide
=================

Use this flow when you already have local model files and want to import them
into the app.

Supported inputs
----------------

The ``Import Model`` flow accepts:

* ``.gguf`` file only
* ``Modelfile`` only
* ``Modelfile`` + ``.gguf`` together

Important rule:

* If your ``Modelfile`` references a GGUF in its ``FROM`` line, import both
  files together in one action.

Open the importer
-----------------

1. Open ``Marketplace``.
2. Select ``Import Model``.
3. Use drag-and-drop or click upload in the modal.

Choose import target host
-------------------------

In the importer modal, set ``Host`` to:

* ``Local`` for your local runtime
* A configured remote host if you want the import on that remote runtime

File handling behavior
----------------------

* The app validates file types and shows errors for unsupported files.
* If a ``Modelfile`` is present, the app shows a parsed preview.
* If a referenced GGUF is missing, import is blocked with a clear status
  message.

Optional alias
--------------

You can set an alias (up to 20 characters) before import. This is used as the
model name for the imported artifact.

Import scenarios
----------------

GGUF only:

1. Select one ``.gguf`` file.
2. Set optional alias and host.
3. Click ``Import``.

Modelfile only:

1. Select one ``Modelfile``.
2. Set optional alias and host.
3. Click ``Import``.

Modelfile + GGUF:

1. Select both ``Modelfile`` and its referenced ``.gguf``.
2. Confirm the status shows the reference is resolved.
3. Set optional alias and host.
4. Click ``Import``.

After import
------------

1. Open ``Chat``.
2. Select the same host you imported to.
3. Pick the imported model and run a test prompt.

Common failures
---------------

* ``Only .gguf or Modelfile allowed``: remove unsupported file types.
* ``Modelfile references .gguf``: add the referenced GGUF file in the same
  import action.
* Import fails on remote host: verify remote host connectivity and permissions.
