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
                    <li><a href="installed.html">Installed</a></li>
                    <li><a href="settings.html">Settings</a></li>
                </ul>
                <div id="user-indicator" style="margin-left:auto;display:flex;align-items:center;gap:10px;">
                    <span id="navbar-username" style="font-weight:600;color:#2a4d7a;"></span>
                    <span id="navbar-plan" style="background:#e5c846;color:#2a4d7a;padding:2px 10px;border-radius:6px;font-size:13px;font-weight:500;">Free Tier</span>
                    <button id="navbar-upgrade-btn" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:#2a4d7a;color:#fff;font-size:13px;cursor:pointer;">Upgrade</button>
                    <button id="navbar-signin-btn" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:#e5c846;color:#2a4d7a;font-size:13px;cursor:pointer;">Sign In / Sign Up</button>
                </div>
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
                    <li><a href="../installed.html">Installed</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                </ul>
                <div id="user-indicator" style="margin-left:auto;display:flex;align-items:center;gap:10px;">
                    <span id="navbar-username" style="font-weight:600;color:#2a4d7a;"></span>
                    <span id="navbar-plan" style="background:#e5c846;color:#2a4d7a;padding:2px 10px;border-radius:6px;font-size:13px;font-weight:500;">Free Tier</span>
                    <button id="navbar-upgrade-btn" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:#2a4d7a;color:#fff;font-size:13px;cursor:pointer;">Upgrade</button>
                    <button id="navbar-signin-btn" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:#e5c846;color:#2a4d7a;font-size:13px;cursor:pointer;">Sign In / Sign Up</button>
                    </div>
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
                    <li><a href="../installed.html">Installed</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                </ul>
                <div id="user-indicator" style="margin-left:auto;display:flex;align-items:center;gap:10px;">
                    <span id="navbar-username" style="font-weight:600;color:#2a4d7a;"></span>
                    <span id="navbar-plan" style="background:#e5c846;color:#2a4d7a;padding:2px 10px;border-radius:6px;font-size:13px;font-weight:500;">Free Tier</span>
                    <button id="navbar-upgrade-btn" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:#2a4d7a;color:#fff;font-size:13px;cursor:pointer;">Upgrade</button>
                    <button id="navbar-signin-btn" style="margin-left:8px;padding:4px 12px;border-radius:8px;background:#e5c846;color:#2a4d7a;font-size:13px;cursor:pointer;">Sign In / Sign Up</button>
                </div>
            </nav>
        `;

        const nav = this.querySelector('nav');
        if (nav) setupNavbar(nav);
    }
}
customElements.define("root-navbar", RootNavbar);
customElements.define("type1-navbar", Type1Navbar);
customElements.define("marketplace-navbar", MarketplaceNavbar);
