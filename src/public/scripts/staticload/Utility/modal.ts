export interface ModalAction {
    id: string;
    label: string;
    onClick: () => void;
}

export interface ModalOptions {
    title?: string;
    text?: string;
    html?: string;
    inputs?: { id: string; type: string; placeholder?: string }[];
    actions?: ModalAction[];
    lockContent?: boolean; // NEW: if true, modal content cannot be changed later
}

export default class iModal {
    protected modal: HTMLElement;
    protected content: HTMLElement;
    private locked: boolean = false;

    constructor(id: string, width?: number, options?: ModalOptions, lockContent: boolean = false) {
        if (width && typeof width !== "number") {
            throw new TypeError("width must be a number");
        }
        let existing = document.getElementById(id);
        const isNew = !existing;

        if (!existing) {
            existing = document.createElement("div");
            existing.id = id;
            existing.className = "modal hidden";
            existing.innerHTML = `
            <div class="modal-content" ${width ? `style="width: ${width}px"` : ""}>
                <span class="close-btn">&times;</span>
                <div class="modal-body"></div>
                <div class="modal-actions"></div>
            </div>
        `;
            document.body.appendChild(existing);
        }

        this.modal = existing;
        this.content = this.modal.querySelector(".modal-content")!;

        if (isNew) {
            const closeBtn = this.content.querySelector(".close-btn");
            closeBtn?.addEventListener("click", () => this.close());

            this.modal.addEventListener("click", (e) => {
                if (e.target === this.modal) this.close();
            });
        }

        if (options) {
            this.render(options);
            if (options.lockContent) {
                this.locked = true;
            }
        }
    }

    public open(options?: ModalOptions) {
        if (options && !this.locked) {
            this.render(options);
            if (options.lockContent) {
                this.locked = true;
            }
        }
        requestAnimationFrame(() => this.modal.classList.remove("hidden"));
    }

    public close() {
        this.modal.classList.add("hidden");
    }

    protected render(options: ModalOptions) {
        const body = this.content.querySelector(".modal-body")!;
        const actionsContainer = this.content.querySelector(".modal-actions")!;

        if (options.html) {
            body.innerHTML = options.html;
            actionsContainer.innerHTML = "";
            return;
        }

        body.innerHTML = "";
        if (options.title) {
            const h3 = document.createElement("h3");
            h3.textContent = options.title;
            body.appendChild(h3);
        }
        if (options.text) {
            const p = document.createElement("p");
            p.textContent = options.text;
            body.appendChild(p);
        }
        if (options.inputs) {
            options.inputs.forEach((input) => {
                const el = document.createElement("input");
                el.id = input.id;
                el.type = input.type;
                if (input.placeholder) el.placeholder = input.placeholder;
                body.appendChild(el);
            });
        }

        actionsContainer.innerHTML = "";
        if (options.actions) {
            options.actions.forEach((action) => {
                const btn = document.createElement("button");
                btn.id = action.id;
                btn.textContent = action.label;
                btn.addEventListener("click", action.onClick);
                actionsContainer.appendChild(btn);
            });
        }
    }
}
