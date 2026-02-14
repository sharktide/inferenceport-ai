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