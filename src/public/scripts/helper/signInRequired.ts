/*
Copyright 2026 InferencePort LLC

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

function openSignInRequiredModal(): void {
	if (!(window.ic && window.ic.iModal)) {
		window.location.href = "../auth.html";
		return;
	}

	let modal: declarations["iInstance"]["iModal"] | null = null;
	const getModal = (): declarations["iInstance"]["iModal"] => {
		if (!modal) {
			modal = new window.ic.iModal(
				"signin-required-modal",
				520,
				undefined,
				false,
				false,
			);
		}
		return modal;
	};

	const goToAuth = (mode: "signin" | "signup"): void => {
		getModal().close();
		window.location.href = `../auth.html?mode=${mode}`;
	};

	getModal().open({
		html: `
			<h3>Sign in required</h3>
			<p style="opacity:.85;margin:8px 0 10px;line-height:1.5;">
				This feature uses InferencePort AI cloud services, which require an
				account. Sign in or create a free account to continue.
			</p>
		`,
		actions: [
			{
				id: "signin-required-signin",
				label: "Sign In",
				onClick: () => goToAuth("signin"),
			},
			{
				id: "signin-required-signup",
				label: "Create Account",
				onClick: () => goToAuth("signup"),
			},
			{
				id: "signin-required-close",
				label: "Close",
				onClick: () => getModal().close(),
			},
		],
	});
}

export { openSignInRequiredModal }