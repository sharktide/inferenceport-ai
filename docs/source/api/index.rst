API Reference
=============

The InferencePort AI Lightning backend exposes three hosted API services on
``https://sharktide-lightning.hf.space``.

:doc:`gen-api`
    The **Generation API** (``/gen``) is the subscription-backed API used for
    cloud chat, image, video, and audio generation. It resolves your plan's
    daily usage quotas and is best for regular app-like workloads.

:doc:`p2g-api`
    The **Pay-2-Go (P2G) API** (``/v1``) is the credit-backed API for
    enterprise and production integrations. It meters each request against your
    wallet balance rather than plan quotas.

:doc:`shield`
    The **AI Shield** (``/ai-shield``) is an intelligent abuse prevention and
    fraud detection system. Submit request signals for real-time analysis and
    get back a risk score, decision, and detailed evidence.

Which API should I use?
-----------------------

* Use the **Generation API** when you want the same behavior as the app —
  chat, generate images, video, and audio with subscription-based daily
  limits and automatic router model selection.
* Use the **P2G API** when you need predictable credit-based billing,
  enterprise isolation, a stable production API surface, or want to select
  specific override models.
* Use the **AI Shield** when you need to screen signups, messages, or
  requests for abuse, fraud, or policy violations before they reach your
  application logic.

All three share a common authentication scheme and base URL.

Authentication
--------------

Every request requires a ``Bearer`` token in the ``Authorization`` header:

.. code-block:: bash

   curl https://sharktide-lightning.hf.space/gen/chat/completions \
     -H "Authorization: Bearer YOUR_TOKEN"

Tokens can be either:

* A **Supabase access token** (from the signed-in user's session).
* A **Lightning API key** (created from the web console at
  ``https://console.inferenceport.ai`` or from the app).

How they work together
----------------------

A single account can use all three APIs simultaneously:

* Subscription access controls the generation/chat experience and the daily
  plan limits shown in the app.
* P2G credits are separate and are spent from the wallet when you call the
  ``/v1`` routes.
* Shield usage counts against plan-based daily analysis limits.
* The hosted console at ``https://console.inferenceport.ai`` is where you can
  review balances, inspect usage, buy credit packs, and create API keys.

Create and manage API keys
--------------------------

1. Sign in at ``https://console.inferenceport.ai``.
2. Open the API key section in the console dashboard.
3. Enter a label for the key.
4. Optionally add an ISO-8601 expiration timestamp.
5. Copy the key immediately after creation. The raw secret is only shown once.

API keys are long-lived bearer tokens prefixed with ``ipa_live_``. They are
stored hashed in the database and can be revoked from the console at any time.

Common status codes
-------------------

.. list-table::
   :widths: 15 85
   :header-rows: 1

   * - Code
     - Meaning
   * - ``400``
     - Invalid request payload or missing required fields
   * - ``401``
     - Invalid, expired, or revoked bearer credential
   * - ``402``
     - Insufficient credits (P2G API only)
   * - ``404``
     - Resource not found
   * - ``413``
     - Prompt exceeds configured size limits
   * - ``429``
     - Plan limit or spam-limit exhaustion
   * - ``500``
     - Upstream provider or server configuration failure
   * - ``502``
     - Upstream generation service failure

.. toctree::
   :maxdepth: 2
   :caption: API Docs Contents

   gen-api
   p2g-api
   shield
