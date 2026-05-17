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
                             <button type="button" id="tools-btn" class="search-btn tool-btn-sm" aria-label="Open tools">
                                 <span class="tool-icon" aria-hidden="true">
                                     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                         <path d="M14.7 6.3a1 1 0 0 0-1.4 0L6 13.6a1 1 0 0 0 0 1.4l3 3a1 1 0 0 0 1.4 0l7.3-7.3a1 1 0 0 0 0-1.4l-3-3z"/>
                                         <path d="M11 9l4 4"/>
                                         <path d="M3 21l6-2"/>
                                     </svg>
                                 </span>
                                 <span id="tools-text">Tools</span>
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
                              <button type="button" id="tools-btn-mini" class="search-btn tool-btn-sm tool-btn-mini" data-mirror-target="tools-btn" aria-label="Open tools">
                                  <span class="tool-icon" aria-hidden="true">
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M14.7 6.3a1 1 0 0 0-1.4 0L6 13.6a1 1 0 0 0 0 1.4l3 3a1 1 0 0 0 1.4 0l7.3-7.3a1 1 0 0 0 0-1.4l-3-3z"/>
                                          <path d="M11 9l4 4"/>
                                          <path d="M3 21l6-2"/>
                                      </svg>
                                  </span>
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
