import { issueProxyToken } from "../auth.js";
import crypto from "crypto";
type ParsedModelfile = {
	from?: string;
	system: string;
	template: string;
	license: string[];
	parameters: Record<string, any>;
	messages: Array<{ role: string; content: string }>;
};
function stripWrappingQuotes(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1).trim();
	}
	return value;
}

function parseModelfileContent(content: string): ParsedModelfile {
	const lines = content.split(/\r?\n/);

	let from: string | undefined;
	let system = "";
	let template = "";
	let license: string[] = [];
	let parameters: Record<string, any> = {};
	let messages: Array<{ role: string; content: string }> = [];

	let currentBlock: "system" | "template" | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		if (/^SYSTEM\b/i.test(line)) {
			currentBlock = "system";
			system += rawLine.replace(/^SYSTEM\s*/i, "") + "\n";
			continue;
		}

		if (/^TEMPLATE\b/i.test(line)) {
			currentBlock = "template";
			template += rawLine.replace(/^TEMPLATE\s*/i, "") + "\n";
			continue;
		}

		if (/^FROM\b/i.test(line)) {
			const parsedFrom = line.replace(/^FROM\s+/i, "").trim();
			from = stripWrappingQuotes(parsedFrom);
			currentBlock = null;
			continue;
		}

		if (/^LICENSE\b/i.test(line)) {
			const l = line.replace(/^LICENSE\s+/i, "").trim();
			if (l) license.push(l);
			currentBlock = null;
			continue;
		}

		if (/^PARAMETER\b/i.test(line)) {
			const rest = line.replace(/^PARAMETER\s+/i, "");
			const [key, ...valueParts] = rest.split(" ");
			const value = valueParts.join(" ").trim();

			if (!key) continue;

			const parsed =
				!isNaN(Number(value)) && value !== "" ? Number(value) : value;

			parameters[key] = parsed;
			currentBlock = null;
			continue;
		}

		if (/^MESSAGE\b/i.test(line)) {
			const rest = line.replace(/^MESSAGE\s+/i, "");
			const firstSpace = rest.indexOf(" ");
			if (firstSpace === -1) continue;

			const role = rest.substring(0, firstSpace).trim();
			const content = rest.substring(firstSpace + 1).trim();

			messages.push({ role, content });
			currentBlock = null;
			continue;
		}

		if (currentBlock === "system") {
			system += rawLine + "\n";
		} else if (currentBlock === "template") {
			template += rawLine + "\n";
		}
	}

	return {
		system: system.trim(),
		template: template.trim(),
		license,
		parameters,
		messages,
		...(from !== undefined ? { from } : {}),
	};
}

function buildModelName(fileName: string, extensionPattern: RegExp): string {
	return fileName
		.replace(extensionPattern, "")
		.replace(/[^a-zA-Z0-9:_-]/g, "-")
		.toLowerCase();
}

function isGGUFReference(fromValue: string): boolean {
	return /\.gguf$/i.test(stripWrappingQuotes(fromValue).trim());
}

function createPayloadFromModelfile(
	modelName: string,
	parsed: ParsedModelfile,
) {
	if (!parsed.from) {
		throw new Error("Modelfile missing FROM directive");
	}

	const payload: any = {
		model: modelName,
		from: parsed.from,
		stream: false,
	};

	if (parsed.system) payload.system = parsed.system;
	if (parsed.template) payload.template = parsed.template;
	if (parsed.license.length) payload.license = parsed.license;
	if (Object.keys(parsed.parameters).length)
		payload.parameters = parsed.parameters;
	if (parsed.messages.length) payload.messages = parsed.messages;
	return payload;
}

async function ensureBlobUploaded(
	base: string,
	authHeaders: Record<string, string>,
	buffer: Buffer,
): Promise<string> {
	const hash = crypto.createHash("sha256").update(buffer).digest("hex");
	const digest = `sha256:${hash}`;

	const headRes = await fetch(`${base}/api/blobs/${digest}`, {
		method: "HEAD",
		headers: authHeaders,
	});

	if (headRes.status === 404) {
		const uploadRes = await fetch(`${base}/api/blobs/${digest}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/octet-stream",
				...authHeaders,
			},
			body: new Uint8Array(buffer),
		});

		if (!uploadRes.ok) {
			const text = await uploadRes.text();
			throw new Error(`Blob upload failed: ${uploadRes.status} ${text}`);
		}
	} else if (!headRes.ok && headRes.status !== 200) {
		throw new Error(`Blob check failed: ${headRes.status}`);
	}

	return digest;
}

export async function importGGUF(
	fileName: string,
	data: Uint8Array | null,
	isModelFile: boolean,
	clientUrl?: string,
): Promise<string> {
	if (!data) throw new Error("No file data provided");

	const base = clientUrl
		? clientUrl.replace(/\/+$/, "")
		: "http://localhost:11434";

	const authHeaders: Record<string, string> = clientUrl
		? { Authorization: `Bearer ${await issueProxyToken()}` }
		: {};

	const safeName = fileName
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.slice(0, 20)
		.concat("-gguf72");
	const buffer = Buffer.from(data);

	try {
		if (isModelFile) {
			const parsed = parseModelfileContent(buffer.toString("utf-8"));
			if (!parsed.from) {
				throw new Error("Modelfile missing FROM directive");
			}

			if (isGGUFReference(parsed.from)) {
				throw new Error(
					"Modelfile references a .gguf file. Import the Modelfile and GGUF together.",
				);
			}

			const modelName = buildModelName(safeName, /\.modelfile$/i);
			const payload = createPayloadFromModelfile(modelName, parsed);
			console.log(payload);
			const createRes = await fetch(`${base}/api/create`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...authHeaders,
				},
				body: JSON.stringify(payload),
			});

			if (!createRes.ok) {
				const text = await createRes.text();
				throw new Error(`Create failed: ${createRes.status} ${text}`);
			}

			return `Model '${modelName}' created from Modelfile`;
		}

		const digest = await ensureBlobUploaded(base, authHeaders, buffer);
		const modelName = buildModelName(safeName, /\.gguf$/i);
		console.log(modelName, digest);
		const createRes = await fetch(`${base}/api/create`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...authHeaders,
			},
			body: JSON.stringify({
				model: modelName,
				files: {
					[safeName]: digest,
				},
				stream: false,
			}),
		});

		if (!createRes.ok) {
			const text = await createRes.text();
			throw new Error(`GGUF create failed: ${createRes.status} ${text}`);
		}

		return `GGUF model '${modelName}' created successfully`;
	} catch (err) {
		throw err;
	}
}

export async function importGGUFMulti(
	modelfileData: Uint8Array | null,
	ggufName: string,
	ggufData: Uint8Array | null,
	clientUrl?: string,
): Promise<string> {
	if (!modelfileData) throw new Error("No Modelfile data provided");
	if (!ggufData) throw new Error("No GGUF data provided");

	const isRemote = !!clientUrl;

	const base = isRemote
		? clientUrl!.replace(/\/+$/, "")
		: "http://localhost:11434";

	const authHeaders: Record<string, string> = isRemote
		? { Authorization: `Bearer ${await issueProxyToken()}` }
		: {};

	const safeModelfileName = ggufName
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.slice(0, 20)
		.concat("-gguf72");

	const modelfileBuffer = Buffer.from(modelfileData);
	const ggufBuffer = Buffer.from(ggufData);

	const parsed = parseModelfileContent(modelfileBuffer.toString("utf-8"));

	if (!parsed.from) {
		throw new Error("Modelfile missing FROM directive");
	}

	if (!isGGUFReference(parsed.from)) {
		throw new Error("Provided Modelfile does not reference a .gguf file");
	}

	const digest = await ensureBlobUploaded(base, authHeaders, ggufBuffer);

	const modelName = buildModelName(
		safeModelfileName.concat("-gguf"),
		/\.gguf$/i,
	);

	console.log(modelName, digest);

	const payload = createPayloadFromModelfile(modelName, {
		...parsed,
	});

	payload.files = {
		[modelName]: digest,
	};

	delete payload.from;

	console.log(payload);

	const createRes = await fetch(`${base}/api/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...authHeaders,
		},
		body: JSON.stringify(payload),
	});

	if (!createRes.ok) {
		const text = await createRes.text();
		throw new Error(`Create failed: ${createRes.status} ${text}`);
	}

	return `Model '${modelName}' created from Modelfile + GGUF`;
}
