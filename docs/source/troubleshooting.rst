Troubleshooting
===============

App will not install or open
----------------------------

* Re-download the installer from ``https://inference.js.org``.
* Confirm you picked the correct OS and architecture build.
* On macOS, if blocked by security settings, open from System Settings after
  first attempt.
* On Linux, make sure the file is executable if using ``AppImage``.

Models are not loading
----------------------

Checks:

* Ensure Ollama is installed/running if using local host.
* Verify remote host URL configuration in UI host selector.
* Confirm proxy host is reachable if using port ``52458`` workflows.

Actions:

* Restart app and retry model list in marketplace/chat.
* Try another model to isolate whether one model is broken.
* If using remote host, verify the host URL is still online.

Chat responses stop streaming
-----------------------------

Possible causes:

* Active stream was aborted.
* Model backend became unavailable.
* Tool call failed due to network/service issues.

Actions:

* Start a new chat session and retry.
* Switch to a known-good model/host.
* Disable optional tools and retry prompt.

Auth issues
-----------

If sign-in state is inconsistent:

* Open auth page and complete login again.
* Make sure your browser completed the login redirect flow.
* Sign out and sign back in from Settings/Auth screens.

Sync does not update
--------------------

* Confirm sign-in state is valid.
* Enable sync toggle in Settings.
* Check your internet connection and retry.

Still stuck?
------------

1. Restart the app.
2. Try the latest standard build for your OS.
3. Open an issue with steps to reproduce on
   ``https://github.com/sharktide/inferenceport-ai/issues``.
