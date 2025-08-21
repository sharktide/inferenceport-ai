function applySavedTheme() {
	const savedTheme = localStorage.getItem("theme");
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const theme = savedTheme || (prefersDark ? "dark" : "light");
	document.documentElement.setAttribute("data-theme", theme);
	updateToggleButton(theme);
}

function toggleTheme() {
	const current = document.documentElement.getAttribute("data-theme");
	const newTheme = current === "dark" ? "light" : "dark";
	document.documentElement.setAttribute("data-theme", newTheme);
	localStorage.setItem("theme", newTheme);
	updateToggleButton(newTheme);
}

function updateToggleButton(currentTheme: string) {
	const button = document.getElementById("theme-toggle");
	if (button) {
		button.textContent =
			currentTheme === "dark" ? "Toggle Light mode" : "Toggle Dark mode";
	}
}

document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

applySavedTheme();
