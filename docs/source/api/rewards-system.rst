Rewards System
==============

The Rewards System lets users earn badges and unlock discounts by using the
platform. Rewards are earned by hitting spending, usage, diversity, and streak
milestones. Claimed rewards apply automatic discounts to API requests.

Overview
--------

Users earn rewards automatically as they use the platform. Each reward has
a **criteria** (what you need to do) and a **reward** (what you get). Once
earned, rewards must be **claimed** before their discounts activate.

Discounts are applied **before** the per-user markup multiplier:

.. code-block:: text

   final_cost = base_cost * reward_discount * markup_multiplier

Reward Categories
-----------------

.. list-table::
   :header-rows: 1
   :widths: 20 30 50

   * - Category
     - Criteria Type
     - Example
   * - Spend
     - ``total_spend_usd``
     - Spend $100 → 25% off all Claude models
   * - Diversity
     - ``unique_models_tried``
     - Try 50 models → 25% off GPT-5.6 Terra
   * - Volume
     - ``total_requests``
     - 10,000 requests → 25% off GPT-5.6 Sol
   * - Tokens
     - ``total_tokens``
     - 200M tokens → 25% off all video models
   * - Streak
     - ``consecutive_days``
     - 30-day streak → 20% off all Claude models
   * - Special
     - ``multi_criteria``
     - Spend $100 + 20 models → 30% off Kimi K3

Values are placeholders only, real rewards may differ

Reward Types
~~~~~~~~~~~~

- **percentage_discount** -- Percentage off a model or model family
- **fixed_price** -- Locked price per million tokens for a specific model
- **bonus_credits** -- Free credits added on purchase
- **free_session** -- Free token allocation on a specific model

Model Pattern Matching
~~~~~~~~~~~~~~~~~~~~~~

Rewards use model ID patterns:

- ``*`` -- Matches all models
- ``claude-*`` -- Matches all models starting with ``claude-``
- ``*-turbo`` -- Matches all models ending with ``-turbo``
- ``claude-haiku-4.5`` -- Exact match

API Endpoints
-------------

All endpoints require ``Authorization: Bearer`` authentication.

``GET /v1/rewards``
~~~~~~~~~~~~~~~~~~~

Returns all rewards with user progress and active discounts.

.. code-block:: json

   {
     "rewards": [
       {
         "id": "credit_starter",
         "name": "Credit Starter",
         "description": "Spend $10 to unlock 10% off Gemini 2.5 Flash Lite",
         "icon": "\u2b50",
         "tier": 1,
         "category": "spend",
         "criteria": {
           "type": "total_spend_usd",
           "threshold": 10
         },
         "reward": {
           "type": "percentage_discount",
           "model_id": "gemini-2.5-flash-lite",
           "discount_percent": 10,
           "label": "10% off Gemini 2.5 Flash Lite"
         },
         "progress": {
           "current": 7.5,
           "threshold": 10,
           "percent": 75.0,
           "earned": false,
           "claimed": false
         }
       }
     ],
     "active_discounts": {
       "gemini-2.5-flash-lite": 10
     },
     "stats_summary": {
       "total_spend_usd": 7.5,
       "total_requests": 342,
       "total_tokens": 1250000,
       "unique_models_tried": 8,
       "consecutive_days": 3,
       "earned_count": 1,
       "claimed_count": 0
     }
   }

``GET /v1/rewards/earned``
~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns only earned but unclaimed rewards.

``GET /v1/rewards/claimed``
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns only claimed rewards.

``GET /v1/rewards/discounts``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns the user's active model discounts.

.. code-block:: json

   {
     "discounts": {
       "gemini-2.5-flash-lite": 10,
       "claude-*": 25,
       "__all_models__": 40
     }
   }

``GET /v1/rewards/progress/{reward_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Returns progress toward a specific reward.

.. code-block:: json

   {
     "reward_id": "credit_starter",
     "current": 7.5,
     "threshold": 10,
     "percent": 75.0,
     "earned": false,
     "claimed": false
   }

``POST /v1/rewards/claim/{reward_id}``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Claims an earned reward. Returns an error if the reward has not been earned
yet.

.. code-block:: json

   {
     "success": true,
     "already_claimed": false,
     "reward": { ... },
     "active_discounts": {
       "gemini-2.5-flash-lite": 10
     }
   }

``GET /v1/rewards/summary``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Full summary including all rewards, stats, and active discounts.

How Discounts Are Applied
-------------------------

When a PAYG request is processed, the charging flow is:

1. Calculate base cost from token count and model pricing
2. Check for fixed-price reward (overrides model pricing entirely)
3. Apply reward percentage discount (multiplicative)
4. Apply per-user markup multiplier (multiplicative)
5. Deduct final cost from wallet

.. code-block:: text

   base_cost = (tokens / 1,000,000) * pricing_per_million
   final_cost = base_cost * reward_discount * markup

If multiple claimed rewards match a model, only the **highest** discount
is used (rewards do not stack).

User Stats
----------

Per-user stats are stored in ``tools/rewards/{user_id}/stats.json`` and
updated asynchronously on every API request:

.. code-block:: json

   {
     "user_id": "uuid",
     "total_spend_usd": 7.5,
     "total_requests": 342,
     "total_tokens": 1250000,
     "unique_models_tried": ["lightning", "claude-haiku-4.5", "..."],
     "consecutive_days": 3,
     "last_request_date": "2026-08-17",
     "earned_rewards": ["credit_starter"],
     "claimed_rewards": [],
     "active_discounts": {},
     "updated_at": "2026-08-17T12:00:00Z"
   }

Stats are cached in memory and flushed to disk every 30 seconds.
