const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ollama', {
    listModels: () => ipcRenderer.invoke('ollama:list'),
    runModel: (name) => ipcRenderer.invoke('ollama:run', name),
    deleteModel: (name) => ipcRenderer.invoke('ollama:delete', name),
    resetChat: () => ipcRenderer.invoke('ollama:reset'),
    onResponse: (callback) => ipcRenderer.on('ollama:response', (_, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('ollama:error', (_, err) => callback(err)),
    onDone: (callback) => ipcRenderer.on('ollama:done', () => callback()),
    stop: () => ipcRenderer.send('ollama:stop'),
    pullModel: (name) => ipcRenderer.invoke('ollama:pull', name),
    onPullProgress: (cb) => ipcRenderer.on('ollama:pull-progress', (_, data) => cb(data)),
    streamPrompt: (model, prompt) => ipcRenderer.send('ollama:chat-stream', model, prompt),
    onResponse: (cb) => ipcRenderer.on('ollama:chat-token', (_, token) => cb(token)),
    onError: (cb) => ipcRenderer.on('ollama:chat-error', (_, err) => cb(err)),
    onDone: (cb) => ipcRenderer.on('ollama:chat-done', cb),
    load: () => ipcRenderer.invoke('sessions:load'),
    save: (sessions) => ipcRenderer.invoke('sessions:save', sessions),
    getPath: () => ipcRenderer.invoke('session:getPath'),
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('ollama:chat-token');
        ipcRenderer.removeAllListeners('ollama:chat-error');
        ipcRenderer.removeAllListeners('ollama:chat-done');
    }
});
