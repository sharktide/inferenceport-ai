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
                    <button type="button" id="img-btn" class="search-btn" aria-label="Search">
                        <span id="img-text">Image Generation</span>
                    </button>
                    <button type="button" id="video-btn" class="search-btn" aria-label="Video generation">
                        <span id="video-text">Video Generation</span>
                    </button>
                    <button type="button" id="audio-btn" class="search-btn" aria-label="Audio or SFX generation">
                        <span id="audio-text">Audio/SFX Generation</span>
                    </button>
                    </div>
                    <p id="experimental-feature-notice">Experimental: Audio/SFX and Video generation is currently in beta! You may experience intermittent issues or rate limits.</p>
                    <p style="display:none;" id="feature-warning">The selected model does not support tools (web search, image generation, video generation, or audio/SFX generation). Get a model that does from the <a href="../marketplace/ollama.html">marketplace</a>.</p>

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
                <div class="typing-actions">
                    <button type="button" class="icon-btn" aria-label="Attach file" id="attach-btn">📎</button>
                    <button type="submit" class="stop-btn" aria-label="Send" id="send"><img src="../assets/img/up-arrow.svg" alt="send" width="40" height="40" /></button>
                </div>
            </form>
        `;
	}
}

customElements.define("chat-box", ChatBox);
