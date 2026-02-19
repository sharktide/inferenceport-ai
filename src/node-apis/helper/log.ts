export function LOG(trace: string, label: string, ...args: any[]) {
	const time = new Date().toISOString();
	console.log(`[${time}] [${trace}] ${label}`, ...args);
}

export function LOG_ERR(trace: string, label: string, ...args: any[]) {
	const time = new Date().toISOString();
	console.error(`[${time}] [${trace}] ❌ ${label}`, ...args);
}