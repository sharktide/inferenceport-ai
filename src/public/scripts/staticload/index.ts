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
        showAppWideBanner("hi")
    } catch (e) {
        void 0
    }
}

function showAppWideBanner(message: string) {
    if (document.getElementById("app-notification-banner")) return;

    const banner = document.createElement("div");
    banner.id = "app-notification-banner";
    banner.textContent = message;

    Object.assign(banner.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        background: "#0d78cf",
        color: "var(--text-dark, #222)",
        padding: "14px 0",
        textAlign: "center",
        fontSize: "17px",
        zIndex: "2000",
        boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        letterSpacing: "0.01em",
        cursor: "pointer",
        transition: "opacity 0.3s ease, transform 0.3s ease",
        opacity: "0",
        transform: "translateY(-20px)"
    });

    banner.title = "Click to dismiss";

    document.body.style.transition = "padding-top 0.3s ease";

    banner.onclick = () => {
        banner.style.opacity = "0";
        banner.style.transform = "translateY(-20px)";
        document.body.style.paddingTop = "0";
    };

    document.body.prepend(banner);

    requestAnimationFrame(() => {
        banner.style.opacity = "1";
        banner.style.transform = "translateY(0)";
        document.body.style.paddingTop = "48px";
    });

    banner.addEventListener("transitionend", (e) => {
        if (e.propertyName === "opacity" && banner.style.opacity === "0") {
            banner.remove();
            document.body.style.paddingTop = "";
        }
    });
}

window.addEventListener("DOMContentLoaded", checkAndShowNotificationBanner);