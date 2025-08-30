const params = new URLSearchParams(window.location.search);

const spinner = document.getElementById("spinner") as HTMLDivElement

spinner.style.display = "flex"
let author = params.get("author")
let repo = params.get("repo");
const sdk = params.get("sdk");

document.title = `${repo} - ${author} - InferencePortAI`
author = author?.replace(/\s+/g, "-") ?? "";
repo = repo?.replace(/\s+/g, "-") ?? "";

if (!author || !repo) {
    console.error("Missing 'author' or 'repo' in URL parameters.");
} else {
    const spaceUrl =
        sdk == "static"
            ? `https://${author}-${repo}.static.hf.space`
            : `https://${author}-${repo}.hf.space`;

    const iframe = document.getElementById("hf-space-frame") as HTMLIFrameElement;
    iframe.src = spaceUrl;

    iframe.addEventListener("load", function() {
        spinner.style.display = "none"
    })
}
