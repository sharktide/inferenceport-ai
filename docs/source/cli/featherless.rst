Featherless deployments: ``ipx featherless``
============================================

Deploy any model from the Featherless AI catalog and call it as ``hf/<Author>/<Model>`` through the normal chat
commands and API. A deployment costs **$0.50 per month** and token usage is billed at Featherless rates plus a small
markup, always from **paid credits** (promotional credits cannot be used).

Deployments belong to either **you** or an **organization**:

* With no organization context, every command acts on your own deployments and bills your wallet.
* With an organization context (``ipx auth context acme`` or ``-O acme``), every command acts on the organization's
  deployments. The fee is billed to the organization wallet and every member who may spend on the organization can
  call the model. Only **owners and admins** can deploy, cancel, restore and terminate; other roles can list and use
  them. Organization deployments need a signed-in session, not an API key.
* ``--personal`` ignores the saved context for one command.

.. code-block:: console

   $ ipx featherless models --search qwen
   $ ipx featherless status Qwen/Qwen2.5-7B-Instruct
   $ ipx featherless deploy Qwen/Qwen2.5-7B-Instruct          # your account
   $ ipx -O acme featherless deploy Qwen/Qwen2.5-7B-Instruct  # the organization
   $ ipx featherless list
   $ ipx p2g chat -m hf/Qwen/Qwen2.5-7B-Instruct

Browsing the catalog
--------------------

``models`` lists deployable models with context length and the price per million tokens you would pay. It needs no
sign-in. ``-s/--search`` filters by id; ``--page`` and ``--limit`` (up to 200) page through results.

``status MODEL`` shows whether a model is **warm** (loaded, answers immediately), **initializing**, or **cold** (the
first request triggers loading, which can take 5-15 minutes). ``deploy`` shows this before you confirm.

Deploying
---------

``deploy MODEL`` accepts ``Author/Model`` or ``hf/Author/Model``. It names who will be charged, asks for
confirmation (use ``-y`` in scripts) and charges the first month immediately. You get an error instead of a charge if
the wallet has less than $0.50 of paid credits, the model is not on Featherless, or the model is already deployed
(for a deployment that is canceling, use ``restore``).

If Featherless later removes a model, its deployment is cancelled without refunding the monthly fee.

Managing deployments
--------------------

.. list-table::
   :header-rows: 1
   :widths: 32 68

   * - Command
     - Purpose
   * - ``list [--all]``
     - Active and canceling deployments for the current context; ``--all`` adds expired and removed ones.
   * - ``get ID``
     - Pricing, billing cycle and model state of one deployment.
   * - ``usage ID``
     - Input and output tokens and credits charged.
   * - ``cancel ID``
     - Stop renewing. Access continues until the end of the paid cycle.
   * - ``restore ID`` (alias ``uncancel``)
     - Undo a cancel before the cycle ends.
   * - ``terminate ID`` (alias ``delete``)
     - End the deployment now. This cannot be undone and the fee is not refunded.

Deployments renew every 30 days from the same wallet. If the wallet cannot cover a renewal, the deployment expires.
Organization usage reading (``usage``) additionally needs a role that can see organization usage.

``ipx p2g deploy ...`` is the older, personal-only subset of these commands; prefer ``ipx featherless``.

In the console, the same organization deployments appear under **Deploy** while an organization is selected.
