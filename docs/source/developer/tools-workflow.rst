Tools Workflow
==============

This guide covers the full lifecycle for tools in the packaged app:
creating, importing, enabling, using, updating, publishing, taking down, and
deleting.

Before you start
----------------

* Use a model that supports tools.
* For web search tools, choose at least one search engine in ``Settings``.
* For custom tools, only run code from sources you trust.

Open Tools Manager
------------------

1. Open ``Chat``.
2. Click ``Tools`` in the composer area.
3. Use the ``Tools`` modal to manage built-in and custom tools.

Enable built-in tools
---------------------

In ``Tools`` -> ``Built-in Tools``, toggle:

* ``Web Search``
* ``Image Generation``
* ``Video Generation``
* ``Music/SFX Generation``

Notes:

* If your selected model does not support tools, the app blocks enabling.
* If your plan limit is exhausted for image/video/audio generation, enabling
  those tools may be blocked until usage resets.

Create a custom tool
--------------------

1. Open ``Tools`` -> ``Create``.
2. Fill in core fields:
   * ``Tool Name``
   * ``Language``
   * ``Functionality``
   * ``Code File``
3. Configure optional metadata:
   * ``Function Name``, ``Description``, ``Version``, ``Website``,
     ``Release Notes``
   * Input Parameters JSON Schema
   * Private User Inputs JSON
4. Choose visibility:
   * ``Private`` for local-only use
   * ``Unlisted`` or ``Public`` for registry publishing
5. Set an initial version number and
   provide a changelog description for the first version.
6. Dependencies: By default, the tool inherits the current system state.
   This means for most languages, if the package is present on the system,
   it can be used in your tool without additional configuration. For Rust,
   you can specify a list of cargo crates to be installed as you would with
   rust-script or cargo embedded manifest format.
7. Click ``Create Tool``.

After creation, the tool is added locally and can be toggled on in the same
modal.

Import a custom tool
--------------------

1. Open ``Tools`` -> ``Import``.
2. Paste a tool UUID.
3. Use ``Fetch Info`` to preview details.
4. Click ``Import``.

Imported tools appear under ``Registry Tools`` and can be enabled for chat.

Use tools during chat
---------------------

Built-in tools:

* Keep the tool toggled on.
* Prompt normally in chat; the model decides when to call tools.
* For image/video/audio tool calls, the app shows an in-chat review panel so
  you can adjust options and approve generation.

Custom tools:

* When a custom tool is requested, the app shows a permission dialog.
* Review tool identity and source details.
* To run it, confirm and type ``RUN`` when prompted.
* Deny if you do not trust the tool or request.
 
..warning:: Exercise caution when running custom tools, especially those from
    untrusted sources. They can execute code on your machine. Always review tool details and source code before confirming execution.

..warning:: For custom tools with web access, be mindful of potential data sharing with external services.
    Review the tool's functionality and permissions to understand what data may be transmitted.

..warning:: If you encounter unexpected behavior after enabling a tool, consider disabling it and reviewing its code or source for potential issues.

..warning:: Malicious tools can seriously harm your computer or data.
  Only run tools from sources you trust, and always review the code if possible.
  InferencePort AI is not responsible nor is liable for any and all damage caused by custom tools.

Edit and update a custom tool
-----------------------------

1. In ``Tools``, find the tool card and choose ``Edit``.
2. Update code or metadata.
3. Save changes.

Versioning note:

* When pushing updates to a published registry tool, your local version should
  be higher than the current registry version.

Publish and push updates
------------------------

1. In ``Tools``, choose ``Publish`` for a local tool.
2. For already published tools, choose ``Push update``.
3. Review the source diff summary and confirm.

The tool then appears in registry listings and can be imported by UUID.

Install the latest registry version
-----------------------------------

If a registry copy is newer than your local installed copy:

1. Open ``Tools``.
2. Find the tool card marked as having an update.
3. Choose ``Install latest``.

Take down (unpublish) a tool
----------------------------

For tools you own:

1. Open ``Tools``.
2. Choose ``Take down`` on the published tool.
3. Confirm removal from the registry.

This removes the registry listing but does not automatically delete every local
installed copy on other devices.

Delete a local tool copy
------------------------

1. Open ``Tools``.
2. Click ``Delete`` on the tool card.
3. Confirm deletion from this device.

This removes the local copy and also disables it if it was currently enabled.

Troubleshooting
---------------

* Tool toggle does not stay on: verify model supports tools and limits are not
  exhausted.
* Web search tool will not enable: set at least one search engine in
  ``Settings``.
* Import fails by UUID: confirm the ID is valid and still available.
* Custom tool run blocked: review permission prompts and ensure you confirmed
  execution.
