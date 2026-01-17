function setupNavbar(nav: HTMLElement) {
    let hideTimer: number | undefined;

    nav.classList.add('collapsed');

    const setAuthVisibility = () => {
        const auth = document.getElementById('user-indicator') as HTMLDivElement | null;
        if (!auth) return;

        const isExpanded = !nav.classList.contains('collapsed');

        auth.style.opacity = isExpanded ? "1" : "0";
        auth.style.pointerEvents = isExpanded ? "auto" : "none";
    };

    const observer = new MutationObserver(() => {
        const auth = document.getElementById('user-indicator');
        if (!auth) return;

        setAuthVisibility();
        observer.disconnect();
    });

    setAuthVisibility();

	if (!document.getElementById('user-indicator')) {
	    observer.observe(document.body, { childList: true, subtree: true });
	}

    nav.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        nav.classList.remove('collapsed');
        setAuthVisibility();
    });

    nav.addEventListener('mouseleave', () => {
        hideTimer = window.setTimeout(() => {
            nav.classList.add('collapsed');
            setAuthVisibility();
        }, 1200);
    });
}

export class RootNavbar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav>
                <div class="logo">⚡InferencePort AI</div>
                <ul class="nav-links">
                    <li><a href="renderer/chat.html">Chat</a></li>
                    <li><a href="index.html">Home</a></li>
                    <li><a href="marketplace.html">Explore</a></li>
                    <li><a href="installed.html">My Models</a></li>
                    <li><a href="settings.html">Settings</a></li>
                    <li><a href="help/index.html" target="_blank">Help</a></li>
                    <li><a href="javascript:window.utils.web_open('https://inferenceportai.vercel.app/security.html')">Terms</a></li>
                    <li><a href="javascript:window.utils.web_open('https://inferenceportai.vercel.app/security.html#privacy')">Privacy</a></li>
                </ul>
            </nav>
        `;

        const nav = this.querySelector('nav');
        if (nav) setupNavbar(nav);
    }
}
export class Type1Navbar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav>
                <div class="logo">⚡InferencePort AI</div>
                <ul class="nav-links">
                    <li><a href="chat.html">Chat</a></li>
                    <li><a href="../index.html">Home</a></li>
                    <li><a href="../marketplace.html">Explore</a></li>
                    <li><a href="../installed.html">My Models</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                    <li><a href="../help/index.html" target="_blank">Help</a></li>
                    <li><a href="javascript:window.utils.web_open('https://inferenceportai.vercel.app/security.html')">Terms</a></li>
                    <li><a href="javascript:window.utils.web_open('https://inferenceportai.vercel.app/security.html#privacy')">Privacy</a></li>
                </ul>
            </nav>
        `;

        const nav = this.querySelector('nav');
        if (nav) setupNavbar(nav);
    }
}
export class MarketplaceNavbar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav>
                <div class="logo">⚡InferencePort AI</div>
                <ul class="nav-links">
                    <li><a href="../renderer/chat.html">Chat</a></li>
                    <li><a href="../index.html">Home</a></li>
                    <li><a href="../marketplace.html">Explore</a></li>
                    <li><a href="../installed.html">My Models</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                    <li><a href="../help/index.html" target="_blank">Help</a></li>
                    <li><a href="javascript:window.utils.web_open('https://inferenceportai.vercel.app/security.html')">Terms</a></li>
                    <li><a href="javascript:window.utils.web_open('https://inferenceportai.vercel.app/security.html#privacy')">Privacy</a></li>
                </ul>
            </nav>
        `;

        const nav = this.querySelector('nav');
        if (nav) setupNavbar(nav);
    }
}
customElements.define("root-navbar", RootNavbar);
customElements.define("type1-navbar", Type1Navbar);
customElements.define("marketplace-navbar", MarketplaceNavbar);
