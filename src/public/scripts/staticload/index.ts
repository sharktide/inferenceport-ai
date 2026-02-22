import ThemeManager from "./Managers/ThemeManager.js";
import AuthManager from "./Managers/AuthManager.js";

import iModal from "./Utility/classes/modal.js";

import { sanitizeFilename, saveImport } from "./Utility/functions/imports.js";

export interface iConstructor {
    iModal: typeof iModal;
}
export interface iInstance {
    iModal: iModal;
}
const ic: iConstructor = {
    iModal: iModal,
}

export interface iFunctions {
    sanitizeFilename: typeof sanitizeFilename;
    saveImport: typeof saveImport;
}
const ifc: iFunctions = {
    sanitizeFilename: sanitizeFilename,
    saveImport: saveImport,
}

new ThemeManager();
new AuthManager();


(window as Window).ic = ic;
(window as Window).ifc = ifc;

async function checkAndShowNotificationBanner() {
    try {
        const res = await fetch("https://sharktide-lightning.hf.space/status");
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data.notifications === "string" && data.notifications.trim() !== "") {
            showAppWideBanner(data.notifications);
        }
    } catch (e) {
        void 0
    }
}

function showAppWideBanner(message: string) {
    if (document.getElementById("app-notification-banner")) return;
    const banner = document.createElement("div");
    banner.id = "app-notification-banner";
    banner.textContent = message;
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.width = "100%";
    banner.style.background = "#0d78cf";
    banner.style.color = "var(--text-dark, #222)";
    banner.style.padding = "14px 0";
    banner.style.textAlign = "center";
    banner.style.fontSize = "17px";
    banner.style.zIndex = "2000";
    banner.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)";
    banner.style.letterSpacing = "0.01em";
    banner.style.cursor = "pointer";
    banner.title = "Click to dismiss";
    banner.onclick = () => banner.remove();
    document.body.prepend(banner);
    document.body.style.paddingTop = "48px";
    banner.addEventListener("transitionend", () => {
        if (!document.body.contains(banner)) {
            document.body.style.paddingTop = "";
        }
    });
}

window.addEventListener("DOMContentLoaded", checkAndShowNotificationBanner);