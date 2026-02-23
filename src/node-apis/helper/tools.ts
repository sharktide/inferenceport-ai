import { LOG, LOG_ERR } from "./log.js";

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

export async function GenerateImage(prompt: string): Promise<{ dataUrl: string }> {
	const trace = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

	LOG(trace, "ENTER GenerateImage", { prompt });
	
	const url =
		`https://sharktide-lightning.hf.space/gen/image`
		
	LOG(trace, "FETCH URL", url);

	let response: Response;
	try {
		response = await fetch(url,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: prompt }),
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
		throw new Error(`Image fetch failed: ${response.status}`);
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

export async function generateVideo(prompt: string): Promise<ArrayBuffer> {
    const trace = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    	LOG(trace, "ENTER GenerateVideo", { prompt });
	
	const url =
		`https://sharktide-lightning.hf.space/gen/video`

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