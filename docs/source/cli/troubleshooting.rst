CLI Troubleshooting
===================

Start with ``ipx doctor``. It checks the API, your sign-in, the organization context, Ollama, the host-server port and the
desktop app's data folder, and exits non-zero if something is broken.

"You are not signed in" / "session expired"
   Run ``ipx auth login``. Sessions refresh automatically, but a refresh token can be revoked (password change, sign-out
   everywhere). In CI use ``IPX_API_KEY``.

"This command needs an organization context"
   Run ``ipx org list`` then ``ipx auth context <slug>``, or pass ``-O <slug>``.

"... needs a signed-in session, but you are using an API key"
   A few routes (listing your organizations, creating one, reading your organization desktop policy) only accept a user
   session. Sign in with ``ipx auth login`` using email or OAuth.

Browser sign-in never completes
   The CLI waits on a local ``127.0.0.1`` port for the browser to return. If the browser is on another machine or a
   firewall interferes, use ``ipx auth login --provider github --paste`` and paste the final address back. If the
   redirect loops back to the website instead of the terminal, paste works the same way.

``402 Insufficient credits``
   Pay-2-Go needs a funded wallet (or the organization's wallet when a context is set). ``ipx p2g balance``, then top up in
   the console.

``429`` / quota reached
   Lightning quotas reset daily or weekly: ``ipx usage get``. Pay-2-Go is rate-limited per minute.

"Local Ollama is not running"
   Start it (``ollama serve``, or open the desktop app) and retry. If it listens elsewhere, run
   ``ipx config set ollama_url http://host:11434``.

"... does not allow pulling models" / "approved model list"
   Your organization's desktop policy restricts this. Ask an admin to change ``ipx org desktop-policy``, or work with a
   personal context: ``ipx auth context --clear``.

"Could not verify <org>'s organization policy"
   The policy check needs network access the first time (and every five minutes after, with a 14-day offline grace).
   Check ``ipx status`` and your connection.

Host server: "Address already in use"
   Another process (often the desktop app's Host mode) holds the port. Choose another with ``--port`` or stop the other one.

Host server: clients get ``401 Token verification failed``
   The user's email must be on the allowed list (``--allow``) and the host must be signed in with a user session (not an API key) to verify tokens. Use
   ``--generate-key`` for token-free API-key access.

Imports do not appear in the app
   Restart the desktop app so it re-reads the library, and check ``ipx import list``. The folder used is shown by
   ``ipx doctor`` ("Desktop app data").

Colors or boxes look wrong
   Use a UTF-8 terminal with a modern font; ``--no-color`` (or ``NO_COLOR=1``) turns colors off.

Still stuck? Re-run with ``--json`` to see the raw error, and include ``ipx --version`` and ``ipx doctor`` output in an issue
at https://github.com/inferenceport-ai/cli/issues.
