export class ChatBox extends HTMLElement {
	connectedCallback() {
		this.innerHTML = `
            <input type="file" id="file-upload" multiple style="display:none" />
            <form id="chat-form" role="form">
                <div class="typing-bar composer-shell">
                    <div id="file-preview-bar" class="file-preview-bar"></div>
                    <textarea
                        id="chat-input"
                        placeholder="Ask anything..."
                        rows="1"></textarea>

                     <div class="feature-btns tool-row">
                         <div class="tool-btn-wrap">
                             <button type="button" id="search-btn" class="search-btn tool-btn-sm" data-tool="webSearch" aria-label="Toggle web search">
                                 <span class="tool-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                                 <span id="search-text">Web Search</span>
                             </button>
                         </div>
                         <div class="tool-btn-wrap">
                             <button type="button" id="img-btn" class="search-btn tool-btn-sm" data-tool="imageGen" aria-label="Toggle image generation">
                                 <span class="tool-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>
                                 <span id="img-text">Image Generation</span>
                             </button>
                         </div>
                         <div class="tool-btn-wrap">
                             <button type="button" id="video-btn" class="search-btn tool-btn-sm" data-tool="videoGen" aria-label="Toggle video generation">
                                 <span class="tool-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></span>
                                 <span id="video-text">Video Generation</span>
                             </button>
                         </div>
                         <div class="tool-btn-wrap">
                             <button type="button" id="audio-btn" class="search-btn tool-btn-sm" data-tool="audioGen" aria-label="Toggle audio and SFX generation">
                                 <span class="tool-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/></svg></span>
                                 <span id="audio-text">Music/SFX</span>
                             </button>
                         </div>
                     </div>
                     <p id="rate-limit-box" style="display:none;">Rate Limit Information</p>
                     <div class="typing-actions composer-actions composer-actions-inside">
                         <button type="button" class="icon-btn composer-attach-btn" aria-label="Attach file" id="attach-btn">
                             <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                                 <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>
                             </svg>
                         </button>
                         <div class="composer-tools-right" aria-label="Tool toggles">
                             <button type="button" id="search-btn-mini" class="search-btn tool-btn-sm tool-btn-mini" data-mirror-target="search-btn" aria-label="Toggle web search">
                                 <span class="tool-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                             </button>
                             <button type="button" id="img-btn-mini" class="search-btn tool-btn-sm tool-btn-mini" data-mirror-target="img-btn" aria-label="Toggle image generation">
                                 <span class="tool-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>
                             </button>
                             <button type="button" id="video-btn-mini" class="search-btn tool-btn-sm tool-btn-mini" data-mirror-target="video-btn" aria-label="Toggle video generation">
                                 <span class="tool-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></span>
                             </button>
                             <button type="button" id="audio-btn-mini" class="search-btn tool-btn-sm tool-btn-mini" data-mirror-target="audio-btn" aria-label="Toggle audio and SFX generation">
                                 <span class="tool-icon" aria-hidden="true">                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>
                             </button>
                          <button type="submit" class="stop-btn composer-send-btn" aria-label="Send" id="send"><img src="../assets/img/up-arrow.svg" alt="send" width="40" height="40" /></button>
                          </div>
                      </div>

                     <div id="file-preview-modal" class="modal hidden">
                         <div class="modal-content full-screen">
                             <h3 id="file-preview-title"></h3>
                            <pre id="file-preview-content"></pre>
                            <div class="modal-actions">
                                <button id="file-preview-close">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        `;
	}
}

customElements.define("chat-box", ChatBox);
