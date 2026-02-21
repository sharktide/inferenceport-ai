Contributing
============

Workflow
--------

1. Fork or branch from ``main``.
2. Keep changes scoped and focused.
3. Update docs when behavior or APIs change.
4. Open a pull request with a clear summary.

Code change checklist
---------------------

* TypeScript compiles successfully.
* IPC additions are mirrored in preload and global typings.
* User-visible behavior is validated in relevant renderer pages.
* Security-sensitive changes are reviewed for privilege boundaries.
* Docs are updated in:
  * :doc:`architecture`
  * :doc:`ipc-api`
  * :doc:`../user-guide`

Style and quality
-----------------

* Preserve existing project conventions and file organization.
* Prefer explicit typing and clear function boundaries.
* Avoid introducing direct renderer access to Node primitives.

License
-------

This repository is licensed under Apache 2.0. See ``LICENSE``.
