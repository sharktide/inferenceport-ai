(async function () {
    if (typeof window.ollama.isAvailable !== 'function')
        return;
    async function check() {
        const ok = window.ollama.isAvailable();
        const banner = document.getElementById('ollama-missing');
        const installedGrid = document.getElementById('installed-models');
        const availGrid = document.getElementById('available-models');
        const overlay = document.getElementById('overlay-blocker');
        if (!ok) {
            if (banner) {
                banner.style.display = 'block';
            }
            if (overlay) {
                overlay.style.display = 'block';
            }
            if (installedGrid) {
                installedGrid.style.display = "none";
            }
            if (availGrid) {
                availGrid.classList.add('disabled');
                availGrid.style.opacity = '0.5';
            }
        }
        else {
            if (banner) {
                banner.style.display = 'none';
            }
            if (overlay) {
                overlay.style.display = 'none';
            }
            if (installedGrid) {
                installedGrid.style.display = "grid";
            }
            if (availGrid) {
                availGrid.classList.remove('disabled');
                availGrid.style.opacity = '';
            }
        }
    }
    document.getElementById('ollama-retry')?.addEventListener('click', check);
    await check();
})();
export {};
//# sourceMappingURL=ollama-checker.js.map