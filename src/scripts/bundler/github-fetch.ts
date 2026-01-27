export async function githubFetch(
	url: string,
	token?: string,
): Promise<Response> {
	let headers = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		Authorization: "",
	};

	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}
	const response = await fetch(url, {
		headers: headers,
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`GitHub request failed: ${error}`);
	}

	return response;
}
