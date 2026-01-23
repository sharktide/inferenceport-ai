/*
Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
class ThemeManager {
    constructor() {
        if (ThemeManager.instance) {
            throw new Error("ThemeManager instance already exists. Use the existing one.");
        }
        ThemeManager.instance = this;
        try {
            const button = document.getElementById("theme-toggle");
            if (button) {
                button.addEventListener("click", () => this.toggleTheme());
            }
            this.applySavedTheme();
        }
        catch (e) {
            console.warn("ThemeManager init error", e);
        }
    }
    applySavedTheme() {
        const savedTheme = localStorage.getItem("theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = savedTheme || (prefersDark ? "dark" : "light");
        document.documentElement.setAttribute("data-theme", theme);
        this.updateToggleButton(theme);
    }
    toggleTheme() {
        const current = document.documentElement.getAttribute("data-theme");
        const newTheme = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        this.updateToggleButton(newTheme);
    }
    updateToggleButton(currentTheme) {
        const button = document.getElementById("theme-toggle");
        if (button) {
            button.textContent =
                currentTheme === "dark" ? "Toggle Light mode" : "Toggle Dark mode";
        }
    }
    static getInstance() {
        if (!ThemeManager.instance) {
            new ThemeManager();
        }
        return ThemeManager.instance;
    }
}
ThemeManager.instance = null;
export default ThemeManager;
//# sourceMappingURL=ThemeManager.js.map