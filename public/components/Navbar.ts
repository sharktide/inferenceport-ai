export class RootNavbar extends HTMLElement {
        connectedCallback() {

        this.innerHTML = `
            <nav>
                <div class="logo">⚡InferencePort AI</div>
                <ul class="nav-links">
                    <li><a href="index.html">Dashboard</a></li>
                    <li><a href="marketplace.html">Marketplace</a></li>
                    <li><a href="installed.html">Installed</a></li>
                    <li><a href="settings.html">Settings</a></li>
                    <li><a href="help/index.html" target="_blank">Getting Started</a></li>
                </ul>
            </nav>
        `;
    }
}
export class Type1Navbar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav>
                <div class="logo">⚡InferencePort AI</div>
                <ul class="nav-links">
                    <li><a href="../index.html">Dashboard</a></li>
                    <li><a href="../marketplace.html">Marketplace</a></li>
                    <li><a href="../installed.html">Installed</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                    <li><a href="../help/index.html" target="_blank">Getting Started</a></li>
                </ul>
            </nav>
        `;
    }
}

customElements.define("root-navbar", RootNavbar);
customElements.define("type1-navbar", Type1Navbar);
