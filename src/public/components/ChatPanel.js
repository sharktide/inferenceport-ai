export class ChatBox extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <input type="file" id="file-upload" multiple style="display:none" />
            <form id="chat-form" role="form">
                <div class="typing-bar">

                    <div id="file-preview-bar" class="file-preview-bar"></div>
                    <textarea
                        id="chat-input"
                        placeholder="Ask anything - try 'Hey! Search for Cookie Recipes'"
                        rows="4"></textarea>

                    <div class="feature-btns">
                    <button type="button" id="search-btn" class="search-btn" aria-label="Search">
                        <span id="search-text">Web Search</span>
                    </button>
                    <br>
                    <button type="button" id="img-btn" class="search-btn" aria-label="Search">
                        <span id="img-text">Image Generation</span>
                    </button>
                    </div>
                    <p style="display:none;" id="feature-warning">The selected model does not support web search or image generation. Get a model that does from the <a href="../marketplace/ollama.html">marketplace</a>.</p>

                    <div class="typing-actions">
                        <button type="button" class="icon-btn" aria-label="Attach file" id="attach-btn">📎</button>
                        <button type="submit" class="stop-btn" aria-label="Send" id="send">⬆️</button>
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
//# sourceMappingURL=ChatPanel.js.map