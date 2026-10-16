Embeddings API
==============

``POST /v1/embeddings`` turns text into vectors for semantic search, clustering, recommendations and retrieval. It is
**OpenAI-compatible**, so the official OpenAI SDKs and most vector-database integrations work by changing the base URL
and key. Requests are billed per input token from your Pay-2-Go wallet (:doc:`p2g-api`).

.. note::

   Embeddings are part of the **Pay-2-Go API only**. They are not available on the subscription Generation API
   (``/gen``).

Quick start
-----------

**curl**

.. code-block:: bash

   curl https://api.inferenceport.ai/v1/embeddings \
     -H "Authorization: Bearer $IP_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "text-embedding-3-small",
       "input": ["The cat sat on the mat.", "A kitten is resting on a rug."]
     }'

**Python (OpenAI SDK)**

.. code-block:: python

   from openai import OpenAI

   client = OpenAI(base_url="https://api.inferenceport.ai/v1", api_key="ipa_live_...")
   result = client.embeddings.create(
       model="text-embedding-3-small",
       input=["The cat sat on the mat.", "A kitten is resting on a rug."],
   )
   print(len(result.data[0].embedding), result.usage.prompt_tokens)

**ipx**

.. code-block:: console

   $ ipx p2g embed "The cat sat on the mat." "A kitten is resting on a rug."

Request
-------

.. list-table::
   :widths: 22 18 60
   :header-rows: 1

   * - Field
     - Type
     - Description
   * - ``model``
     - string
     - Embedding model id or alias. Defaults to ``text-embedding-3-small``. See `Models`_.
   * - ``input``
     - string or array
     - **Required.** A string, or an array of **at most 32** strings. At most 2,000,000 characters (8 MB) per request;
       empty items are rejected. Token-id arrays and multimodal content parts are not supported.
   * - ``encoding_format``
     - string
     - ``float`` (default) or ``base64`` (little-endian float32, about half the response size).
   * - ``dimensions``
     - integer
     - Optional, 128-4096. Shortens the vector; each model has its own ceiling (its ``dimensions`` below) and Cohere accepts
       only 256, 512, 1024 or 1536. An unsupported value is rejected by the provider.
   * - ``task_type``
     - string
     - Optional retrieval hint for **Gemini** text input (for example ``RETRIEVAL_QUERY``, ``RETRIEVAL_DOCUMENT``,
       ``SEMANTIC_SIMILARITY``). It is converted to the model's recommended prompt instruction, and that instruction counts
       toward the tokens you are billed for.
   * - ``input_type``
     - string
     - Optional retrieval role for **Cohere**: ``query`` when searching, ``document`` when indexing.
   * - ``user``
     - string
     - Optional end-user identifier, forwarded to the provider.

Any other field is ignored. Embeddings are **text-only** through this API: Gemini and Cohere can also embed images (and
Gemini audio and video), but those inputs are not exposed here yet.

Response
--------

The body is the standard OpenAI shape. ``model`` is the InferencePort model id, and ``usage`` carries the credits charged
for the request:

.. code-block:: json

   {
     "object": "list",
     "model": "text-embedding-3-small",
     "data": [
       { "object": "embedding", "index": 0, "embedding": [0.0123, -0.0456, 0.0789] },
       { "object": "embedding", "index": 1, "embedding": [0.0101, -0.0432, 0.0811] }
     ],
     "usage": {
       "prompt_tokens": 14,
       "total_tokens": 14,
       "payg_credits_charged": 0.0001
     }
   }

The same charge is returned in response headers:

.. list-table::
   :widths: 35 65
   :header-rows: 1

   * - Header
     - Value
   * - ``X-Payg-Credits-Charged``
     - Decimal credits charged for this request.
   * - ``X-Payg-Units``
     - Input tokens billed.
   * - ``X-Payg-Unit-Label``
     - Always ``tokens``.

Models
------

``GET /v1/embeddings/models`` lists every embedding model with its price, vector size and input limit (embeddings are also
part of ``GET /v1/models``, with ``type: "embedding"``; use ``ipx p2g models --type embedding`` from the CLI). Prices are in
credits (1 credit = 1 USD) per **million input tokens**.

.. list-table::
   :widths: 27 18 12 13 30
   :header-rows: 1

   * - Model id
     - Provider
     - Dimensions
     - Input limit
     - Price / M tokens
   * - ``text-embedding-3-small``
     - OpenAI
     - 1536
     - 8,192
     - 0.02
   * - ``text-embedding-3-large``
     - OpenAI
     - 3072
     - 8,192
     - 0.13
   * - ``gemini-embedding-2``
     - Google
     - 3072
     - 8,192
     - 0.20
   * - ``cohere-embed-v4``
     - Cohere
     - 1536
     - 128,000
     - 0.12
   * - ``qwen3-embedding-8b``
     - Qwen
     - 4096
     - 40,960
     - 0.01

The list endpoint also returns ``supported_dimensions`` where a model accepts only specific sizes (Cohere), ``max_inputs``
and the parameters each model understands (``supported_parameters``).

Each model also answers to its provider id (for example ``openai/text-embedding-3-large``) and a few short aliases such as
``embedding-small``, ``embedding-large`` and ``qwen3-embedding``; the list endpoint shows them all. Rates are the live values
from the model catalog, and the console always shows the current price.

Billing
-------

* You are charged for the **input tokens the provider reports**; if a response carries no usage the request is billed on an
  estimate of the input size.
* A request that fails upstream is **not charged**.
* Reward discounts and per-user markups apply like they do for every other modality, and each request is written to your
  ledger as ``usage_kind: "embedding"`` (unit ``tokens``).
* Before forwarding, the API checks that your balance covers the estimated cost (and at least 0.01 credits).
* With an organization context (``X-InferencePort-Org`` header, or an organization API key) the request is billed to the
  organization's wallet and the organization's model and ``embedding`` modality policy applies.

Limits
------

* Requests are rate-limited per identity (120 per minute by default).
* At most 32 inputs per request (``max_inputs`` in the model list); split larger jobs into batches. ``ipx p2g embed`` does this
  for you.

Errors
------

.. list-table::
   :widths: 12 88
   :header-rows: 1

   * - Status
     - Meaning
   * - ``400``
     - Invalid ``input`` (including more than 32 items), ``encoding_format``, ``dimensions``, ``input_type`` or ``task_type``.
   * - ``401``
     - Missing, invalid or revoked credential.
   * - ``402``
     - Not enough credits for the request.
   * - ``403``
     - The organization's policy blocks this model or the ``embedding`` modality.
   * - ``404``
     - Unknown embedding model. Other models (for example chat or realtime models) are not accepted here.
   * - ``413``
     - ``input`` is larger than the size limits.
   * - ``429``
     - Rate limit reached.
   * - ``502``
     - The embedding provider could not be reached.

Embedding models are not chat models: sending one to ``/v1/chat/completions`` returns ``400`` with a pointer to this
endpoint.
