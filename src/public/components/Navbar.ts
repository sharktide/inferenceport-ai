function setupNavbar(nav: HTMLElement): () => void {
    const toggle = nav.querySelector<HTMLButtonElement>(".hamburger");
    const links = nav.querySelector<HTMLElement>(".nav-links");
    const currentPath = window.location.pathname.replace(/\/$/, "/index.html");
    links?.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
        if (new URL(a.href).pathname === currentPath) a.setAttribute("aria-current", "page");
    });
    const close = () => {
        links?.classList.remove("show");
        toggle?.setAttribute("aria-expanded", "false");
    };
    const onClick = () => {
        const open = links?.classList.toggle("show") ?? false;
        toggle?.setAttribute("aria-expanded", String(open));
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && links?.classList.contains("show")) {
            close();
            toggle?.focus();
        }
    };
    const onResize = () => { if (window.innerWidth > 1100) close(); };
    toggle?.addEventListener("click", onClick);
    nav.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
        toggle?.removeEventListener("click", onClick);
        nav.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", onResize);
    };
}

const userIndicatorMarkup = `
    <div id="user-indicator" class="navbar-user-indicator">
        <div class="navbar-account-meta">
            <div class="navbar-account-identity">
                <span class="navbar-account-avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="8" r="3.3" />
                        <path d="M5 20c.5-3.9 2.9-6 7-6s6.5 2.1 7 6" />
                    </svg>
                </span>
                <span id="navbar-username" class="navbar-username"></span>
                <span id="navbar-plan" class="navbar-plan" data-plan-key="free">Free Tier</span>
            </div>
            <div class="navbar-action-group">
                <button id="navbar-upgrade-btn" class="navbar-action-btn navbar-action-btn--primary" type="button">Upgrade</button>
                <button id="navbar-signin-btn" class="navbar-action-btn navbar-action-btn--secondary" type="button">Sign In</button>
            </div>
        </div>
    </div>
`;

class NavbarBase extends HTMLElement {
    private disposeNav: (() => void) | undefined;

    disconnectNav() {
        this.disposeNav?.();
        this.disposeNav = undefined;
    }

    setupNav() {
        const nav = this.querySelector('nav');
        this.disposeNav = nav ? setupNavbar(nav) : undefined;
    }
}
export class RootNavbar extends NavbarBase {
    connectedCallback() {
        this.innerHTML = `
            <nav aria-label="Primary navigation">
                <div class="nav-inner">
                <a class="logo" href="index.html"><img class="logo-mark" src="assets/img/logo.png" alt="" width="28" height="30" />InferencePort AI</a>
                <button class="hamburger" type="button" aria-label="Toggle navigation" aria-controls="app-primary-links" aria-expanded="false">Menu</button>
                <ul id="app-primary-links" class="nav-links">
                    <li><a href="renderer/chat.html">Chat</a></li>
                    <li><a href="renderer/studio.html">Studio</a></li>
                    <li><a href="index.html">Home</a></li>
                    <li><a href="marketplace.html">Explore</a></li>
                    <li><a href="installed.html">Installed</a></li>
                    <li><a href="settings.html">Settings</a></li>
                </ul>
                ${userIndicatorMarkup}
                </div>
            </nav>
        `;

        this.setupNav();
    }

    disconnectedCallback() {
        this.disconnectNav();
    }
}
export class Type1Navbar extends NavbarBase {
    connectedCallback() {
        this.innerHTML = `
            <nav aria-label="Primary navigation">
                <div class="nav-inner">
                <a class="logo" href="../index.html"><img class="logo-mark" src="../assets/img/logo.png" alt="" width="28" height="30" />InferencePort AI</a>
                <button class="hamburger" type="button" aria-label="Toggle navigation" aria-controls="app-primary-links" aria-expanded="false">Menu</button>
                <ul id="app-primary-links" class="nav-links">
                    <li><a href="chat.html">Chat</a></li>
                    <li><a href="studio.html">Studio</a></li>
                    <li><a href="../index.html">Home</a></li>
                    <li><a href="../marketplace.html">Explore</a></li>
                    <li><a href="../installed.html">Installed</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                </ul>
                ${userIndicatorMarkup}
                </div>
            </nav>
        `;

        this.setupNav();
    }

    disconnectedCallback() {
        this.disconnectNav();
    }
}
export class MarketplaceNavbar extends NavbarBase {
    connectedCallback() {
        this.innerHTML = `
            <nav aria-label="Primary navigation">
                <div class="nav-inner">
                <a class="logo" href="../index.html"><img class="logo-mark" src="../assets/img/logo.png" alt="" width="28" height="30" />InferencePort AI</a>
                <button class="hamburger" type="button" aria-label="Toggle navigation" aria-controls="app-primary-links" aria-expanded="false">Menu</button>
                <ul id="app-primary-links" class="nav-links">
                    <li><a href="../renderer/chat.html">Chat</a></li>
                    <li><a href="../renderer/studio.html">Studio</a></li>
                    <li><a href="../index.html">Home</a></li>
                    <li><a href="../marketplace.html">Explore</a></li>
                    <li><a href="../installed.html">Installed</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                </ul>
                ${userIndicatorMarkup}
                </div>
            </nav>
        `;

        this.setupNav();
    }

    disconnectedCallback() {
        this.disconnectNav();
    }
}
customElements.define("root-navbar", RootNavbar);
customElements.define("type1-navbar", Type1Navbar);
customElements.define("marketplace-navbar", MarketplaceNavbar);
