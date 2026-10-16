AI Shield
=========

AI Shield is InferencePort's detection API for abuse, fraud and attacks. It is not limited to AI: the same engine
scores prompts and agent tool output, signups and logins, payments, emails and links, HTTP requests, file uploads,
passwords, marketplace listings, reviews, domains, crypto wallets, tokens and hashes — and enforces your own rules.

Every verdict contains a ``risk_score`` (0-100), a ``decision`` (``allow``, ``challenge``, ``rate_limit``, ``review`` or
``block``), the ``reasons`` behind it, suggested ``actions`` and machine-readable ``evidence``.

Quick start
-----------

.. code-block:: bash

   # Is this email a disposable address?
   curl -X POST https://api.inferenceport.ai/ai-shield/check \
     -H "Authorization: Bearer $IPX_API_KEY" -H "Content-Type: application/json" \
     -d '{"type": "email", "values": ["a@mailinator.com", "jane@gmail.com"]}'

   # Same thing from the CLI
   ipx shield disposable a@mailinator.com jane@gmail.com

Authentication uses the same bearer tokens as the rest of the Lightning API (an access token or an ``ipa_live_`` key).
Calls count against the plan's daily ``aiShieldDaily`` quota, and ``X-InferencePort-Org`` bills an organization.

Endpoints
---------

All routes live under ``/ai-shield``.

``POST /ai-shield/check``
~~~~~~~~~~~~~~~~~~~~~~~~~

One kind of indicator, one ``value`` or up to 500 ``values`` (de-duplicated, each at most 2048 characters). Use it for
narrow jobs: filter disposable email, triage an IOC list, audit JWTs or classify password hashes.

``type`` is one of:

.. list-table::
   :header-rows: 1
   :widths: 14 56 30

   * - Type
     - What it checks
     - Notable ``facts``
   * - ``email``
     - Disposable providers, provider typos, invalid syntax, role mailboxes, generated names, +alias and dot-alias
       farming, brand look-alike domains. Accepts bare domains too.
     - ``disposable``, ``free_provider``, ``role_account``, ``provider_typo``, ``canonical``
   * - ``domain``
     - Look-alikes, IDN spoofing, risky TLDs, DGA-style names, disposable-mail domains, registration age
     - ``registered_domain``, ``disposable_email_domain``, ``age_days``
   * - ``url``
     - Look-alike brands, raw-IP hosts, ``user@host`` tricks, shorteners, executables, redirects
     - ``host``, ``registered_domain``, ``indicators``
   * - ``ip``
     - Malformed, private/loopback/reserved addresses, CIDR description, abuse/proxy/VPN/Tor reputation
     - ``private``, ``global``, ``version``, ``addresses``, ``country``
   * - ``phone``
     - Invalid length, fictional 555-01XX, premium rate, repeated or sequential digits
     - ``valid``, ``e164``
   * - ``username``
     - Staff/system impersonation, homoglyphs, promotional and generated names
     - ``impersonation``
   * - ``user_agent``
     - Browser automation, scripting clients, crawlers
     - ``kind``
   * - ``wallet``
     - Bitcoin, Ethereum/EVM, Tron, Litecoin and Solana format and checksum
     - ``chain``, ``checksum_valid``
   * - ``jwt``
     - ``alg: none``, remote key headers, ``kid`` injection, expiry, lifetime. Decoded, never verified.
     - ``alg``, ``expired``, ``expires_at``, ``alg_none``
   * - ``hash``
     - MD5, SHA-1, SHA-2, NTLM, bcrypt, Argon2, scrypt, PBKDF2 and crypt formats
     - ``type``, ``slow_password_hash``, ``salted``
   * - ``secret``
     - API keys, private keys, tokens, cards, SSNs, IBANs (previews only, the text is never echoed)
     - ``contains_secret``, ``contains_pii``, ``matches``

Response:

* ``type``, ``count``, ``version``
* ``summary``: ``clean``, ``suspicious``, ``malicious``, ``by_decision``, ``external_lookups``
* ``results[]``: ``value``, ``verdict`` (``clean`` / ``suspicious`` / ``malicious``), ``decision``, ``risk_score``,
  ``confidence``, ``rules`` (matched rule ids such as ``email.disposable``), ``reasons``, ``categories``, ``facts``

Third-party reputation lookups (email, IP, domain age) run only for requests of 10 values or fewer unless
``config.external_lookups`` is set. ``config`` also accepts ``blocklists``, ``allowlists`` and ``custom_rules``, applied to
each value according to its type (for example ``email_domains`` for emails, ``ips`` with CIDR for IP addresses). ``jwt`` and
``secret`` values are never echoed back: ``value`` is returned as ``<N characters>``. Errors: ``400`` (bad ``type``/``values``, more than 500 values), ``413`` (value too long).

``POST /ai-shield/analyze``
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Full analysis of any mix of ``email``, ``phone``, ``username``, ``ip``, ``device_fingerprint``, ``geolocation``,
``signup_time``, ``content`` / ``messages``, ``urls``, ``sender`` and a free-form ``metadata`` object (for example
``form_fill_ms``, ``failed_logins``, ``cards_tried_last_hour``, ``account_age_days``, ``email_verified``). It also accepts
every artefact input listed under ``/scan``. Set ``task`` to choose how evidence is weighted.

``POST /ai-shield/scan``
~~~~~~~~~~~~~~~~~~~~~~~~

Content and artefact scan without identity fields. Defaults to ``task: prompt_guard``. Provide at least one of:

* ``content`` / ``text`` / ``prompt`` / ``messages`` / ``urls`` / ``url`` and optionally ``source``
  (``user``, ``tool``, ``document``, ``web``, ``email``, ``retrieval``; non-user sources raise indirect-injection weight)
* ``request``: ``{method, url|path, query, headers, body}`` for WAF-style inspection
* ``file`` / ``files``: ``{name, content_base64|text, mime}`` up to 10 MB each
* ``password``: strength and breach count (never stored, echoed or sent to the LLM)
* ``listing`` / ``review`` / ``domain`` / ``domains`` / ``wallet``

Extra response fields: ``findings.sensitive_data``, ``findings.urls``, ``findings.files``, ``findings.request``,
``findings.password``, ``findings.domains``, ``findings.wallet`` and ``redacted_content`` when ``config.redact`` is true.

``POST /ai-shield/detect-phishing``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``sender``, ``reply_to``, ``subject``, ``content``, ``url`` / ``urls`` and optional ``authentication``
(``spf``, ``dkim``, ``dmarc``). Returns ``is_phishing``, ``threat_level``, ``indicators``, ``explanation``, ``urls`` and the
full verdict. It works without the LLM reviewer.

``GET /ai-shield/capabilities``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Public (no token). Lists ``tasks`` with thresholds, ``features`` with defaults, ``check_types``, ``categories`` and
``decisions``.

Tasks
-----

``task`` re-weights the evidence and sets decision thresholds (challenge / review / block):

========================  =================  ==========================================================================
Task                      Thresholds         Use it for
========================  =================  ==========================================================================
``general`` (default)     30 / 55 / 75       Balanced weighing of every signal
``signup``                30 / 55 / 78       Bots, disposable and generated identities, multi-accounting, farming
``login``                 30 / 55 / 80       Credential stuffing, brute force, account takeover
``payment``               30 / 55 / 75       Card testing, stolen cards, risky new accounts, promo abuse
``content_moderation``    35 / 60 / 80       Spam, scams, threats, harassment, hate, self-harm in user content
``prompt_guard``          25 / 45 / 70       Prompt injection, jailbreaks, prompt extraction, tool abuse
``agent_tool_output``     25 / 45 / 70       Indirect injection in fetched pages, emails, files and tool results
``phishing``              30 / 50 / 70       Lures, look-alike links, sender spoofing, SPF/DKIM/DMARC failures
``dlp``                   20 / 40 / 65       Secrets and personal data, with redaction
``api_request``           30 / 50 / 70       Web/API traffic: injection, SSRF, traversal, scanners, probes
``file_upload``           30 / 50 / 70       Disguised executables, macros, scripted documents, archive bombs
``password``              25 / 50 / 70       Common, patterned, personal and breached passwords
``marketplace``           30 / 55 / 75       Prohibited and counterfeit goods, scams, off-platform payment
``reviews``               30 / 55 / 75       Fake, incentivised, duplicated and self-written reviews
``domain``                30 / 50 / 70       Look-alike, new and generated domains; wallet checksums
========================  =================  ==========================================================================

Request ``config``
------------------

* ``features``: map of feature name to boolean. Defaults are on, except ``duplicate_detection``, ``campaign_detection``
  and ``memory_update``. Turn off ``external_lookups`` and ``llm_reasoning`` for a fully offline, millisecond verdict.
* ``thresholds`` (``challenge`` / ``review`` / ``block``), ``category_weights`` (0-2), ``trusted_domains``, ``redact``,
  ``include_evidence``
* ``blocklists`` / ``allowlists``: ``emails``, ``email_domains``, ``domains``, ``ips`` (CIDR allowed), ``usernames``,
  ``phones``, ``countries``, ``keywords``, ``user_agents``, ``wallets``, ``device_fingerprints``, ``account_ids``
* ``custom_rules`` (up to 50): ``id``, ``keywords`` or ``pattern``, ``fields``, ``category``, ``weight`` (0-1),
  ``action`` (``challenge``, ``rate_limit``, ``review``, ``block``), ``explanation``. Regexes with nested quantifiers,
  lookarounds or backreferences are rejected and reported in ``warnings``.

Blocklist hits are hard evidence. Allowlisted subjects are allowed unless hard evidence says otherwise.

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
     - Suspicious. Present a CAPTCHA or additional verification.
   * - ``rate_limit``
     - Exceeds safe thresholds for automation or velocity. Throttle the source.
   * - ``review``
     - Warrants manual review. Flag for human inspection.
   * - ``block``
     - Malicious. Deny the operation.

Thresholds depend on the task (see the table above) and can be overridden per request with ``config.thresholds``.

Rate limits
-----------

Every endpoint except ``/capabilities`` counts against the plan's daily Shield limit:

.. list-table::
   :widths: 20 15 65
   :header-rows: 1

   * - Plan
     - Daily limit
     - Notes
   * - Free
     - 2
     - Evaluation and testing
   * - Light
     - 25
     - Development and small projects
   * - Core
     - 50
     - Growing applications
   * - Creator
     - 200
     - Creator workloads
   * - Professional
     - 500
     - Production deployments

Exceeding the limit returns HTTP ``429``. A ``/check`` request with up to 500 values counts as one call.

Python example
--------------

.. code-block:: python

   import httpx

   headers = {"Authorization": "Bearer YOUR_TOKEN"}

   # Is this email a disposable address?
   check = httpx.post("https://api.inferenceport.ai/ai-shield/check", headers=headers,
                      json={"type": "email", "values": ["a@mailinator.com", "jane@gmail.com"]}).json()
   for item in check["results"]:
       print(item["value"], item["verdict"], item["facts"].get("disposable"))

   # Full analysis of a signup
   result = httpx.post("https://api.inferenceport.ai/ai-shield/analyze", headers=headers, json={
       "task": "signup",
       "email": "user@example.com",
       "ip": "203.0.113.1",
       "metadata": {"user_agent": "Mozilla/5.0 ...", "form_fill_ms": 24000},
   }).json()
   print(f"Decision: {result['decision']} (risk: {result['risk_score']})")
   print(result["reasons"])

Errors
------

.. list-table::
   :widths: 15 85
   :header-rows: 1

   * - Code
     - Meaning
   * - ``400``
     - Invalid JSON, a missing required input (for example ``/check`` without ``type`` and ``value``, or
       ``/detect-phishing`` without ``content``, ``url``, ``sender`` or ``subject``), or more than 500 ``values``
   * - ``401``
     - Missing, invalid or expired bearer token
   * - ``413``
     - A ``/check`` value longer than 2048 characters
   * - ``429``
     - Daily Shield limit reached
   * - ``502``
     - Only when a request cannot be processed upstream; verdicts never fail just because the LLM reviewer is unavailable

Command line
------------

``ipx shield`` exposes every endpoint. Install ``ipx``, run ``ipx auth login``, then:

.. code-block:: bash

   ipx shield tasks                                            # tasks, features and check types (no sign-in)
   ipx shield disposable -f signups.txt --only-disposable      # disposable email detection
   ipx shield check ip -f iocs.txt --only-flagged --csv        # bulk indicator triage
   printf '%s\n' "$TOKEN" | ipx shield check jwt --fail-on review   # audit a token (stdin keeps it out of `ps`)
   ipx shield scan -f prompt.txt --task prompt_guard           # guard an LLM prompt
   git diff --cached | ipx shield scan --task dlp --fail-on review
   ipx shield analyze --task signup --email a@x.com --ip 203.0.113.7 -m form_fill_ms=500
   ipx shield phishing -f suspicious.eml
   ipx shield request "/search?q=1' OR '1'='1"
   ipx shield file uploads/* --fail-on review
   ipx shield password --email jane@acme.com
   ipx shield listing --title "Rolex 1:1" --price 120 --market-price 10000 --brand Rolex
   ipx shield review "Best ever!!" --rating 5 --author-reviews-24h 30
   ipx shield domain paypa1-login.top --wallet bc1q...

Safety notes: ``ipx shield password`` and ``check jwt|secret`` refuse a plain ``http://`` API URL for non-local hosts;
``--redact`` hides masked previews as well; an ``.eml``'s ``Authentication-Results`` is ignored unless you pass
``--trust-eml-auth`` (senders can forge it); the short ``-q`` flag goes before the command (``ipx -q shield scan``).

Shared options: ``--fail-on DECISION`` (exit code ``3`` when the verdict is that decision or stricter), ``--offline``,
``--no-llm``, ``--feature NAME=on|off``, ``--trusted-domain``, ``--challenge-at/--review-at/--block-at``, ``-e``,
``--policy FILE``, ``--block LIST=VALUE`` and ``--allow LIST=VALUE``. ``--json`` prints the raw API response.

The full command reference, with every option, the custom-policy format and CI recipes, is in :doc:`../cli/shield`.

Use cases
---------

* **Disposable email detection:** ``ipx shield disposable`` or ``POST /check`` with ``type: email`` and read
  ``facts.disposable``.
* **IOC triage:** ``ipx shield check ip|domain|url -f iocs.txt --only-flagged --csv``.
* **WAF:** ``ipx shield request --raw capture.http`` or ``POST /scan`` with ``request``.
* **Upload scanning:** ``ipx shield file`` or ``POST /scan`` with ``file``.
* **Leak prevention:** ``--task dlp --redact`` on outputs, logs and diffs.
* **LLM and agent guardrails:** ``task: prompt_guard`` for user input and ``agent_tool_output`` for retrieved content.
* **Phishing triage:** ``ipx shield phishing -f message.eml``.
* **Token and hash audits:** ``check jwt`` (pipe the token on stdin) and ``check hash``.
* **Your own rules:** ``blocklists``, ``allowlists`` and ``custom_rules`` on any call.

Accuracy and limits
-------------------

The deterministic detectors are tested against a labeled corpus (no benign sample may be reviewed or blocked, and no
attack may be allowed). The LLM reviewer can raise a score or lower a soft one but never below the floor set by hard
evidence such as a leaked private key. File inspection is structural triage, not an antivirus engine, and breach and
domain-age lookups depend on third-party services.

Server configuration
--------------------

Operators of a Lightning deployment can set these environment variables:

.. list-table::
   :header-rows: 1
   :widths: 38 62

   * - Variable
     - Purpose
   * - ``CER_KEY``
     - Comma-separated API keys for the LLM reviewer. Without it the reviewer is skipped and verdicts are deterministic only.
   * - ``SHIELD_LLM_URL``, ``SHIELD_LLM_MODEL``, ``SHIELD_LLM_TIMEOUT``
     - Reviewer endpoint, model (default ``lightning``) and timeout in seconds.
   * - ``SHIELD_DISPOSABLE_DOMAINS_PATH``
     - Extra disposable-email domain list, one domain per line (default ``/shield-intel/disposable-email-domains.txt``).
       The built-in list is small, so point this at a maintained feed in production.
   * - ``SHIELD_STORAGE_PATH``, ``SHIELD_ENCRYPTION_SECRET``
     - Where Shield memory is stored and the secret used to encrypt it (only used when ``memory_update`` is enabled).
   * - ``ABUSEIPDB_KEY``, ``IPQUALITYSCORE_KEY``, ``IPINFO_TOKEN``, ``VIRUSTOTAL_KEY``
     - Optional IP reputation providers.
   * - ``EMAILREP_KEY``, ``ABSTRACTAPI_EMAIL_KEY``, ``HIBP_KEY``
     - Optional email reputation providers.

Detection code lives in ``src/shield/`` in the InferencePort-Lightning repository: ``detectors/`` (deterministic checks),
``profiles.py`` (tasks), ``pipeline.py`` (evidence fusion), ``checks.py`` (``/check``) and ``llm.py`` (the reviewer).
Accuracy is guarded by a labeled corpus in ``tests/shield_corpus/``.
