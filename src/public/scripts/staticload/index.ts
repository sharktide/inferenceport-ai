import ThemeManager from "./Managers/ThemeManager.js";
import AuthManager from "./Managers/AuthManager.js";

import iModal from "./Utility/modal.js";

export interface IC {
    iModal: typeof iModal;
}
const ic: IC = {
    iModal: iModal,
}

new ThemeManager();
new AuthManager();

(window as Window).ic = ic;