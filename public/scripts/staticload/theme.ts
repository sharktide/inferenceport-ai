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

async function renderUserIndicator() {
  try {
    const nav = document.querySelector('nav');
    if (!nav) return;

    const existing = document.getElementById('user-indicator');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'user-indicator';
    container.style.marginLeft = 'auto';
    container.style.marginRight = '18px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';

    const res = await window.auth.getSession();
    const session = (res as any)?.session;
    const profile = (res as any)?.profile;

    if (session && session.user) {
      const name = profile?.username || session.user?.email || 'Account';
      const link = document.createElement('a');
      link.href = 'settings.html';
      link.textContent = String(name);
      link.style.textDecoration = 'none';
      link.style.color = 'inherit';
      link.id = 'account-link';

      const signOutBtn = document.createElement('button');
      signOutBtn.textContent = 'Sign out';
      signOutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.auth.signOut();
        window.location.href = 'auth.html';
      });

      container.appendChild(link);
      container.appendChild(signOutBtn);
    } else {
      const signIn = document.createElement('a');
      signIn.href = 'auth.html';
      signIn.textContent = 'Sign in';
      signIn.style.textDecoration = 'none';
      signIn.style.color = 'inherit';
      container.appendChild(signIn);
    }

    nav.appendChild(container);
  } catch (e) {
    console.warn('renderUserIndicator error', e);
  }
}

try { window.auth.onAuthStateChange(() => renderUserIndicator()); } catch(e) {}
