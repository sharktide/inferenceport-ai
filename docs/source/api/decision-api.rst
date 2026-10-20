Decision models / System One API
================================

``POST /v1/systemone`` evaluates typed questions against text or JSON state.
Decision models are part of the unified :doc:`p2g-api` and use wallet credits.
Use your InferencePort bearer token or API key; provider credentials stay on the
server. An optional ``X-InferencePort-Org`` header selects an organization wallet.

Quick start
-----------

.. code-block:: bash

   curl https://api.inferenceport.ai/v1/systemone \
     -H "Authorization: Bearer $IP_API_KEY" \
     -H 'Content-Type: application/json' \
     -d '{
       "model": "microsoft/decision-1",
       "state": "I was charged twice. Please refund me.",
       "questions": {
         "team": {
           "type": "choice",
           "instructions": "Which team should handle this request?",
           "criteria": {
             "billing": "Charges, invoices and refunds",
             "support": "How-to and account questions"
           }
         },
         "refund": {
           "type": "noul",
           "instructions": "Is the customer requesting a refund?"
         }
       }
     }'

Question types
--------------

* ``choice``: instructions and a named map of criteria. Answers include the
  selected choice and provider probabilities.
* ``noul``: instructions, with optional true/false criteria. Answers include a
  value from zero to one.
* ``score``: instructions and an ordered list of criteria, for example
  ``["Minor", "Major", "Critical"]``.

``state`` can be non-empty text, a JSON object, or a JSON array. Send 1–64 named
questions, 2–64 choice/score criteria, and at most 1 MB of serialized
state/questions. Streaming is not supported. The default model is
``microsoft/decision-1``.

The response preserves the provider's ``answers`` object, including per-question
errors and probability fields. ``model`` is the canonical InferencePort ID.
``usage.input_tokens`` and ``usage.payg_credits_charged`` report metering;
``X-Payg-Credits-Charged`` also carries the charge.

Discovery and pricing
---------------------

``GET /v1/decision/models`` lists enabled decision models. They also appear in
``GET /v1/models`` with ``type: "decision"``, output modality ``decision``, and
endpoint ``/v1/systemone``. They cannot back chat completions or managed agents.

Decision models bill per input token at the operator-configured retail rate.
Microsoft Decision 1 starts at $0.042 per million input tokens. Consult the live
catalog for current prices. Reported ``input_tokens`` (or ``prompt_tokens``) is
used when present; otherwise input is estimated across questions. No output-token
charge applies. Account discounts and markups follow normal P2G billing. Charges
round to the wallet's existing precision of 0.0001 credits, so very small charges
can round to zero. Provider failures and malformed/incomplete answers are not
charged.

The minimum balance defaults to 0.01 credits and is configured by
``limits.minimumDecisionCreditsBalance``. Organization model policies match the
canonical model ID; modality restrictions use ``decision``.

Status codes: invalid requests 400/413, unknown models 404, policy denials 403,
insufficient funds 402, unavailable provider configuration 503, provider failures
502. Normal authentication and spam limits also apply.

Configure providers
-------------------

The backend catalog is ``InferencePort-Lightning/src/models/decision.json``.
The Microsoft entry targets Foundry East US at
``https://inferenceport-1.services.ai.azure.com/providers/microsoft/v1/systemone``
with deployment ID ``Decision-1`` and API-key authentication from the
``FOUNDRY_KEY`` server secret. ``DECISION_SYSTEMONE_URL`` can override the endpoint.
Aliases include ``Decision-1``, ``decision-1`` and ``microsoft-decision-1``.
Set the secret in your backend deployment and adjust the deployment ID if needed.

Add further System One compatible services, including D3 or JEV, by appending a
catalog entry. Each entry declares an ID, provider, upstream ID, HTTPS API URL,
authentication type, key environment-variable name, and your retail input rate.
For example, adapt this D3 entry:

.. code-block:: json

   {
     "id": "vllm-sr/d3",
     "type": "decision",
     "name": "D3",
     "provider": "vllm-sr",
     "upstream_id": "vllm-sr/d3",
     "aliases": ["d3"],
     "allowed_in": ["payg"],
     "api_url": "https://decision.vllm-sr.ai/v1/systemone",
     "api_key_env": "D3_API_KEY",
     "auth_type": "bearer",
     "input_pricing_per_million_tokens": 0.05,
     "input_modalities": ["text"],
     "output_modalities": ["decision"]
   }

The rate above is an operator example, not a provider quote. Supply the actual
provider URL and model ID for JEV or another service. ``auth_type`` supports
``bearer``, ``api-key``, and ``none``. ``endpoint_env`` is an optional URL override.
``supported_question_types`` can limit the advertised and accepted question types.
``enabled: false`` hides the entry and rejects inference. Never put secrets in
JSON. Configuration changes appear on the next request without restarting.
Providers with other wire protocols need a server adapter.

Console and CLI
---------------

Open **Playground → Decisions** in the console. Select a model, choose text or
JSON state, edit question JSON, evaluate, inspect probabilities and usage, and
download the full response. P2G and model panels also include a Decisions tab.
The marketplace has a Decisions filter and shows catalog token prices.

.. code-block:: console

   $ ipx p2g models --type decision
   $ ipx p2g prices --type decision
   $ ipx p2g decision --file request.json --output result.json
   $ ipx p2g decision 'Please refund me' --questions questions.json --json
   $ cat request.json | ipx p2g decision --file - --json

``request.json`` contains the full model/state/questions request. ``questions.json``
contains only the named questions object. ``--model`` explicitly overrides a model
in the request file. Without a state argument, the command reads text state from
stdin. Authentication and organization context work like other P2G commands.

Protocol reference: `Microsoft Decision in Foundry
<https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision>`_.
