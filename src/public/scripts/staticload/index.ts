import ThemeManager from "./Managers/ThemeManager.js";
import AuthManager from "./Managers/AuthManager.js";

import iModal from "./Utility/modal.js";

export interface iConstructor {
    iModal: typeof iModal;
}
export interface iInstance {
    iModal: iModal;
}
const ic: iConstructor = {
    iModal: iModal,
}

new ThemeManager();
new AuthManager();

(window as Window).ic = ic;