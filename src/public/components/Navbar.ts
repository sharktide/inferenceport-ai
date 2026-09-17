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

    const expand = () => {
        clearTimeout(hideTimer);
        nav.classList.remove('collapsed');
        setAuthVisibility();
    };

    const collapse = (delay = 1200) => {
        clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
            nav.classList.add('collapsed');
            setAuthVisibility();
        }, delay);
    };

    nav.addEventListener('mouseenter', expand);
    nav.addEventListener('mouseleave', () => collapse());

    // Generous hot zone at the top of the viewport: the collapsed strip is only
    // ~8px tall and can be hard to reach (especially on macOS under the title
    // bar), so also expand whenever the cursor enters the top few rows of pixels.
    const HOVER_ZONE_HEIGHT = 48;
    window.addEventListener('mousemove', (e) => {
        if (e.clientY <= HOVER_ZONE_HEIGHT) expand();
    });
}

const userIndicatorMarkup = `
    <div id="user-indicator" class="navbar-user-indicator">
        <div class="navbar-account-meta">
            <span id="navbar-username" class="navbar-username"></span>
            <span id="navbar-plan" class="navbar-plan" data-plan-key="free">Free Tier</span>
        <div class="navbar-action-group">
            <button id="navbar-upgrade-btn" class="navbar-action-btn navbar-action-btn--primary" type="button">Upgrade</button>
            <button id="navbar-signin-btn" class="navbar-action-btn navbar-action-btn--secondary" type="button">Sign In</button>
        </div>
        </div>
    </div>
`;

export class RootNavbar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav>
                <div class="logo">⚡InferencePort AI</div>
                <ul class="nav-links">
                    <li><a href="renderer/chat.html">Chat</a></li>
                    <li><a href="renderer/studio.html">Studio</a></li>
                    <li><a href="index.html">Home</a></li>
                    <li><a href="marketplace.html">Explore</a></li>
                    <li><a href="installed.html">Installed</a></li>
                    <li><a href="settings.html">Settings</a></li>
                </ul>
                ${userIndicatorMarkup}
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
                    <li><a href="studio.html">Studio</a></li>
                    <li><a href="../index.html">Home</a></li>
                    <li><a href="../marketplace.html">Explore</a></li>
                    <li><a href="../installed.html">Installed</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                </ul>
                ${userIndicatorMarkup}
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
                    <li><a href="../renderer/studio.html">Studio</a></li>
                    <li><a href="../index.html">Home</a></li>
                    <li><a href="../marketplace.html">Explore</a></li>
                    <li><a href="../installed.html">Installed</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                </ul>
                ${userIndicatorMarkup}
            </nav>
        `;

        const nav = this.querySelector('nav');
        if (nav) setupNavbar(nav);
    }
}
customElements.define("root-navbar", RootNavbar);
customElements.define("type1-navbar", Type1Navbar);
customElements.define("marketplace-navbar", MarketplaceNavbar);
