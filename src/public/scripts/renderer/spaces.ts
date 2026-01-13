/*
Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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
