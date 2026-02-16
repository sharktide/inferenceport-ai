class ToggleSwitch extends HTMLElement {
    static formAssociated = true;

    private _internals: ElementInternals;
    private input!: HTMLInputElement;

    constructor() {
        super();
        this._internals = this.attachInternals();
    }

    connectedCallback(): void {
        // Render only once
        if (!this.input) {
            this.innerHTML = `
                <label class="switch">
                    <input type="checkbox">
                    <span class="slider"></span>
                </label>
            `;

            const inputEl = this.querySelector("input");
            if (!(inputEl instanceof HTMLInputElement)) {
                throw new Error("Input element not found");
            }

            this.input = inputEl;

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

    attributeChangedCallback(
        _name: string,
        _oldVal: string | null,
        _newVal: string | null
    ): void {
        if (this.input) {
            this._syncToAttributes();
        }
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

    private _upgradeProperty(
        prop: "checked" | "disabled" | "name" | "value"
    ): void {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    // --- Properties ---
    get checked(): boolean {
        return this.input?.checked ?? false;
    }
    set checked(val: boolean) {
        const isChecked = Boolean(val);
        if (this.input) this.input.checked = isChecked;
        this._reflect("checked", isChecked);
    }

    get disabled(): boolean {
        return this.input?.disabled ?? false;
    }
    set disabled(val: boolean) {
        const isDisabled = Boolean(val);
        if (this.input) this.input.disabled = isDisabled;
        this._reflect("disabled", isDisabled);
    }

    get name(): string {
        return this.input?.name ?? "";
    }
    set name(val: string) {
        if (this.input) this.input.name = val;
        this.setAttribute("name", val);
    }

    get value(): string {
        return this.input?.value ?? "on";
    }
    set value(val: string) {
        if (this.input) this.input.value = val;
        this.setAttribute("value", val);
    }

    get indeterminate(): boolean {
        return this.input?.indeterminate ?? false;
    }
    set indeterminate(val: boolean) {
        if (this.input) this.input.indeterminate = Boolean(val);
    }

    private _reflect(attr: string, condition: boolean): void {
        if (condition) this.setAttribute(attr, "");
        else this.removeAttribute(attr);
    }
}

customElements.define("toggle-switch", ToggleSwitch);
