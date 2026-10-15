Scripting and Automation
========================

JSON output
-----------

Add ``--json`` before the command and you get JSON on standard output and nothing else:

.. code-block:: console

   $ ipx --json usage get | jq '.quota.usage.cloudChatDaily.remaining'
   $ ipx --json p2g balance | jq -r '.wallet.balance_credits'
   $ ipx --json p2g image "a red fox" -o fox.jpg
   {
     "files": ["fox.jpg"],
     "credits_charged": 0.02
   }

For list and show commands the JSON is the server's own response, so field names match the :doc:`/api/index`.
For generation commands it reports the saved files and credits charged.

Streams and pipes
-----------------

* One-shot text (``ipx gen text``, ``ipx p2g text``, ``ipx local text``) writes only the answer to standard output;
  model, timing and credits go to standard error.
* ``ipx gen text - < prompt.txt`` or ``--stdin`` read the prompt from standard input.
* ``ipx api METHOD PATH`` prints the raw response body, so it composes with ``jq``.

.. code-block:: console

   $ git diff --staged | ipx gen text "Write a conventional commit message" --stdin
   $ for f in docs/*.md; do ipx gen text "Translate to French" -f "$f" > "fr/$(basename $f)"; done

CI and servers
--------------

.. code-block:: yaml

   # GitHub Actions example
   - run: npm install -g @inferenceport/ipx
   - run: ipx --yes org usage export --days 7 --format csv -o usage.csv
     env:
       IPX_API_KEY: ${{ secrets.IPX_ORG_KEY }}
       IPX_ORG: acme

* Use an API key through ``IPX_API_KEY`` (no login step) - an organization key to bill the organization.
* Pass ``--yes`` to commands that confirm destructive actions; without it they refuse to run non-interactively.
* Interactive chats need a terminal; scripts should use the one-shot ``text`` commands.
* Exit codes are documented in :doc:`configuration`.

Job-style commands
------------------

Video and 3D take minutes. In scripts, split submit and fetch:

.. code-block:: console

   $ id=$(ipx --json gen video "a slow zoom" --no-wait | jq -r .id)
   $ ipx gen video --status "$id"
   $ ipx gen video --download "$id" -o clip.mp4

Environment for tests
---------------------

Point ipx at a staging or mock server with ``IPX_BASE_URL`` and ``IPX_OLLAMA_URL``, and isolate state with
``IPX_HOME=$(mktemp -d)``. The project's own test suite uses exactly this.
