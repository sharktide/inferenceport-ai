IPC API Reference
=================

All renderer-to-main communication is exposed through ``src/preload.cts`` via
``contextBridge.exposeInMainWorld``.

Contract notes
--------------

* ``invoke`` methods are request/response RPC.
* ``send``/event methods are stream-style for incremental output.
* Types are declared in ``src/global.d.ts`` and
  ``src/node-apis/types/*.d.ts``.

``window.ollama``
-----------------

Model and chat operations:

.. list-table::
   :header-rows: 1
   :widths: 28 24 48

   * - Method
     - IPC channel
     - Description
   * - ``listModels(clientUrl?)``
     - ``ollama:list``
     - List installed models for local or selected remote host.
   * - ``runModel(name)``
     - ``ollama:run``
     - Validate/select model runtime before chat.
   * - ``deleteModel(name, clientUrl?)``
     - ``ollama:delete``
     - Remove installed model.
   * - ``resetChat()``
     - ``ollama:reset``
     - Clear in-memory chat history in main process.
   * - ``pullModel(name, clientUrl?)``
     - ``ollama:pull``
     - Pull model image, emits progress events.
   * - ``isAvailable()``
     - ``ollama:available``
     - Check service health/availability.
   * - ``streamPrompt(model, prompt, toolList, clientUrl?)``
     - ``ollama:chat-stream``
     - Start streamed chat generation.
   * - ``stop()``
     - ``ollama:stop``
     - Abort active generation process.
   * - ``load()``
     - ``sessions:load``
     - Load saved sessions from disk.
   * - ``save(sessions)``
     - ``sessions:save``
     - Persist sessions to disk.
   * - ``getPath()``
     - ``session:getPath``
     - Return chat session storage directory.
   * - ``getToolSupportingModels()``
     - ``ollama:get-tool-models``
     - Return cached tool-capable model list.
   * - ``fetchToolSupportingModels()``
     - ``ollama:fetch-tool-models``
     - Refresh tool-capable model list from source.
   * - ``autoNameSession(model, prompt, clientUrl?)``
     - ``ollama:auto-name-session``
     - Generate suggested session title.
   * - ``importGGUF(fileName, data, isModelFile, clientUrl?)``
     - ``ollama:import-gguf``
     - Import GGUF/model file content.
   * - ``importGGUFMulti(modelfileData, ggufName, ggufData, clientUrl?)``
     - ``ollama:import-gguf-multi``
     - Import paired Modelfile + GGUF.
   * - ``startServer(port, users)``
     - ``ollama:start-proxy-server``
     - Start local authenticated proxy host.
   * - ``stopServer()``
     - ``ollama:stop-proxy-server``
     - Stop local proxy host.
   * - ``getServerLogs()``
     - ``ollama:get-server-logs``
     - Read proxy server logs.

Event subscriptions:

.. list-table::
   :header-rows: 1
   :widths: 30 22 48

   * - Method
     - Event channel
     - Description
   * - ``onPullProgress(cb)``
     - ``ollama:pull-progress``
     - Pull progress updates.
   * - ``onToolCall(cb)``
     - ``ollama:new_tool_call``
     - Tool call payload events.
   * - ``onNewAsset(cb)``
     - ``ollama:new-asset``
     - Asset generation event payloads.
   * - ``onResponse(cb)``
     - ``ollama:chat-token``
     - Token stream for assistant response.
   * - ``onError(cb)``
     - ``ollama:chat-error``
     - Stream-time failure.
   * - ``onDone(cb)``
     - ``ollama:chat-done``
     - Stream completed normally.
   * - ``onAbort(cb)``
     - ``ollama:chat-aborted``
     - Stream aborted by user/system.
   * - ``onLogAppend(cb)``
     - ``ollama:logs-append``
     - Incremental proxy log updates.

Utility methods:

* ``removeAllListeners()`` clears active chat stream listeners.

``window.utils``
----------------

.. list-table::
   :header-rows: 1
   :widths: 28 24 48

   * - Method
     - IPC channel
     - Description
   * - ``getAsset(assetId)``
     - ``utils:getAsset``
     - Read blob asset by UUID.
   * - ``rmAsset(assetId)``
     - ``utils:rmAsset``
     - Delete blob asset by UUID.
   * - ``listAssets()``
     - ``utils:listAssets``
     - List available local blob assets.
   * - ``web_open(url)``
     - ``utils:web_open``
     - Open URL externally with system browser.
   * - ``markdown_parse_and_purify(markdown)``
     - ``utils:markdown_parse_and_purify``
     - Render markdown and sanitize output.
   * - ``DOMPurify(html)``
     - ``utils:DOMPurify``
     - Sanitize provided HTML.
   * - ``saveFile(filePath, content)``
     - ``utils:saveFile``
     - Save text content to local path (guarded).
   * - ``getPath()``
     - ``utils:getPath``
     - Return user data directory path.
   * - ``getWarning(modelSize, clientUrl?)``
     - ``utils:get-hardware-performance-warning``
     - Return CPU/RAM compatibility warning data.
   * - ``isFirstLaunch()``
     - ``utils:is-first-launch``
     - Check first-launch marker.
   * - ``resetFirstLaunch()``
     - ``utils:reset-first-launch``
     - Remove first-launch marker.

``window.hfspaces``
-------------------

.. list-table::
   :header-rows: 1
   :widths: 28 24 48

   * - Method
     - IPC channel
     - Description
   * - ``get_cards()``
     - ``hfspaces:get-cards``
     - Return rendered/imported Space cards.
   * - ``delete(username, repo)``
     - ``hfspaces:delete``
     - Remove stored Space import.
   * - ``share(username, repo)``
     - ``hfspaces:share``
     - Export Space import to file.
   * - ``get_website_cards()``
     - ``hfspaces:get-website-cards``
     - Return rendered/imported website cards.
   * - ``delete_website(url)``
     - ``hfspaces:delete-website``
     - Remove stored website import.
   * - ``share_website(url, title)``
     - ``hfspaces:share-website``
     - Export website import to file.

``window.auth``
---------------

.. list-table::
   :header-rows: 1
   :widths: 28 24 48

   * - Method
     - IPC channel
     - Description
   * - ``signInWithGitHub()``
     - ``auth:signInWithGitHub``
     - Start GitHub OAuth flow.
   * - ``signInWithGoogle()``
     - ``auth:signInWithGoogle``
     - Start Google OAuth flow.
   * - ``signInWithEmail(email, password)``
     - ``auth:signInWithEmail``
     - Password-based sign in.
   * - ``signUpWithEmail(email, password)``
     - ``auth:signUpWithEmail``
     - Email/password registration.
   * - ``signOut()``
     - ``auth:signOut``
     - End local Supabase session.
   * - ``getSession()``
     - ``auth:getSession``
     - Read active session and profile.
   * - ``onAuthStateChange(callback)``
     - ``auth:onAuthStateChange`` + ``auth:stateChanged``
     - Subscribe renderer callback to auth changes.
   * - ``resetPassword(email)``
     - ``auth:resetPassword``
     - Send password reset email.
   * - ``verifyPassword(password)``
     - ``auth:verify-password``
     - Verify password before destructive account actions.
   * - ``deleteAccount()``
     - ``auth:delete-account``
     - Delete account and related records.
   * - ``setUsername(userId, username)``
     - ``auth:setUsername``
     - Create/update profile username.

``window.sync``
---------------

.. list-table::
   :header-rows: 1
   :widths: 28 24 48

   * - Method
     - IPC channel
     - Description
   * - ``getRemoteSessions()``
     - ``sync:getRemoteSessions``
     - Fetch remote sessions/messages for authenticated user.
   * - ``saveAllSessions(sessions)``
     - ``sync:saveAllSessions``
     - Upsert local sessions and prune remote deletions.
