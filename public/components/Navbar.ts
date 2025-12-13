export class RootNavbar extends HTMLElement {
        connectedCallback() {

        this.innerHTML = `
            <nav>
                <div class="logo">⚡InferencePort AI</div>
                <ul class="nav-links">
                    <li><a href="index.html">Home</a></li>
                    <li><a href="marketplace.html">Explore</a></li>
                    <li><a href="installed.html">My Models</a></li>
                    <li><a href="settings.html">Settings</a></li>
                    <li><a href="help/index.html" target="_blank">Help</a></li>
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
                    <li><a href="../index.html">Home</a></li>
                    <li><a href="../marketplace.html">Explore</a></li>
                    <li><a href="../installed.html">My Models</a></li>
                    <li><a href="../settings.html">Settings</a></li>
                    <li><a href="../help/index.html" target="_blank">Help</a></li>
                </ul>
            </nav>
        `;
    }
}

customElements.define("root-navbar", RootNavbar);
customElements.define("type1-navbar", Type1Navbar);
