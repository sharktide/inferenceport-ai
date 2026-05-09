import { app } from "electron";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { getSession } from "../auth.js";
import type { ToolDefinition } from "../types/index.types.d.ts";
import { getLightningClientId } from "./lightningClient.js";

export type CustomToolLanguage =
	| "javascript"
	| "python"
	| "cpp"
	| "c"
	| "rust"
	| "java";

export type CustomToolVisibility = "private" | "public" | "unlisted";

export type CustomToolParameterSchema = {
	type: "object";
	properties: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
};

export type CustomToolManifest = {
	id: string;
	name: string;
	functionality: string;
	language: CustomToolLanguage;
	codeFile: string;
	authorEmail: string;
	authorUserId?: string | null;
	openai: {
		functionName: string;
		description: string;
		parameters: CustomToolParameterSchema;
	};
	requirements: {
		runtime: string[];
		build: string[];
	};
	visibility: CustomToolVisibility;
	published: boolean;
	createdAt: string;
	updatedAt: string;
	registry?: {
		source: "lightning";
		uploadedAt?: string;
		updatedAt?: string;
	};
};

export type CustomToolCreateInput = {
	name: string;
	functionality: string;
	language: CustomToolLanguage;
	codeFileName: string;
	codeContent: string;
	openai?: {
		functionName?: string;
		description?: string;
		parameters?: unknown;
	};
	visibility?: CustomToolVisibility;
	publishToRegistry?: boolean;
};

export type CustomToolUpdateInput = {
	id: string;
	name?: string;
	functionality?: string;
	language?: CustomToolLanguage;
	codeFileName?: string;
	codeContent?: string;
	openai?: {
		functionName?: string;
		description?: string;
		parameters?: unknown;
	};
	visibility?: CustomToolVisibility;
};

export type CustomToolRegistryRecord = {
	id: string;
	name: string;
	functionality: string;
	language: CustomToolLanguage;
	authorEmail: string;
	visibility: "public" | "unlisted";
	publishedAt: string;
	updatedAt: string;
	requirements: {
		runtime: string[];
		build: string[];
	};
	openai: {
		functionName: string;
		description: string;
		parameters: CustomToolParameterSchema;
	};
	files: {
		manifestPath: string;
		codePath: string;
	};
};

export type CustomToolWithSource = {
	manifest: CustomToolManifest;
	code: string;
};

const LIGHTNING_BASE_URL = "https://sharktide-lightning.hf.space";

const LANGUAGE_TO_EXT: Record<CustomToolLanguage, string> = {
	javascript: ".js",
	python: ".py",
	cpp: ".cpp",
	c: ".c",
	rust: ".rs",
	java: ".java",
};

const LANGUAGE_REQUIREMENTS: Record<
	CustomToolLanguage,
	{ runtime: string[]; build: string[] }
> = {
	javascript: { runtime: ["node"], build: [] },
	python: { runtime: ["python3"], build: [] },
	cpp: { runtime: ["clang++", "g++"], build: ["clang++", "g++"] },
	c: { runtime: ["gcc", "clang"], build: ["gcc", "clang"] },
	rust: { runtime: ["rustc"], build: ["rustc"] },
	java: { runtime: ["java"], build: [] },
};

const RESERVED_FUNCTION_NAMES = new Set([
	"duckduckgo_search",
	"ollama_search",
	"read_web_page",
	"generate_image",
	"generate_audio",
	"generate_video",
]);

function getCustomToolsRoot(): string {
	return path.join(app.getPath("userData"), "custom-tools");
}

function sanitizeFunctionName(value: string): string {
	const cleaned = value.trim().replace(/[^a-zA-Z0-9_]/g, "_");
	const collapsed = cleaned.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
	const base = collapsed.length ? collapsed : "custom_tool";
	return base.slice(0, 64);
}

function sanitizeFileName(value: string): string {
	const base = path.basename(value || "tool");
	return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
	return UUID_REGEX.test(value.trim());
}

function normalizeToolId(value: string): string | null {
	if (!value || typeof value !== "string") return null;
	const trimmed = value.trim();
	return isUuid(trimmed) ? trimmed : null;
}

function generateToolId(_name?: string): string {
	const maybeRandom = (crypto as unknown as { randomUUID?: () => string }).randomUUID;
	if (typeof maybeRandom === "function") return maybeRandom();
	// Fallback (older Node) — RFC 4122 v4 from random bytes.
	const bytes = crypto.randomBytes(16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x40;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return (
		`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
		`${hex.slice(16, 20)}-${hex.slice(20)}`
	);
}

function ensureDirSync(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

function normalizeParametersSchema(value: unknown): CustomToolParameterSchema {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: true,
		};
	}
	const asRecord = value as Record<string, unknown>;
	const properties =
		asRecord.properties && typeof asRecord.properties === "object" && !Array.isArray(asRecord.properties)
			? (asRecord.properties as Record<string, unknown>)
			: {};
	const required = Array.isArray(asRecord.required)
		? asRecord.required
				.filter((entry): entry is string => typeof entry === "string")
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
		: [];
	const additionalProperties =
		typeof asRecord.additionalProperties === "boolean"
			? asRecord.additionalProperties
			: true;
	return {
		type: "object",
		properties,
		required,
		additionalProperties,
	};
}

function readJsonFile<T>(filePath: string): T {
	const raw = fs.readFileSync(filePath, "utf-8");
	return JSON.parse(raw) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function manifestPathFor(toolId: string): string {
	return path.join(getCustomToolsRoot(), toolId, "manifest.json");
}

function codePathFor(toolId: string, codeFile: string): string {
	return path.join(getCustomToolsRoot(), toolId, path.basename(codeFile));
}

function getLanguageFromFileName(fileName: string): CustomToolLanguage | null {
	const lower = fileName.toLowerCase();
	if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
		return "javascript";
	}
	if (lower.endsWith(".py")) return "python";
	if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx")) return "cpp";
	if (lower.endsWith(".c")) return "c";
	if (lower.endsWith(".rs")) return "rust";
	if (lower.endsWith(".java")) return "java";
	return null;
}

function listToolIds(): string[] {
	const root = getCustomToolsRoot();
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => isUuid(name));
}

export function listLocalCustomTools(): CustomToolManifest[] {
	const manifests: CustomToolManifest[] = [];
	for (const toolId of listToolIds()) {
		const manifestPath = manifestPathFor(toolId);
		if (!fs.existsSync(manifestPath)) continue;
		try {
			manifests.push(readJsonFile<CustomToolManifest>(manifestPath));
		} catch {
			continue;
		}
	}
	manifests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return manifests;
}

export function getLocalCustomToolById(toolId: string): CustomToolManifest | null {
	const normalizedToolId = normalizeToolId(toolId);
	if (!normalizedToolId) return null;
	const manifestPath = manifestPathFor(normalizedToolId);
	if (!fs.existsSync(manifestPath)) return null;
	try {
		return readJsonFile<CustomToolManifest>(manifestPath);
	} catch {
		return null;
	}
}

export function getLocalCustomToolSourceById(toolId: string): CustomToolWithSource | null {
	const manifest = getLocalCustomToolById(toolId);
	if (!manifest) return null;
	const codePath = codePathFor(manifest.id, manifest.codeFile);
	if (!fs.existsSync(codePath)) return null;
	try {
		const code = fs.readFileSync(codePath, "utf-8");
		return { manifest, code };
	} catch {
		return null;
	}
}

export function toToolDefinition(manifest: CustomToolManifest): ToolDefinition {
	return {
		type: "function",
		function: {
			name: manifest.openai.functionName,
			description: manifest.openai.description,
			parameters: manifest.openai.parameters,
		},
	};
}

export function getCustomToolByFunctionName(functionName: string): CustomToolManifest | null {
	const normalized = functionName.trim();
	if (!normalized) return null;
	for (const manifest of listLocalCustomTools()) {
		if (manifest.openai.functionName === normalized) return manifest;
	}
	return null;
}

async function getLightningAuthHeaders(): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json",
	};
	try {
		headers["X-Client-ID"] = await getLightningClientId();
	} catch {
		void 0;
	}
	try {
		const session = await getSession();
		if (session?.access_token) {
			headers.Authorization = `Bearer ${session.access_token}`;
		}
	} catch {
		void 0;
	}
	return headers;
}

export async function publishCustomToolToRegistry(
	manifest: CustomToolManifest,
): Promise<{ ok: true; record: CustomToolRegistryRecord } | { ok: false; error: string }> {
	try {
		const codePath = codePathFor(manifest.id, manifest.codeFile);
		const code = fs.readFileSync(codePath, "utf-8");
		const headers = await getLightningAuthHeaders();
		if (!headers.Authorization) {
			return { ok: false, error: "You must sign in to publish tools." };
		}

		const response = await fetch(`${LIGHTNING_BASE_URL}/tool-registry/tools`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				manifest,
				code,
			}),
		});

		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			tool?: CustomToolRegistryRecord;
		};
		if (!response.ok || !payload.tool) {
			return {
				ok: false,
				error: payload.error || `Publish failed (${response.status})`,
			};
		}
		return { ok: true, record: payload.tool };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function fetchRegistryCustomTools(): Promise<CustomToolRegistryRecord[]> {
	try {
		const response = await fetch(`${LIGHTNING_BASE_URL}/tool-registry/tools`);
		if (!response.ok) return [];
		const payload = (await response.json()) as {
			tools?: CustomToolRegistryRecord[];
		};
		return Array.isArray(payload.tools) ? payload.tools : [];
	} catch {
		return [];
	}
}

export async function fetchRegistryCustomToolById(
	toolId: string,
): Promise<CustomToolRegistryRecord | null> {
	const normalizedToolId = normalizeToolId(toolId);
	if (!normalizedToolId) return null;
	try {
		const response = await fetch(
			`${LIGHTNING_BASE_URL}/tool-registry/tools/${encodeURIComponent(normalizedToolId)}`,
		);
		if (!response.ok) return null;
		const payload = (await response.json()) as {
			tool?: CustomToolRegistryRecord;
		};
		return payload.tool || null;
	} catch {
		return null;
	}
}

export async function importCustomToolFromRegistry(
	toolId: string,
): Promise<{ ok: true; manifest: CustomToolManifest } | { ok: false; error: string }> {
	const normalizedToolId = normalizeToolId(toolId);
	if (!normalizedToolId) {
		return { ok: false, error: "Tool id must be a UUID." };
	}
	try {
		const response = await fetch(
			`${LIGHTNING_BASE_URL}/tool-registry/tools/${encodeURIComponent(normalizedToolId)}/source`,
		);
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			manifest?: CustomToolManifest;
			code?: string;
		};
		if (!response.ok || !payload.manifest || typeof payload.code !== "string") {
			return {
				ok: false,
				error: payload.error || `Failed to import tool (${response.status})`,
			};
		}

		const manifest = payload.manifest;
		if (!isUuid(manifest.id) || manifest.id !== normalizedToolId) {
			return { ok: false, error: "Registry tool id must be a UUID." };
		}
		manifest.codeFile = sanitizeFileName(path.basename(manifest.codeFile));
		const toolDir = path.join(getCustomToolsRoot(), manifest.id);
		ensureDirSync(toolDir);
		const codePath = path.join(toolDir, manifest.codeFile);
		const manifestPath = path.join(toolDir, "manifest.json");
		fs.writeFileSync(codePath, payload.code, "utf-8");
		writeJsonFile(manifestPath, {
			...manifest,
			published: true,
			updatedAt: new Date().toISOString(),
			registry: {
				source: "lightning",
				uploadedAt: manifest.registry?.uploadedAt || new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		});
		const saved = readJsonFile<CustomToolManifest>(manifestPath);
		return { ok: true, manifest: saved };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function createCustomTool(
	input: CustomToolCreateInput,
): Promise<{ ok: true; manifest: CustomToolManifest } | { ok: false; error: string }> {
	const name = input.name?.trim();
	const functionality = input.functionality?.trim();
	const language = input.language;
	const codeContent = typeof input.codeContent === "string" ? input.codeContent : "";

	if (!name) return { ok: false, error: "Tool name is required." };
	if (!functionality) return { ok: false, error: "Functionality is required." };
	if (!codeContent.trim()) return { ok: false, error: "Tool source code is required." };
	if (!(language in LANGUAGE_TO_EXT)) return { ok: false, error: "Unsupported language." };

	const session = await getSession().catch(() => null);
	const authorEmail = session?.user?.email || "local@inferenceport.ai";
	const authorUserId = session?.user?.id || null;

	const requestedVisibility = input.visibility || "private";
	let visibility: CustomToolVisibility =
		requestedVisibility === "public" || requestedVisibility === "unlisted"
			? requestedVisibility
			: "private";
	if (input.publishToRegistry && visibility === "private") {
		visibility = "unlisted";
	}

	const defaultExt = LANGUAGE_TO_EXT[language];
	const providedName = sanitizeFileName(input.codeFileName || `tool${defaultExt}`);
	const providedExt = path.extname(providedName).toLowerCase();
	const expectedLanguage = getLanguageFromFileName(providedName);
	if (expectedLanguage && expectedLanguage !== language) {
		return {
			ok: false,
			error: `Uploaded file extension does not match ${language}.`,
		};
	}
	const codeFile = providedExt ? providedName : `${providedName}${defaultExt}`;

	const toolId = generateToolId(name);
	const functionName = sanitizeFunctionName(
		input.openai?.functionName?.trim() || `custom_${toolId.replace(/-/g, "_")}`,
	);
	if (RESERVED_FUNCTION_NAMES.has(functionName)) {
		return {
			ok: false,
			error: `Function name '${functionName}' is reserved. Use another function name.`,
		};
	}
	for (const existing of listLocalCustomTools()) {
		if (existing.openai.functionName === functionName) {
			return {
				ok: false,
				error: `Function name '${functionName}' is already used by another custom tool.`,
			};
		}
	}
	const now = new Date().toISOString();
	const parameters = normalizeParametersSchema(input.openai?.parameters);

	const manifest: CustomToolManifest = {
		id: toolId,
		name,
		functionality,
		language,
		codeFile,
		authorEmail,
		authorUserId,
		openai: {
			functionName,
			description: (input.openai?.description || functionality).trim(),
			parameters,
		},
		requirements: {
			runtime: [...LANGUAGE_REQUIREMENTS[language].runtime],
			build: [...LANGUAGE_REQUIREMENTS[language].build],
		},
		visibility,
		published: false,
		createdAt: now,
		updatedAt: now,
	};

	if (input.publishToRegistry && !session?.access_token) {
		return {
			ok: false,
			error: "Sign in is required to publish tools to the registry.",
		};
	}

	const toolDir = path.join(getCustomToolsRoot(), toolId);
	ensureDirSync(toolDir);
	fs.writeFileSync(path.join(toolDir, codeFile), codeContent, "utf-8");
	writeJsonFile(path.join(toolDir, "manifest.json"), manifest);

	if (input.publishToRegistry) {
		const published = await publishCustomToolToRegistry(manifest);
		if (!published.ok) {
			return published;
		}
		manifest.published = true;
		manifest.registry = {
			source: "lightning",
			uploadedAt: now,
			updatedAt: now,
		};
		manifest.updatedAt = new Date().toISOString();
		writeJsonFile(path.join(toolDir, "manifest.json"), manifest);
	}

	return { ok: true, manifest };
}

export async function updateCustomTool(
	input: CustomToolUpdateInput,
): Promise<{ ok: true; manifest: CustomToolManifest } | { ok: false; error: string }> {
	const toolId = normalizeToolId(input.id);
	if (!toolId) return { ok: false, error: "Tool id must be a UUID." };

	const existing = getLocalCustomToolById(toolId);
	if (!existing) return { ok: false, error: "Tool not found." };

	const name = typeof input.name === "string" ? input.name.trim() : existing.name;
	const functionality =
		typeof input.functionality === "string"
			? input.functionality.trim()
			: existing.functionality;
	const language = input.language || existing.language;
	if (!name) return { ok: false, error: "Tool name is required." };
	if (!functionality) return { ok: false, error: "Functionality is required." };
	if (!(language in LANGUAGE_TO_EXT)) return { ok: false, error: "Unsupported language." };

	const requestedFunctionName =
		typeof input.openai?.functionName === "string" && input.openai.functionName.trim()
			? input.openai.functionName.trim()
			: existing.openai.functionName;
	const functionName = sanitizeFunctionName(requestedFunctionName);
	if (RESERVED_FUNCTION_NAMES.has(functionName)) {
		return {
			ok: false,
			error: `Function name '${functionName}' is reserved. Use another function name.`,
		};
	}
	for (const other of listLocalCustomTools()) {
		if (other.id !== toolId && other.openai.functionName === functionName) {
			return {
				ok: false,
				error: `Function name '${functionName}' is already used by another custom tool.`,
			};
		}
	}

	const visibility = input.visibility || existing.visibility;
	const codeWasProvided = typeof input.codeContent === "string";
	const defaultExt = LANGUAGE_TO_EXT[language];
	const rawCodeFile =
		typeof input.codeFileName === "string" && input.codeFileName.trim()
			? input.codeFileName
			: existing.codeFile;
	const providedName = sanitizeFileName(rawCodeFile || `tool${defaultExt}`);
	const providedExt = path.extname(providedName).toLowerCase();
	const expectedLanguage = getLanguageFromFileName(providedName);
	if (expectedLanguage && expectedLanguage !== language) {
		return {
			ok: false,
			error: `Code file extension does not match ${language}.`,
		};
	}
	const codeFile = providedExt ? providedName : `${providedName}${defaultExt}`;
	const toolDir = path.join(getCustomToolsRoot(), toolId);
	ensureDirSync(toolDir);

	if (codeWasProvided) {
		if (!input.codeContent!.trim()) {
			return { ok: false, error: "Tool source code is required." };
		}
		if (codeFile !== existing.codeFile) {
			const oldPath = codePathFor(toolId, existing.codeFile);
			if (fs.existsSync(oldPath)) {
				fs.rmSync(oldPath, { force: true });
			}
		}
		fs.writeFileSync(path.join(toolDir, codeFile), input.codeContent!, "utf-8");
	}

	const parameters =
		typeof input.openai?.parameters === "undefined"
			? existing.openai.parameters
			: normalizeParametersSchema(input.openai.parameters);
	const now = new Date().toISOString();
	const manifest: CustomToolManifest = {
		...existing,
		name,
		functionality,
		language,
		codeFile,
		openai: {
			functionName,
			description:
				(typeof input.openai?.description === "string" &&
				input.openai.description.trim()
					? input.openai.description.trim()
					: functionality),
			parameters,
		},
		requirements: {
			runtime: [...LANGUAGE_REQUIREMENTS[language].runtime],
			build: [...LANGUAGE_REQUIREMENTS[language].build],
		},
		visibility,
		updatedAt: now,
	};
	writeJsonFile(path.join(toolDir, "manifest.json"), manifest);
	return { ok: true, manifest };
}

export async function publishExistingCustomTool(
	toolId: string,
): Promise<{ ok: true; manifest: CustomToolManifest; record: CustomToolRegistryRecord } | { ok: false; error: string }> {
	const normalizedToolId = normalizeToolId(toolId);
	if (!normalizedToolId) return { ok: false, error: "Tool id must be a UUID." };
	const manifest = getLocalCustomToolById(normalizedToolId);
	if (!manifest) return { ok: false, error: "Tool not found." };
	if (manifest.visibility === "private") {
		manifest.visibility = "unlisted";
	}
	const published = await publishCustomToolToRegistry(manifest);
	if (!published.ok) return published;
	const now = new Date().toISOString();
	const nextManifest: CustomToolManifest = {
		...manifest,
		published: true,
		updatedAt: now,
		registry: {
			source: "lightning",
			uploadedAt: manifest.registry?.uploadedAt || now,
			updatedAt: now,
		},
	};
	writeJsonFile(manifestPathFor(normalizedToolId), nextManifest);
	return { ok: true, manifest: nextManifest, record: published.record };
}

export function deleteLocalCustomTool(
	toolId: string,
): { ok: true } | { ok: false; error: string } {
	const normalizedToolId = normalizeToolId(toolId);
	if (!normalizedToolId) {
		return { ok: false, error: "Tool id must be a UUID." };
	}
	const dir = path.join(getCustomToolsRoot(), normalizedToolId);
	if (!fs.existsSync(dir)) return { ok: true };
	try {
		fs.rmSync(dir, { recursive: true, force: true });
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function deleteRegistryCustomTool(
	toolId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const normalizedToolId = normalizeToolId(toolId);
	if (!normalizedToolId) {
		return { ok: false, error: "Tool id must be a UUID." };
	}
	try {
		const headers = await getLightningAuthHeaders();
		if (!headers.Authorization) {
			return { ok: false, error: "You must sign in to delete registry tools." };
		}
		const response = await fetch(
			`${LIGHTNING_BASE_URL}/tool-registry/tools/${encodeURIComponent(normalizedToolId)}`,
			{
				method: "DELETE",
				headers,
			},
		);
		if (!response.ok) {
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
			};
			return {
				ok: false,
				error: payload.error || `Failed to delete (${response.status})`,
			};
		}
		const local = getLocalCustomToolById(normalizedToolId);
		if (local) {
			writeJsonFile(manifestPathFor(normalizedToolId), {
				...local,
				published: false,
				registry: undefined,
				updatedAt: new Date().toISOString(),
			});
		}
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

function fileExists(filePath: string): boolean {
	try {
		return fs.existsSync(filePath);
	} catch {
		return false;
	}
}

function appendCliArgs(args: Record<string, unknown>): string[] {
	const argv: string[] = [];
	for (const [key, value] of Object.entries(args)) {
		const normalizedKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
		if (!normalizedKey) continue;
		argv.push(`--${normalizedKey}`);
		if (Array.isArray(value) || (value && typeof value === "object")) {
			argv.push(JSON.stringify(value));
		} else if (typeof value === "undefined") {
			argv.push("");
		} else {
			argv.push(String(value));
		}
	}
	return argv;
}

function createExecutionTempDir(toolId: string): string {
	const base = path.join(getCustomToolsRoot(), toolId, ".build");
	ensureDirSync(base);
	const dir = path.join(base, `run-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`);
	ensureDirSync(dir);
	return dir;
}

function runCommand(
	command: string,
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			shell: false,
			windowsHide: true,
			env: { ...process.env },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (err) => reject(err));
		child.on("close", (code) => resolve({ stdout, stderr, code }));
	});
}

export async function executeCustomTool(
	manifest: CustomToolManifest,
	args: Record<string, unknown>,
): Promise<string> {
	const toolDir = path.join(getCustomToolsRoot(), manifest.id);
	const sourcePath = path.join(toolDir, manifest.codeFile);
	if (!fileExists(sourcePath)) {
		throw new Error(`Missing tool source file: ${manifest.codeFile}`);
	}

	const cliArgs = appendCliArgs(args);
	const tempDir = createExecutionTempDir(manifest.id);

	if (manifest.language === "javascript") {
		const result = await runCommand("node", [sourcePath, ...cliArgs], toolDir);
		if (result.code !== 0) {
			throw new Error(result.stderr.trim() || `Tool exited with code ${String(result.code)}`);
		}
		return result.stdout;
	}

	if (manifest.language === "python") {
		const cmd = process.platform === "win32" ? "python" : "python3";
		const result = await runCommand(cmd, [sourcePath, ...cliArgs], toolDir);
		if (result.code !== 0) {
			throw new Error(result.stderr.trim() || `Tool exited with code ${String(result.code)}`);
		}
		return result.stdout;
	}

	if (manifest.language === "java") {
		const result = await runCommand("java", [sourcePath, ...cliArgs], toolDir);
		if (result.code !== 0) {
			throw new Error(result.stderr.trim() || `Tool exited with code ${String(result.code)}`);
		}
		return result.stdout;
	}

	if (manifest.language === "c" || manifest.language === "cpp" || manifest.language === "rust") {
		const ext = process.platform === "win32" ? ".exe" : "";
		const binaryPath = path.join(tempDir, `tool-bin${ext}`);
		let compileCommand = "";
		let compileArgs: string[] = [];

		if (manifest.language === "c") {
			compileCommand = "gcc";
			compileArgs = [sourcePath, "-O2", "-o", binaryPath];
		}
		if (manifest.language === "cpp") {
			compileCommand = "clang++";
			compileArgs = [sourcePath, "-O2", "-std=c++17", "-o", binaryPath];
		}
		if (manifest.language === "rust") {
			compileCommand = "rustc";
			compileArgs = [sourcePath, "-O", "-o", binaryPath];
		}

		let compile = await runCommand(compileCommand, compileArgs, toolDir);
		if (compile.code !== 0 && manifest.language === "cpp" && compileCommand === "clang++") {
			compile = await runCommand("g++", [sourcePath, "-O2", "-std=c++17", "-o", binaryPath], toolDir);
		}
		if (compile.code !== 0 && manifest.language === "c" && compileCommand === "gcc") {
			compile = await runCommand("clang", [sourcePath, "-O2", "-o", binaryPath], toolDir);
		}
		if (compile.code !== 0) {
			throw new Error(compile.stderr.trim() || `Compilation failed with code ${String(compile.code)}`);
		}

		const executeResult = await runCommand(binaryPath, cliArgs, toolDir);
		if (executeResult.code !== 0) {
			throw new Error(
				executeResult.stderr.trim() || `Tool exited with code ${String(executeResult.code)}`,
			);
		}
		return executeResult.stdout;
	}

	throw new Error(`Unsupported language: ${manifest.language}`);
}

export function getCustomToolRawUrl(toolId: string, filePathFromRoot: string): string {
	const cleanedToolId = toolId.trim().replace(/^\/+|\/+$/g, "");
	const cleanedPath = filePathFromRoot.trim().replace(/^\/+/, "");
	return `https://huggingface.co/buckets/sharktide/tools/resolve/${cleanedToolId}/${cleanedPath}`;
}

export async function createCustomToolFromRegistryRecord(
	record: CustomToolRegistryRecord,
	code: string,
): Promise<{ ok: true; manifest: CustomToolManifest } | { ok: false; error: string }> {
	try {
		const manifest: CustomToolManifest = {
			id: record.id,
			name: record.name,
			functionality: record.functionality,
			language: record.language,
			codeFile: path.basename(record.files.codePath),
			authorEmail: record.authorEmail,
			openai: record.openai,
			requirements: record.requirements,
			visibility: record.visibility,
			published: true,
			createdAt: record.publishedAt,
			updatedAt: new Date().toISOString(),
			registry: {
				source: "lightning",
				uploadedAt: record.publishedAt,
				updatedAt: record.updatedAt,
			},
		};
		const toolDir = path.join(getCustomToolsRoot(), manifest.id);
		ensureDirSync(toolDir);
		writeJsonFile(path.join(toolDir, "manifest.json"), manifest);
		fs.writeFileSync(path.join(toolDir, manifest.codeFile), code, "utf-8");
		return { ok: true, manifest };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
