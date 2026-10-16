Host Server: ``ipx server``
===========================

``ipx server`` shares the models on your machine with people you approve - the command-line equivalent of the desktop
app's **Host (Proxy)** mode. It runs a small authenticating proxy in front of Ollama, on port **52458** by default, so
desktop users (and anything speaking the Ollama API) can use your models remotely.

.. code-block:: console

   $ ipx server start --allow teammate@acme.com            # foreground; Ctrl+C stops it
   $ ipx server start --allow boss@acme.com:admin --generate-key --detach
   $ ipx server status
   $ ipx server logs -f
   $ ipx server stop

Who can connect
---------------

Every request needs ``Authorization: Bearer <token>``:

* **Approved people** - their InferencePort access token, checked against the allowed-email list. ``--allow EMAIL`` adds
  a member; ``--allow EMAIL:admin`` adds an admin. The host must be signed in with a user session (email or OAuth,
  not an API key) so tokens can be verified.
* **Server API keys** - ``--generate-key`` creates a random ``ipxs_...`` key (shown once) and ``--api-key KEY`` adds one
  you already have. Keys act as admin. Keys need no sign-in, which makes them handy for scripts and CI.

Members are read-only: requests that pull, delete, create or run models are refused with ``403`` unless the user is an
admin. All access is logged with hashed client addresses and masked tokens.

Options
-------

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Option
     - Meaning
   * - ``--port N``
     - Listen port (default 52458).
   * - ``--host ADDR``
     - Interface to bind. Default ``0.0.0.0`` (all interfaces); use ``127.0.0.1`` to keep it on this machine.
   * - ``--allow EMAIL[:ROLE]``
     - Allowed user, repeatable. Roles: ``admin``, ``member`` (default).
   * - ``--api-key KEY`` / ``--generate-key``
     - Accept a server API key / create one.
   * - ``-d, --detach``
     - Run in the background. ``stop``, ``status`` and ``logs`` manage it.
   * - ``--verbose``
     - Echo the log to the terminal (foreground).

Organizations
-------------

With an organization context the server respects the organization's **desktop policy**: hosting can be allowed for
anyone, admins only, or disabled; and the allowed-user list can be built automatically from all members or from chosen
teams (``ipx org desktop-policy set --server-access org|teams``). Users you add with ``--allow`` are merged in.

Connecting from the desktop app
-------------------------------

In the desktop app, use the ``Remote host`` feature (see :doc:`/user-guide`) and enter ``http://<your-ip>:52458``,
signed in with an approved account. ``ipx server start`` prints your local and network addresses.

Compatibility and security notes
--------------------------------

* The desktop app's optional end-to-end encrypted handshake is **not** implemented by the CLI server. It answers the
  capability probe with ``supported: false``, and clients then use plain HTTP(S) as they do for older servers. Put the
  server behind HTTPS (a reverse proxy or tunnel) if it is exposed beyond a trusted network.
* The hardware-rating endpoint (``/sysinfo``) is not provided and returns ``501``.
* ``GET /__health`` answers ``204`` without authentication.
* Browsers may call the server only from ``https://inference.js.org`` and ``http://localhost:<port>``.
* Binding to all interfaces exposes the port to your network; ``ipx`` warns about this when it starts.
