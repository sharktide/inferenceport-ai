Usage: ``ipx usage``
====================

.. code-block:: console

   $ ipx usage get
   $ ipx --json usage get | jq .quota.usage
   $ ipx -O acme usage get          # includes the organization's spend breakdown
   $ ipx usage tiers                # compare subscription plans (no sign-in needed)
   $ ipx usage ledger               # Pay-2-Go credit ledger (same as `ipx p2g ledger`)

``ipx usage get`` combines three views:

**Quota** (your Lightning subscription)
   Daily chat, image and video limits and the weekly audio limit as colored meters - green while there is plenty left,
   amber and red as you approach the cap. ``∞ unlimited`` means the plan has no cap for that item.

**Pay-2-Go wallet**
   Credit balance and total spent. When an organization context is set the line is labelled with the organization that
   is being billed.

**Organization** (only with a context)
   Spend by user, model or key for the organization from ``/v1/orgs/<slug>/usage/breakdown``. Use
   ``ipx org usage breakdown`` for finer control (period and grouping) and ``ipx org usage export`` for CSV/JSON.

Skip parts you do not need with ``--no-quota`` or ``--no-wallet``. If one source fails (for example an API key cannot read
quotas), the others are still shown with a warning.
