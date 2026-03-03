const CACHE_NAME = "inferenceport-webui-v1";
const PRECACHE_URLS = [
	"/",
	"/index.html",
	"/auth.html",
	"/installed.html",
	"/marketplace.html",
	"/settings.html",
	"/renderer/chat.html",
	"/renderer/spaces.html",
	"/styles/styles.css",
	"/styles/base.css",
	"/scripts/staticload/index.js",
	"/scripts/renderer/chat.js",
	"/scripts/renderer/spaces.js",
	"/scripts/marketplace.js",
	"/scripts/settings.js",
	"/scripts/authrender.js",
	"/scripts/installed.js",
	"/Components.js",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			await cache.addAll(PRECACHE_URLS);
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME)
					.map((key) => caches.delete(key)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === "navigate") {
		event.respondWith(
			(async () => {
				try {
					const networkResponse = await fetch(request);
					const cache = await caches.open(CACHE_NAME);
					cache.put(request, networkResponse.clone()).catch(() => void 0);
					return networkResponse;
				} catch {
					const cache = await caches.open(CACHE_NAME);
					return (
						(await cache.match(request)) ||
						(await cache.match("/renderer/chat.html")) ||
						(await cache.match("/index.html"))
					);
				}
			})(),
		);
		return;
	}

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			const cached = await cache.match(request);
			if (cached) return cached;

			try {
				const networkResponse = await fetch(request);
				cache.put(request, networkResponse.clone()).catch(() => void 0);
				return networkResponse;
			} catch {
				return new Response("", { status: 504 });
			}
		})(),
	);
});
