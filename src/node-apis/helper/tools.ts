import { LOG, LOG_ERR } from "./log.js";
import fs from "fs";
import path from "path"
export const cache ={
 	cachedSupportsTools: null as string[] | null,
	writeInProgress: null as Promise<void> | null
}
import { app } from "electron"
async function fetchWithRetry(
    trace: string,
    url: string,
    options: RequestInit,
    maxRetries: number = 5,
    baseDelay: number = 1000
): Promise<Response> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);

            if (res.status === 500 || res.status === 429) {
                LOG_ERR(trace, `${res.status} ERROR ON ATTEMPT ${attempt}`, {
                    status: res.status,
                    statusText: res.statusText,
                });

                if (attempt < maxRetries) {
                    const delay = baseDelay * attempt;
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                throw new Error(
                    `Fetch failed after ${maxRetries} attempts with ${res.status}`
                );
            }

            return res;

        } catch (err) {
            LOG_ERR(trace, `FETCH THREW ON ATTEMPT ${attempt}`, err);

            if (attempt < maxRetries) {
                const delay = baseDelay * attempt;
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            throw err;
        }
    }

    throw new Error("Unreachable");
}

export type ImageGenerateRequest = {
	prompt: string;
	mode?: "auto" | "fantasy" | "realistic";
};

export async function GenerateImage(
	request: ImageGenerateRequest,
): Promise<{ dataUrl: string }> {
	const trace = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

	LOG(trace, "ENTER GenerateImage", request);
	
	const url =
		`https://sharktide-lightning.hf.space/gen/image`
		
	LOG(trace, "FETCH URL", url);

	let response: Response;
	try {
		const body: Record<string, unknown> = { prompt: request.prompt };
		if (request.mode) body.mode = request.mode;

		response = await fetch(url,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }
        );
		LOG(trace, "FETCH RESOLVED", {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		});
	} catch (e) {
		LOG_ERR(trace, "FETCH THREW", e);
		throw e;
	}

	if (!response.ok) {
		LOG_ERR(trace, "NON-OK RESPONSE", {
			status: response.status,
			statusText: response.statusText,
		});
		throw new Error(`Image fetch failed: ${response.status} ${await response.text()}`);
	}

	const contentType = response.headers.get("content-type");
	LOG(trace, "CONTENT-TYPE", contentType);

	let arrayBuffer: ArrayBuffer;
	try {
		arrayBuffer = await response.arrayBuffer();
		LOG(trace, "ARRAYBUFFER RECEIVED", {
			byteLength: arrayBuffer.byteLength,
		});
	} catch (e) {
		LOG_ERR(trace, "ARRAYBUFFER FAILED", e);
		throw e;
	}

	if (arrayBuffer.byteLength === 0) {
		LOG_ERR(trace, "EMPTY IMAGE BUFFER");
		throw new Error("Empty image buffer");
	}

	let base64: string;
	try {
		base64 = Buffer.from(arrayBuffer).toString("base64");
		LOG(trace, "BASE64 ENCODED", {
			length: base64.length,
			head: base64.slice(0, 32),
		});
	} catch (e) {
		LOG_ERR(trace, "BASE64 ENCODE FAILED", e);
		throw e;
	}

	LOG(trace, "EXIT GenerateImage OK");

	return {
		dataUrl: `data:${contentType || "image/png"};base64,${base64}`,
	};
}

export async function duckDuckGoSearch(query: string): Promise<{
    abstract: string;
    heading: string;
    related: { text: string; url: string }[];
}> {
    const res = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(
            query,
        )}&format=json&no_html=1&skip_disambig=1`,
    );
	if (!res.ok) {
		throw new Error("Web search failed. Check your internet connetion")
	}
    const data = await res.json();

    return {
        abstract: data.AbstractText,
        heading: data.Heading,
        related: (data.RelatedTopics || []).slice(0, 5).map((r: any) => ({
            text: r.Text,
            url: r.FirstURL,
        })),
    };
}

export async function generateAudioOrSFX(prompt: string): Promise<ArrayBuffer> {
    const trace = `audiosfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

	LOG(trace, "ENTER GenerateAudioOrSFX", { prompt });
	
	const url =
		`https://sharktide-lightning.hf.space/gen/sfx`

	let response: Response;
	try {
		response = await fetchWithRetry(trace, url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt: prompt }),
		}, 6);
		LOG(trace, "FETCH RESOLVED", {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		});
	} catch (e) {
		LOG_ERR(trace, "FETCH THREW", e);
		throw e;
	}

	if (!response.ok) {
		LOG_ERR(trace, "NON-OK RESPONSE", {
			status: response.status,
			statusText: response.statusText,
		});
		throw new Error(`Audio fetch failed: ${response.status}`);
	}

	const contentType = response.headers.get("content-type");
	LOG(trace, "CONTENT-TYPE", contentType);

	let arrayBuffer: ArrayBuffer;
	try {
		arrayBuffer = await response.arrayBuffer();
		LOG(trace, "ARRAYBUFFER RECEIVED", {
			byteLength: arrayBuffer.byteLength,
		});
	} catch (e) {
		LOG_ERR(trace, "ARRAYBUFFER FAILED", e);
		throw e;
	}

	if (arrayBuffer.byteLength === 0 || !arrayBuffer) {
		LOG_ERR(trace, "EMPTY AUDIO BUFFER");
		throw new Error("Empty audio buffer");
	}

	LOG(trace, "EXIT GenerateAudioOrSFX OK");

    return arrayBuffer;
}

export type VideoGenerateRequest = {
	prompt: string;
	ratio?: "3:2" | "2:3" | "1:1";
	mode?: "normal" | "fun";
	duration?: number;
	image_urls?: string[];
};

export async function generateVideo(
	request: VideoGenerateRequest,
): Promise<ArrayBuffer> {
    const trace = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    	LOG(trace, "ENTER GenerateVideo", request);
	
	const url =
		`https://sharktide-lightning.hf.space/gen/video`

	const body: Record<string, unknown> = {
		prompt: request.prompt,
	};

	if (request.ratio) body.ratio = request.ratio;
	if (request.mode) body.mode = request.mode;
	if (typeof request.duration === "number") body.duration = request.duration;
	if (Array.isArray(request.image_urls) && request.image_urls.length > 0) {
		body.image_urls = request.image_urls;
	}

	let response: Response;
	try {
		response = await fetchWithRetry(trace, url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}, 6);
		LOG(trace, "FETCH RESOLVED", {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		});
	} catch (e) {
		LOG_ERR(trace, "FETCH THREW", e);
		throw e;
	}

	if (!response.ok) {
		LOG_ERR(trace, "NON-OK RESPONSE", {
			status: response.status,
			statusText: response.statusText,
		});
		throw new Error(`Video fetch failed: ${response.status}`);
	}

	const contentType = response.headers.get("content-type");
	LOG(trace, "CONTENT-TYPE", contentType);

	let arrayBuffer: ArrayBuffer;
	try {
		arrayBuffer = await response.arrayBuffer();
		LOG(trace, "ARRAYBUFFER RECEIVED", {
			byteLength: arrayBuffer.byteLength,
		});
	} catch (e) {
		LOG_ERR(trace, "ARRAYBUFFER FAILED", e);
		throw e;
	}

	if (arrayBuffer.byteLength === 0 || !arrayBuffer) {
		LOG_ERR(trace, "EMPTY VIDEO BUFFER");
		throw new Error("Empty video buffer");
	}

	LOG(trace, "EXIT GenerateVideo OK");

    return arrayBuffer;
}

async function ensureDir() {
	await fs.promises.mkdir(path.dirname(path.join(app.getPath("userData"), "chat-sessions")), { recursive: true });
}

export async function fetchSupportedTools(): Promise<{ supportsTools: string[] }> {
    const response = await fetch(
        "https://cdn.jsdelivr.net/gh/sharktide/inferenceport-ai@main/MISC/prod/toolSupportingModels.json"
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch tool-supporting models: ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > 50_000) {
        throw new Error("Payload too large — rejecting for safety");
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch {
        throw new Error("Failed to parse JSON");
    }

    if (!Array.isArray(data)) {
        throw new Error("Invalid JSON: expected a string[]");
    }

    for (const item of data) {
        if (typeof item !== "string") {
            throw new Error("Invalid JSON: all items must be strings");
        }

        if (/[\u0000-\u001F]/.test(item)) {
            throw new Error("Invalid JSON: contains control characters");
        }

        if (/[<>]/.test(item)) {
            throw new Error("Invalid JSON: contains HTML-like characters");
        }

        if (item.length > 200) {
            throw new Error("Invalid JSON: string too long");
        }
    }

    if (data.length > 2000) {
        throw new Error("Invalid JSON: too many entries");
    }

    const supportsTools = data as string[];

    cache.cachedSupportsTools = supportsTools;

    await ensureDir();
    const writeTask = fs.promises.writeFile(
        path.join(app.getPath("userData"), "chat-sessions", "supportsTools.json"),
        JSON.stringify({ supportsTools }, null, 2),
        "utf-8"
    );
    cache.writeInProgress = writeTask;
    await writeTask;
    cache.writeInProgress = null;

    return { supportsTools };
}
