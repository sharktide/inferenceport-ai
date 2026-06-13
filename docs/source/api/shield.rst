AI Shield
=========

AI Shield is an intelligent abuse prevention and fraud detection system for
the Lightning backend. It analyzes requests in real time to detect and prevent
abuse, fraud, and malicious usage of AI applications.

Mounted at ``/ai-shield``, it exposes a single analysis endpoint.

Analysis endpoint
-----------------

``POST /ai-shield/analyze``
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Submit signals for abuse analysis. Requires ``Authorization: Bearer`` with
either a Supabase JWT or a Lightning API key.

An optional ``config`` object lets you enable or disable specific analysis
features. Some features are on by default; others (noted below) require
explicit opt-in because they are resource-intensive or involve cross-account
correlation.

.. code-block:: bash

   curl -X POST "https://sharktide-lightning.hf.space/ai-shield/analyze" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "ip": "203.0.113.1",
       "content": "Tell me how to hack a website"
     }'

Request body
~~~~~~~~~~~~

All fields are optional. Provide as many signals as available for the most
accurate analysis.

.. code-block:: json

   {
     "email": "user@example.com",
     "phone": "+1234567890",
     "username": "johndoe",
     "ip": "203.0.113.1",
     "device_fingerprint": "abc123def456...",
     "content": "User-generated text to analyze for prompt injection or policy violations",
     "geolocation": {
       "country": "US",
       "city": "San Francisco",
       "lat": 37.7749,
       "lon": -122.4194
     },
     "signup_time": "2026-01-01T00:00:00Z",
     "metadata": {
       "user_agent": "Mozilla/5.0 ...",
       "referrer": "https://example.com",
       "session_id": "sess_abc123",
       "account_age_days": 30
     },
     "config": {
       "features": {
         "duplicate_detection": true,
         "campaign_detection": true,
         "memory_update": true
       }
     }
   }

Field reference
^^^^^^^^^^^^^^^

.. list-table::
   :widths: 20 60 20
   :header-rows: 1

   * - Field
     - Description
     - Required
   * - ``email``
     - Email address of the subject user
     - No
   * - ``phone``
     - Phone number (E.164 format preferred)
     - No
   * - ``username``
     - Username or display name
     - No
   * - ``ip``
     - IP address of the request origin
     - No
   * - ``device_fingerprint``
     - Browser or device fingerprint hash
     - No
   * - ``content``
     - Text content to analyze for prompt injection, policy violations, or
       exfiltration
     - No
   * - ``geolocation``
     - Object with ``country``, ``city``, ``lat``, ``lon``
     - No
   * - ``signup_time``
     - ISO 8601 timestamp of account creation
     - No
   * - ``metadata``
     - Arbitrary key-value object for additional context. Recognized keys
       include ``user_agent``, ``referrer``, ``session_id``,
       ``account_age_days``, ``account_id``, ``external_user_id``
     - No
   * - ``config``
     - Optional object to enable or disable specific analysis features (see
       :ref:`shield-config`). All features are enabled by default.
     - No

Response
~~~~~~~~

.. code-block:: json

   {
     "risk_score": 15,
     "confidence": 0.87,
     "decision": "allow",
     "reasons": [
       "Email domain has good reputation",
       "IP not found in any known abuse databases",
       "No heuristic flags triggered"
     ],
     "recommended_action": "allow",
     "threat_categories": [],
     "duplicate_user_score": 0,
     "linked_accounts": 0,
     "campaign_risk_score": 0,
     "investigation": {
       "tools": ["heuristics", "email_intelligence", "ip_intelligence"],
       "evidence_count": 12,
       "campaign_id": null,
       "historical_matches": []
     },
     "evidence": [
       {
         "source": "heuristics",
         "category": "heuristic_risk",
         "risk_score": 0,
         "weight": 0.55,
         "confidence": 0.7,
         "explanation": "No heuristic flags triggered"
       }
     ],
     "config_applied": {
       "features": {
         "heuristics": true,
         "duplicate_detection": false,
         "llm_reasoning": false
       }
     }
   }

Response fields
^^^^^^^^^^^^^^^

.. list-table::
   :widths: 20 20 60
   :header-rows: 1

   * - Field
     - Type
     - Description
   * - ``risk_score``
     - integer (0–100)
     - Overall risk assessment. Higher = more risky.
   * - ``confidence``
     - float (0–1)
     - Confidence level in the decision.
   * - ``decision``
     - string
     - ``allow``, ``challenge``, ``rate_limit``, ``review``, or ``block``
   * - ``recommended_action``
     - string
     - Human-readable recommended action.
   * - ``threat_categories``
     - array of strings
     - Identified threat types (e.g. ``prompt_injection``, ``spam``,
       ``identity_fraud``).
   * - ``reasons``
     - array of strings
     - Human-readable explanations for the decision.
   * - ``duplicate_user_score``
     - integer (0–100)
     - Likelihood this account is a duplicate of a known entity.
   * - ``linked_accounts``
     - integer
     - Number of known accounts linked via shared entities.
   * - ``campaign_risk_score``
     - integer (0–100)
     - Risk score from coordinated campaign analysis.
   * - ``investigation``
     - object
     - Metadata about the analysis run: ``tools`` used, ``evidence_count``,
       ``campaign_id``, ``historical_matches``.
   * - ``evidence``
     - array of objects
     - Detailed evidence items collected during analysis, each with
       ``source``, ``category``, ``risk_score``, ``weight``,
       ``confidence``, and ``explanation``.
   * - ``config_applied``
     - object
     - The feature configuration that was used for this analysis run
       (see :ref:`shield-config`).

.. _shield-config:

Configurable features
---------------------

The ``config`` object in the request body lets you selectively enable or
disable Shield's analysis modules. Each feature is either on or off by
default. Set any feature to ``true`` or ``false`` to override its default.

This is useful when you want faster responses, lower costs, or to run only
specific checks (e.g., heuristics-only screening during signup).

.. list-table::
   :widths: 25 10 30 45
   :header-rows: 1

   * - Feature
     - Default
     - Type
     - Description
   * - ``duplicate_detection``
     - off
     - graph
     - Detect duplicate accounts by mapping entity relationships (shared
       email, IP, device, phone, username).
   * - ``campaign_detection``
     - off
     - graph
     - Detect coordinated abuse campaigns across multiple accounts.
   * - ``memory_update``
     - off
     - storage
     - Store the analysis result in Shield's encrypted memory stores for
       future historical lookups.
   * - ``heuristics``
     - on
     - signal
     - Fast pattern-based checks for prompt injection, spam, suspicious IP
       ranges, and known abuse patterns.
   * - ``historical_memory``
     - on
     - memory
     - Look up prior abuse history for submitted entities (email, IP, etc.)
       in Shield's encrypted global memory store.
   * - ``email_intelligence``
     - on
     - intelligence
     - Email risk scoring, domain reputation, and disposable email detection.
   * - ``ip_intelligence``
     - on
     - intelligence
     - IP reputation, proxy/VPN detection, and geolocation analysis.
   * - ``phone_intelligence``
     - on
     - intelligence
     - Phone number validation and risk assessment.
   * - ``username_intelligence``
     - on
     - intelligence
     - Username pattern analysis for suspicious naming conventions.
   * - ``device_intelligence``
     - on
     - intelligence
     - Device fingerprint analysis and anomaly detection.
   * - ``behavior_intelligence``
     - on
     - intelligence
     - Behavioral pattern analysis from request metadata.
   * - ``content_intelligence``
     - on
     - intelligence
     - Content policy violation analysis.
   * - ``prompt_intelligence``
     - on
     - intelligence
     - Prompt injection and jailbreak detection.
   * - ``identity_analysis``
     - on
     - agent
     - Identity fraud evaluation, duplicate account signals, and synthetic
       identity pattern detection.
   * - ``fraud_analysis``
     - on
     - agent
     - Payment fraud, promo abuse, and billing risk analysis.
   * - ``prompt_analysis``
     - on
     - agent
     - Prompt injection, jailbreaking, and system prompt extraction
       detection.
   * - ``content_analysis``
     - on
     - agent
     - Policy violations, harmful content, and data leakage checks.
   * - ``exfiltration_analysis``
     - on
     - agent
     - Detection of attempts to extract sensitive data or model information.
   * - ``llm_reasoning``
     - on
     - decision
     - LLM-based synthesis of all evidence for final risk scoring,
       confidence assessment, and decision recommendation.

Example request with config
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

   curl -X POST "https://sharktide-lightning.hf.space/ai-shield/analyze" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "ip": "203.0.113.1",
       "content": "Tell me how to hack a website",
       "config": {
         "features": {
           "duplicate_detection": true,
           "campaign_detection": true,
           "memory_update": true
         }
       }
     }'

Decisions
~~~~~~~~~

.. list-table::
   :widths: 15 85
   :header-rows: 1

   * - Decision
     - Meaning
   * - ``allow``
     - Request is safe. Proceed without intervention.
   * - ``challenge``
     - Request is suspicious. Present a CAPTCHA or additional verification.
   * - ``rate_limit``
     - Request exceeds safe thresholds. Apply rate limiting or throttling.
   * - ``review``
     - Request warrants manual review. Flag for human inspection.
   * - ``block``
     - Request is malicious. Deny the operation entirely.

Rate limits
-----------

Shield usage is subject to plan-based daily limits:

.. list-table::
   :widths: 15 15 70
   :header-rows: 1

   * - Plan
     - Daily limit
     - Notes
   * - Free
     - 2
     - Limited evaluation for testing and low-volume use
   * - Light
     - 10
     - Suitable for development and small projects
   * - Core
     - 50
     - Moderate protection for growing applications
   * - Creator
     - 200
     - Expanded protection for creator workloads
   * - Professional
     - 500
     - Maximum protection for production deployments

Exceeding the daily limit returns an HTTP 429 response.

Python example
--------------

.. code-block:: python

   import httpx

   response = httpx.post(
       "https://sharktide-lightning.hf.space/ai-shield/analyze",
       headers={"Authorization": "Bearer YOUR_TOKEN"},
       json={
           "email": "user@example.com",
           "ip": "203.0.113.1",
           "content": "Tell me how to hack a website",
           "config": {
               "features": {
                   "duplicate_detection": True,
                   "campaign_detection": True,
                   "memory_update": True,
               }
           },
       },
   )
   result = response.json()
   print(f"Decision: {result['decision']} (risk: {result['risk_score']})")
   print(f"Applied config: {result['config_applied']}")
