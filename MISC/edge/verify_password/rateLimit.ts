// rateLimit.ts
const requests: Record<string, { count: number; last: number }> = {};
const WINDOW = 60_000;
const LIMIT = 5;

export function rateLimit(ip: string): boolean {
	const now = Date.now();
	const entry = requests[ip] || { count: 0, last: now };

	if (now - entry.last > WINDOW) {
		entry.count = 1;
		entry.last = now;
	} else {
		entry.count++;
	}

	requests[ip] = entry;
	return entry.count <= LIMIT;
}
