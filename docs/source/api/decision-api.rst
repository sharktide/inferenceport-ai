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
questions and 2–64 choice/score criteria. Text-only requests are limited to
1 MB; D3 multimodal JSON requests support up to 48 MiB.
Streaming is not supported. The default model is
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

D3 model family
---------------

The six Decision 3.0 sizes share the provider endpoint
``https://decision.vllm-sr.ai/v1/systemone``. InferencePort public IDs differ
from upstream model IDs. These are InferencePort retail prices per million
input tokens, including image/video input usage.

.. list-table:: D3 model registry
   :header-rows: 1
   :widths: 35 35 10 20

   * - Public ID
     - Upstream ID
     - Size
     - Price / 1M input tokens
   * - ``vllm-sr-d3-turbo``
     - ``vllm-sr/d3-turbo``
     - 27B
     - $0.10
   * - ``vllm-sr-d3-flash``
     - ``vllm-sr/d3-flash``
     - 9B
     - $0.08
   * - ``vllm-sr-d3-mini``
     - ``vllm-sr/d3-mini``
     - 4B
     - $0.06
   * - ``vllm-sr-d3-nano``
     - ``vllm-sr/d3-nano``
     - 2B
     - $0.04
   * - ``vllm-sr-d3-lite``
     - ``vllm-sr/d3-lite``
     - 0.8B
     - $0.02
   * - ``vllm-sr-d3-edge``
     - ``vllm-sr/d3-edge``
     - 0.6B
     - $0.01

All six accept text, images and videos and return decisions. Use ``images``
with PNG, JPEG or WebP base64 data URLs; use ``videos`` with MP4, WebM,
QuickTime or Matroska base64 data URLs. Most D3 sizes accept up to four images
(8 MB decoded each). Turbo supports up to sixteen images (16 MiB each);
named turbo assets count toward the same image limit.
One video is supported up to 32 MB decoded. The serialized state/questions
portion may not exceed 1 MB, even with media attached. The entire serialized
JSON request is limited to 48 MiB, **including base64 expansion**, text,
images, video and named assets. Per-file limits do not override this total:
for example, three 16 MiB images cannot fit in one JSON request.
Provider limits may change; see
`live provider limits <https://decision.vllm-sr.ai/api/info>`_.

Image example (replace ``BASE64_IMAGE`` with encoded image bytes):

.. code-block:: json

   {
     "model": "vllm-sr-d3-flash",
     "state": "A photo taken by a rover on Mars.",
     "images": ["data:image/jpeg;base64,BASE64_IMAGE"],
     "questions": {
       "nearest": {
         "type": "choice",
         "instructions": "Which object is nearest the camera?",
         "criteria": {"rocks": "Pale rocks", "hills": "Dark distant hills"}
       }
     }
   }

For video, use ``"videos": ["data:video/mp4;base64,BASE64_VIDEO"]``
instead of ``images``. The 27B ``vllm-sr-d3-turbo`` also accepts
``assets``: named image objects whose raw ``data_base64`` values are
referenced via placeholders in state and criteria.

.. code-block:: json

   {
     "model": "vllm-sr-d3-turbo",
     "state": "This animal: <animal>",
     "assets": {
       "<animal>": {"type": "image", "data_base64": "BASE64_IMAGE"},
       "<a>": {"type": "image", "data_base64": "BASE64_IMAGE"}
     },
     "questions": {
       "pick": {
         "type": "choice",
         "instructions": "Which is the same kind of animal?",
         "criteria": {"a": "<a>", "b": "A different kind"}
       }
     }
   }

Credentials and backend configuration
-------------------------------------

Provide ``D3_API_KEY`` as a **server-side secret** to the Lightning backend.
All six variants reuse it and authenticate with the provider using a Bearer
header. ``D3_SYSTEMONE_URL`` optionally overrides the upstream endpoint.
**Never commit the provider credential**, including into ``cr5pto.py``, or
expose it in frontend, CLI or docs. Rotate credentials shared outside
the deployment secrets manager.

The backend catalog ``InferencePort-Lightning/src/models/decision.json``
contains the public IDs, upstream IDs, multimodal capabilities and rates.
Catalog updates flow into ``GET /v1/decision/models``, the console selector,
CLI discovery and pricing. Microsoft Decision 1 stays the default and rejects
image/video/asset fields. For other System One-compatible providers, add
a catalog entry with its endpoint, upstream ID, environment variable name and
retail rate. Other protocols require a server adapter.

Console and CLI
---------------

Open **Playground → Decisions** in the console. Select a model, choose text or
JSON state, optionally attach D3 image/video files or turbo asset JSON,
edit question JSON, evaluate, inspect probabilities and usage, and download
full responses. P2G and model panels also include a Decisions tab.
The marketplace has a Decisions filter and shows catalog token prices.

.. code-block:: console

   $ ipx p2g models --type decision
   $ ipx p2g prices --type decision
   $ ipx p2g decision --file request.json --output result.json
   $ ipx p2g decision 'Please refund me' --questions questions.json --json
   $ cat request.json | ipx p2g decision --file - --json
   $ ipx p2g decision 'What is in this photo?' -m vllm-sr-d3-flash -q questions.json --image rover.jpg
   $ ipx p2g decision 'What happens in this clip?' -m vllm-sr-d3-turbo -q questions.json --video launch.mp4

``request.json`` contains the full model/state/questions request, including
optional ``images``, ``videos`` and turbo ``assets`` fields. ``questions.json``
contains only the named questions object. ``--model`` explicitly overrides a model
in the request file. Without a state argument, the command reads text state from
stdin. Authentication and organization context work like other P2G commands.

Protocol reference: `Microsoft Decision in Foundry
<https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision>`_.
