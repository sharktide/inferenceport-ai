const DB_NAME = "StudioMediaDB";
const STORE_NAME = "history";
const DB_VERSION = 2;

export class MediaDB {
	db: IDBDatabase | null;
	constructor() {
		this.db = null;
	}

	async open() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => reject(request.error);
			request.onsuccess = (event: Event) => {
				if (event.target instanceof IDBRequest) {
					const requestResult = event.target
						.result as IDBDatabase | null;
					if (requestResult) {
						this.db = requestResult;
					} else {
						this.db = null;
					}
					resolve(this.db);
				}
			};

			request.onupgradeneeded = (event: Event) => {
            	if (event.target instanceof IDBRequest) {
                    this.db = event.target.result;
                    if (this.db && !this.db.objectStoreNames.contains(STORE_NAME)) {
                        const store = this.db.createObjectStore(STORE_NAME, {
                            keyPath: "id",
                            autoIncrement: true,
                        });
                        store.createIndex("createdAt", "createdAt", {
                            unique: false,
                        });
                        store.createIndex("type", "type", { unique: false });
                    }
                }
			};
		});
	}

    async add(item: any) {
        if (!this.db) return new Promise((resolve, reject) => reject(new Error("Database not initialized")));
        const tx = this.db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const now = new Date().toISOString();
        const record = item instanceof Object ? { ...item, createdAt: now } : null;
        await store.add(record);
		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve(tx);

			tx.onerror = () => {
				reject(tx.error);
			};

			tx.onabort = () => {
				reject(tx.error || new Error("Transaction aborted"));
			};
		});
    }

	async getAll() {
		return new Promise((resolve, reject) => {
            if (this.db === null) return;
			const tx = this.db.transaction(STORE_NAME, "readonly");
			const store = tx.objectStore(STORE_NAME);
			const request = store
				.index("createdAt")
				.openCursor(
					IDBKeyRange.upperBound(new Date().toISOString()),
					"prev",
				);

			const results: Array<any> = [];
			request.onsuccess = () => {
				const cursor = request.result;
				if (cursor) {
					results.push(cursor.value);
					cursor.continue();
				} else {
					resolve(results);
				}
			};
		});
	}

	async delete(id: string) {
        if (!this.db) return new Promise((resolve, reject) => reject(new Error("Database not initialized")));
		const tx = this.db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		await store.delete(id);
		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve(tx);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
		});
	}

	async clear() {
        if (!this.db) return new Promise((resolve, reject) => reject(new Error("Database not initialized")));
		const tx = this.db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		await store.clear();
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(tx);
            tx.onerror = () => reject(tx.error);
		    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
        });
	}
}
