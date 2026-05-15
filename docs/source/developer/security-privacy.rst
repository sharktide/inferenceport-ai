Security and Privacy
====================

Local-first by default
----------------------

InferencePort AI is designed for local usage first. Your chats, model imports,
and runtime state are primarily stored on your device.

If you do not sign in, most workflows remain local-only.

When cloud features are used
----------------------------

Some features use network services, including:

* Lightning generation and Lightning usage tracking
* Optional account sign-in and sync
* Optional Hugging Face lookups/import flows
* Optional website or tool registry access

Use these only when they match your privacy requirements.

Custom tools safety
-------------------

Custom tools can execute code. Treat them like running scripts on your
computer.

Best practices:

* Only import tools from trusted authors.
* Review tool metadata and source details before running.
* Deny execution when behavior is unclear.
* Keep security software and OS updates current.

Account and API key safety
--------------------------

If you use sign-in and Lightning API keys:

* Use strong credentials for your account.
* Revoke API keys you no longer use.
* Avoid sharing keys in screenshots, logs, or chat text.

Operational checklist
---------------------

* Use a secure OS account and disk encryption where possible.
* Avoid importing sensitive files unless needed.
* Periodically remove old sessions, models, and tools you no longer need.
* If using hosting/proxy mode, restrict allowed users and review logs.

Internal implementation details for contributors are documented in
:doc:`../contributing/security-privacy`.
