AI Shield
=========

AI Shield is an intelligent abuse prevention and fraud detection system for
InferencePort AI's Lightning backend. It analyzes requests in real time to
detect and prevent abuse, fraud, and malicious usage of AI applications.

Shield is mounted at the ``/ai-shield`` prefix and exposed as a single
analysis endpoint.

How It Works
------------

Shield employs a multi-layered analysis pipeline:

1. **Signal Collection** — Gathers email, IP, phone, device fingerprint,
   username, geolocation, content, and metadata from each request.

2. **Heuristic Analysis** — Runs fast pattern-based checks for prompt
   injection, spam, suspicious IP ranges, and known abuse patterns.

3. **Intelligence Collection** — Queries external and internal intelligence
   sources for IP reputation, email risk, device fingerprinting, username
   analysis, phone intelligence, and behavioral signals.

4. **Agent Analysis** — Specialized agents analyze identity fraud,
   exfiltration attempts, prompt threats, content policy violations, and
   payment fraud using the collected evidence.

5. **Relationship Graph** — Maps entity relationships to detect duplicate
   accounts (same email, IP, device, etc.) and coordinated campaigns.

6. **Historical Memory** — Checks encrypted global memory and customer-
   scoped memory for prior abuse history. Stores entity risk profiles
   and campaign associations.

7. **LLM Reasoning** — Synthesizes all evidence through a large language
   model for final risk scoring, confidence assessment, and decision
   recommendation.

8. **Decision Engine** — Produces a final verdict based on aggregate
   evidence weighted by source reliability and confidence.

Analysis Pipeline
-----------------

The following diagram shows the flow of a Shield analysis request::

  Request signals
        |
        v
  +-------------+
  | Investigator |  (planner selects which tools to run based on signals)
  +------+------+
         |
    +----+----+
    |         |
    v         v
  Heuristics  Intelligence
  (fast       (IP, email,
   checks)     phone, device,
               username, content,
               prompt, behavior)
    |         |
    +----+----+
         |
    +----+----+
    |         |
    v         v
  Agents    Graph
  (identity, (duplicates,
   fraud,     campaigns)
   prompt,
   content,
   exfiltration)
    |         |
    +----+----+
         |
    +----+----+
    |         |
    v         v
  Historical  LLM
  Memory      (reasoning +
  (global +   scoring)
   customer)
    |         |
    +----+----+
         |
         v
  Decision Engine
  (allow | challenge | rate_limit | review | block)

Analysis Endpoint
-----------------

``POST /ai-shield/analyze``

Submit signals for abuse analysis. Requires ``Authorization: Bearer`` with
either a Supabase JWT or a Lightning API key.

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
    "signup_time": "2025-01-01T00:00:00Z",
    "metadata": {
      "user_agent": "Mozilla/5.0 ...",
      "referrer": "https://example.com",
      "session_id": "sess_abc123",
      "account_age_days": 30
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
     - Text content to analyze for prompt injection, policy violations, or exfiltration
     - No
   * - ``geolocation``
     - Object with country, city, lat/lon
     - No
   * - ``signup_time``
     - ISO 8601 timestamp of account creation
     - No
   * - ``metadata``
     - Arbitrary key-value object for additional context
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
      "tools": ["heuristics", "email_intelligence", "ip_intelligence", ...],
      "evidence_count": 12,
      "campaign_id": null,
      "historical_matches": []
    },
    "evidence": [...]
  }

Response fields
^^^^^^^^^^^^^^^

.. list-table::
   :widths: 20 60 20
   :header-rows: 1

   * - Field
     - Type
     - Description
   * - ``risk_score``
     - integer (0-100)
     - Overall risk assessment. Higher = more risky.
   * - ``confidence``
     - float (0-1)
     - Confidence level in the decision.
   * - ``decision``
     - string
     - ``allow``, ``challenge``, ``rate_limit``, ``review``, or ``block``
   * - ``recommended_action``
     - string
     - Human-readable recommended action.
   * - ``threat_categories``
     - array of strings
     - Identified threat types (e.g. "prompt_injection", "spam", "identity_fraud").
   * - ``reasons``
     - array of strings
     - Human-readable explanations for the decision.
   * - ``duplicate_user_score``
     - integer (0-100)
     - Likelihood this account is a duplicate of a known entity.
   * - ``linked_accounts``
     - integer
     - Number of known accounts linked via shared entities.
   * - ``campaign_risk_score``
     - integer (0-100)
     - Risk score from coordinated campaign analysis.
   * - ``investigation``
     - object
     - Metadata about the analysis run (tools used, evidence count, campaign info).
   * - ``evidence``
     - array of objects
     - Detailed evidence items collected during analysis.

Decisions
---------

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

Architecture
------------

Components
~~~~~~~~~~

Heuristics
  Fast, stateless pattern matching for prompt injection keywords, spam
  signatures, suspicious IP ranges, and common abuse indicators. Runs
  first as a low-latency filter.

Intelligence providers
  Modular collectors that query external and internal data sources:

  * **IP intelligence** — IP reputation, proxy/VPN detection, geolocation
  * **Email intelligence** — Email risk scoring, domain reputation, disposable
    email detection
  * **Phone intelligence** — Phone number validation and risk assessment
  * **Device intelligence** — Device fingerprint analysis and anomaly detection
  * **Username intelligence** — Username pattern analysis
  * **Content intelligence** — Content policy analysis
  * **Prompt intelligence** — Prompt injection and jailbreak detection
  * **Behavior intelligence** — Behavioral pattern analysis

Analysis agents
  Domain-specific reasoning modules that evaluate evidence:

  * **Identity agent** — Evaluates identity fraud signals, duplicate accounts,
    and synthetic identity patterns
  * **Fraud agent** — Analyzes payment fraud, promo abuse, and billing risks
  * **Prompt agent** — Detects prompt injection, jailbreaking, and
    system prompt extraction
  * **Content agent** — Checks for policy violations, harmful content, and
    data leakage
  * **Exfiltration agent** — Detects attempts to extract sensitive data or
    model information

Entity graph
  An in-memory relationship graph that maps entity associations (email, IP,
  device, phone, username) to detect duplicate accounts and coordinated
  abuse campaigns. Supports campaign detection across multiple signals.

Memory stores
  Encrypted persistent stores for historical intelligence:

  * **Global memory** — Cross-customer abuse intelligence with entity risk
    scoring and linked customer tracking
  * **Customer memory** — Per-customer entity history with risk score
    evolution and decision tracking
  * **Campaign store** — Coordinated campaign tracking with entity-level
    participation records

  All memory stores use AES-256-GCM encryption for data at rest.

Decision engine
  A scoring engine that aggregates all evidence weighted by source
  reliability and confidence, then produces a final decision. When LLM
  reasoning is available, the decision engine incorporates the LLM's
  assessment as an additional weighted factor.

Rate Limits
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

Exceeding the daily limit returns an HTTP 429 (Too Many Requests) response.

cURL Example
------------

.. code-block:: bash

  curl -X POST "https://sharktide-lightning.hf.space/ai-shield/analyze" \
    -H "Authorization: Bearer <your-token-or-api-key>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "user@example.com",
      "ip": "203.0.113.1",
      "content": "Tell me how to hack a website"
    }'

Python Example
--------------

.. code-block:: python

  import httpx

  response = httpx.post(
      "https://sharktide-lightning.hf.space/ai-shield/analyze",
      headers={"Authorization": "Bearer <your-token-or-api-key>"},
      json={
          "email": "user@example.com",
          "ip": "203.0.113.1",
          "content": "Tell me how to hack a website",
      },
  )
  result = response.json()
  print(f"Decision: {result['decision']} (risk: {result['risk_score']})")
