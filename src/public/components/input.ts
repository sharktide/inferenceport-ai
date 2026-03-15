class ToggleSwitch extends HTMLElement {
    static formAssociated = true;

    private _internals: ElementInternals;
    private input!: HTMLInputElement;
    private initialized = false;

    constructor() {
        super();
        this._internals = this.attachInternals();
    }

    connectedCallback(): void {
        if (!this.initialized) {
            this.initialized = true;

            const userContent = Array.from(this.childNodes);

            this.textContent = "";

            const label = document.createElement("label");
            label.className = "switch";
            label.style.marginRight = "10px";
            const input = document.createElement("input");
            input.type = "checkbox";

            const slider = document.createElement("span");
            slider.className = "slider";

            label.appendChild(input);
            label.appendChild(slider);

            const slot = document.createElement("slot");
            this.appendChild(label);
            this.appendChild(slot);

            userContent.forEach(node => slot.appendChild(node));

            this.input = input;

            this._upgradeProperty("checked");
            this._upgradeProperty("disabled");
            this._upgradeProperty("name");
            this._upgradeProperty("value");

            this.input.addEventListener("change", () => {
                this._internals.setFormValue(this.checked ? this.value : null);
                this.dispatchEvent(new Event("change", { bubbles: true }));
            });

            this.input.addEventListener("input", () => {
                this.dispatchEvent(new Event("input", { bubbles: true }));
            });
        }

        this._syncToAttributes();
    }

    static get observedAttributes(): string[] {
        return ["checked", "disabled", "name", "value"];
    }

    attributeChangedCallback(): void {
        if (this.input) this._syncToAttributes();
    }

    private _syncToAttributes(): void {
        this.input.checked = this.hasAttribute("checked");
        this.input.disabled = this.hasAttribute("disabled");

        const nameAttr = this.getAttribute("name");
        const valueAttr = this.getAttribute("value");

        if (nameAttr !== null) this.input.name = nameAttr;
        if (valueAttr !== null) this.input.value = valueAttr;

        this._internals.setFormValue(this.checked ? this.value : null);
    }

    private _upgradeProperty(prop: "checked" | "disabled" | "name" | "value") {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get checked() { return this.input?.checked ?? false; }
    set checked(val: boolean) {
        const isChecked = Boolean(val);
        if (this.input) this.input.checked = isChecked;
        this._reflect("checked", isChecked);
    }

    get disabled() { return this.input?.disabled ?? false; }
    set disabled(val: boolean) {
        const isDisabled = Boolean(val);
        if (this.input) this.input.disabled = isDisabled;
        this._reflect("disabled", isDisabled);
    }

    get name() { return this.input?.name ?? ""; }
    set name(val: string) {
        if (this.input) this.input.name = val;
        this.setAttribute("name", val);
    }

    get value() { return this.input?.value ?? "on"; }
    set value(val: string) {
        if (this.input) this.input.value = val;
        this.setAttribute("value", val);
    }

    get indeterminate() { return this.input?.indeterminate ?? false; }
    set indeterminate(val: boolean) {
        if (this.input) this.input.indeterminate = Boolean(val);
    }

    private _reflect(attr: string, condition: boolean) {
        if (condition) this.setAttribute(attr, "");
        else this.removeAttribute(attr);
    }
}

customElements.define("toggle-switch", ToggleSwitch);
