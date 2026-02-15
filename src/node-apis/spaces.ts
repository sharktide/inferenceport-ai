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

import { app, ipcMain, BrowserWindow, dialog } from "electron";
import type { IpcMainInvokeEvent } from 'electron'
import fs from "fs";
import path from "path";

const spaceDir: string = path.join(app.getPath("userData"), "spaces");
const siteDir: string = path.join(app.getPath("userData"), "websites");

import type { ImportSchema } from "./types/index.types.d.ts";

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function getWebsites(): string[] {
    try {
        const files: string[] = fs.readdirSync(siteDir);
        const jsonFiles: string[] = files.filter((file: string): boolean => {
            const fullPath: string = path.join(siteDir, file);
            return fs.statSync(fullPath).isFile() && file.endsWith(".import");
        });
        return jsonFiles;
    } catch (err: unknown) {
        console.error("Error reading directory", err)
        return [];
    }
}

function deleteWebsiteByURL(url: string): boolean {
    const files = getWebsites();

    for (const file of files) {
        const fullPath = path.join(siteDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data: ImportSchema = JSON.parse(content);

            if (data.type === "website" && data.url === url) {
                fs.unlinkSync(fullPath);
                return true;
            }
        } catch (err: unknown) {
            console.warn(`Error processing ${file}:`, err);
        }
    }

    console.warn(`No matching website fond for ${url}`);
    return false;
}

function getWebsiteData(): string {
    const files: string[] = getWebsites();
    let html: string = "";

    files.forEach((file: string): void => {
        const fullPath: string = path.join(siteDir, file);
        try {
            const content: string = fs.readFileSync(fullPath, "utf-8");
            const data: ImportSchema = JSON.parse(content);
            if (data.type === "website") {
            html += `
                <div class="marketplace-card" siteId="${escapeHtml(data.url)}" style="background: ${escapeHtml(data.background)}; padding: 16px; border-radius: var(--border-radius); margin-bottom: 12px; position: relative;">
                    <h3 style="margin: 0; font-size: 18px;">${escapeHtml(data.emoji)} ${escapeHtml(data.title)}</h3>
                    <p style="margin: 4px 0 0; font-size: 14px; color: var(--text-dark);">${escapeHtml(data.url)}</p>

                    <p style="margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); line-height: 1.4;">
                        &nbsp;
                    </p>

                    <!-- <button class="darkhvr" style="background: ${escapeHtml(data.background)}; filter: brightness(90%);">Launch</button> -->
                    <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">
                        <button class="darkhvr" style="background: ${escapeHtml(data.background)}; filter: brightness(90%);">Launch</button>
                    </a>

                    <br />
                    <button class="darkhvr" style="background: ${escapeHtml(data.background)}; filter: brightness(90%);" onclick="showDelModal('${escapeHtml(data.url)}', '${escapeHtml(data.title)}', 'website')">Delete</button>

                    <div class="menu-container" style="position: absolute; top: 12px; right: 12px;">
                        <button class="menu-button" onclick="toggleMenu(this)" style="background: transparent; border: none; font-size: 18px;">⋮</button>
                        <div class="menu-dropdown" style="display: none; position: absolute; right: 0; background: var(--bg-light); border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); z-index: 10;">
                            <button onclick="shareWebsite('${escapeHtml(data.url)}', '${escapeHtml(data.title)}')" style="padding: 8px 12px; width: 100%; background: none; border: none; text-align: left; background-color: var(--bg-light); color: var(--text-dark) !important;">Share</button>
                        </div>
                    </div>
                </div>
            `;
            }
        } catch (err: unknown) {
            console.warn(`Failed to parse ${file}:`, err);
        }
    });

    return html;
}

function getSpaces(): string[] {
    try {
        const files: string[] = fs.readdirSync(spaceDir);
        const jsonFiles: string[] = files.filter((file: string): boolean => {
            const fullPath: string = path.join(spaceDir, file);
            return fs.statSync(fullPath).isFile() && file.endsWith(".import");
        });
        return jsonFiles;
    } catch (err: unknown) {
        console.error("Error reading directory:", err);
        return [];
    }
}

function deleteSpaceByUserRepo(username: string, repo: string): boolean {
    const files = getSpaces();

    for (const file of files) {
        const fullPath = path.join(spaceDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data: ImportSchema = JSON.parse(content);

            if (data.type === "space" && data.author === username && data.title === repo) {
                fs.unlinkSync(fullPath);
                return true;
            }
        } catch (err: unknown) {
            console.warn(`Error processing ${file}:`, err);
        }
    }

    console.warn(`No matching space found for ${username}/${repo}`);
    return false;
}


function getData(): string {
    const files: string[] = getSpaces();
    let html: string = "";

    files.forEach((file: string): void => {
        const fullPath: string = path.join(spaceDir, file);
        try {
            const content: string = fs.readFileSync(fullPath, "utf-8");
            const data: ImportSchema = JSON.parse(content);
            if (data.type === "space") {
            html += `
                <div class="marketplace-card" spaceid="${escapeHtml(data.author)}/${escapeHtml(data.title)}" style="background: ${escapeHtml(data.background)}; padding: 16px; border-radius: var(--border-radius); margin-bottom: 12px; position: relative;">
                    <h3 style="margin: 0; font-size: 18px;">${escapeHtml(data.emoji)} ${escapeHtml(data.title)}</h3>
                    <p style="margin: 4px 0 0; font-size: 14px; color: var(--text-dark);">by ${escapeHtml(data.author)}</p>

                    <p style="margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); line-height: 1.4;">
                        ${data.short_description ?? "No description available."}
                    </p>

                    <button class="darkhvr" style="background: ${escapeHtml(data.background)}; filter: brightness(90%);" onclick="window.location.href='./renderer/spaces.html?author=${escapeHtml(data.author)}&repo=${escapeHtml(data.title)}&sdk=${escapeHtml(data.sdk)}'">Launch</button>
                    <br />
                    <button class="darkhvr" style="background: ${escapeHtml(data.background)}; filter: brightness(90%);" onclick="showDelModal('${escapeHtml(data.author)}', '${escapeHtml(data.title)}', 'space')">Delete</button>

                    <!-- Three-dot menu -->
                    <div class="menu-container" style="position: absolute; top: 12px; right: 12px;">
                        <button class="menu-button" onclick="toggleMenu(this)" style="background: transparent; border: none; font-size: 18px;">⋮</button>
                        <div class="menu-dropdown" style="display: none; position: absolute; right: 0; background: var(--bg-light); border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); z-index: 10;">
                            <button onclick="shareSpace('${escapeHtml(data.author)}', '${escapeHtml(data.title)}')" style="padding: 8px 12px; width: 100%; background: none; border: none; text-align: left; background-color: var(--bg-light); color: var(--text-dark) !important;">Share</button>
                        </div>
                    </div>
                </div>
            `;
            }
        } catch (err: unknown) {
            console.warn(`Failed to parse ${file}:`, err);
        }
    });

    return html;
}

async function share(username: string, repo: string): Promise<void> {
    const files = getSpaces();

    for (const file of files) {
        const fullPath = path.join(spaceDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data: ImportSchema = JSON.parse(content);

            if (data.type === "space" && data.author === username && data.title === repo) {
                const win = BrowserWindow.getFocusedWindow();
                if (!win) {
                    console.error("No active window for dialog.");
                    return;
                }

                const { canceled, filePath } = await dialog.showSaveDialog(win, {
                    title: "Save Space File",
                    defaultPath: `${repo}.import`,
                    filters: [{ name: "Import Files", extensions: ["import"] }]
                });

                if (!canceled && filePath) {
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
                    console.log(`Space shared to ${filePath}`);
                }
                return;
            }
        } catch (err: unknown) {
            console.warn(`Error processing ${file}:`, err);
        }
    }

    console.warn(`No matching space found for ${username}/${repo}`);
}

async function shareSite(url: string, title: string): Promise<void> {
    const files = getWebsites();

    for (const file of files) {
        const fullPath = path.join(siteDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data: ImportSchema = JSON.parse(content);

            if (data.type === "website" && data.url === url && data.title === title) {
                const win = BrowserWindow.getFocusedWindow();
                if (!win) {
                    console.error("No active window for dialog.");
                    return;
                }

                const { canceled, filePath } = await dialog.showSaveDialog(win, {
                    title: "Save Website File",
                    defaultPath: `${title}.import`,
                    filters: [{ name: "Import Files", extensions: ["import"] }]
                });

                if (!canceled && filePath) {
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
                    console.log(`Website shared to ${filePath}`);
                }
                return;
            }
        } catch (err: unknown) {
            console.warn(`Error processing ${file}:`, err);
        }
    }

    console.warn(`No matching website found for ${title}`);
}

export default function register(): void {
    ipcMain.handle("hfspaces:get-cards", (): string => {
        return getData();
    });
    ipcMain.handle("hfspaces:delete", (_event: IpcMainInvokeEvent, username: string, repo: string): boolean => {
        return deleteSpaceByUserRepo(username, repo);
    });
    ipcMain.handle("hfspaces:share", async (_event: IpcMainInvokeEvent, username: string, repo: string) => {
        await share(username, repo);
    });
    ipcMain.handle("hfspaces:get-website-cards", (): string => {
        return getWebsiteData();
    });
    ipcMain.handle("hfspaces:delete-website", (_event: IpcMainInvokeEvent, url: string): boolean => {
        return deleteWebsiteByURL(url);
    });
    ipcMain.handle("hfspaces:share-website", async (_event: IpcMainInvokeEvent, url: string, title: string) => {
        await shareSite(url, title);
    });

}

