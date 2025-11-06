"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//@ts-ignore
const { app, ipcMain, BrowserWindow, dialog } = require("electron");
//@ts-ignore
const fs = require("fs");
//@ts-ignore
const path = require("path");
const spaceDir = path.join(app.getPath("userData"), "spaces");
const siteDir = path.join(app.getPath("userData"), "websites");
function getWebsites() {
    try {
        const files = fs.readdirSync(siteDir);
        const jsonFiles = files.filter((file) => {
            const fullPath = path.join(siteDir, file);
            return fs.statSync(fullPath).isFile() && file.endsWith(".import");
        });
        return jsonFiles;
    }
    catch (err) {
        console.error("Error reading directory", err);
        return [];
    }
}
function deleteWebsiteByURL(url) {
    const files = getWebsites();
    for (const file of files) {
        const fullPath = path.join(siteDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data = JSON.parse(content);
            if (data.type === "website" && data.url === url) {
                fs.unlinkSync(fullPath);
                return true;
            }
        }
        catch (err) {
            console.warn(`Error processing ${file}:`, err);
        }
    }
    console.warn(`No matching website fond for ${url}`);
    return false;
}
function getWebsiteData() {
    const files = getWebsites();
    let html = "";
    files.forEach((file) => {
        const fullPath = path.join(siteDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data = JSON.parse(content);
            if (data.type === "website") {
                html += `
                <div class="marketplace-card" siteId="${data.url}" style="background: ${data.background}; padding: 16px; border-radius: var(--border-radius); margin-bottom: 12px; position: relative;">
                    <h3 style="margin: 0; font-size: 18px;">${data.emoji} ${data.title}</h3>
                    <p style="margin: 4px 0 0; font-size: 14px; color: var(--text-dark);">${data.url}</p>

                    <p style="margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); line-height: 1.4;">
                        &nbsp;
                    </p>

                    <!-- <button class="darkhvr" style="background: ${data.background}; filter: brightness(90%);">Launch</button> -->
                    <a href="${data.url}" target="_blank" rel="noopener noreferrer">
                        <button class="darkhvr" style="background: ${data.background}; filter: brightness(90%);">Launch</button>
                    </a>

                    <br />
                    <button class="darkhvr" style="background: ${data.background}; filter: brightness(90%);" onclick="showDelModal('${data.url}', '${data.title}', 'website')">Delete</button>

                    <div class="menu-container" style="position: absolute; top: 12px; right: 12px;">
                        <button class="menu-button" onclick="toggleMenu(this)" style="background: transparent; border: none; font-size: 18px;">⋮</button>
                        <div class="menu-dropdown" style="display: none; position: absolute; right: 0; background: var(--bg-light); border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); z-index: 10;">
                            <button onclick="shareWebsite('${data.url}', '${data.title}')" style="padding: 8px 12px; width: 100%; background: none; border: none; text-align: left; background-color: var(--bg-light); color: var(--text-dark)">Share</button>
                        </div>
                    </div>
                </div>
            `;
            }
        }
        catch (err) {
            console.warn(`Failed to parse ${file}:`, err);
        }
    });
    return html;
}
function getSpaces() {
    try {
        const files = fs.readdirSync(spaceDir);
        const jsonFiles = files.filter((file) => {
            const fullPath = path.join(spaceDir, file);
            return fs.statSync(fullPath).isFile() && file.endsWith(".import");
        });
        return jsonFiles;
    }
    catch (err) {
        console.error("Error reading directory:", err);
        return [];
    }
}
function deleteSpaceByUserRepo(username, repo) {
    const files = getSpaces();
    for (const file of files) {
        const fullPath = path.join(spaceDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data = JSON.parse(content);
            if (data.type === "space" && data.author === username && data.title === repo) {
                fs.unlinkSync(fullPath);
                return true;
            }
        }
        catch (err) {
            console.warn(`Error processing ${file}:`, err);
        }
    }
    console.warn(`No matching space found for ${username}/${repo}`);
    return false;
}
function getData() {
    const files = getSpaces();
    let html = "";
    files.forEach((file) => {
        const fullPath = path.join(spaceDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data = JSON.parse(content);
            if (data.type === "space") {
                html += `
                <div class="marketplace-card" spaceid="${data.author}/${data.title}" style="background: ${data.background}; padding: 16px; border-radius: var(--border-radius); margin-bottom: 12px; position: relative;">
                    <h3 style="margin: 0; font-size: 18px;">${data.emoji} ${data.title}</h3>
                    <p style="margin: 4px 0 0; font-size: 14px; color: var(--text-dark);">by ${data.author}</p>

                    <p style="margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); line-height: 1.4;">
                        ${data.short_description ?? "No description available."}
                    </p>

                    <button class="darkhvr" style="background: ${data.background}; filter: brightness(90%);" onclick="window.location.href='./renderer/spaces.html?author=${data.author}&repo=${data.title}&sdk=${data.sdk}'">Launch</button>
                    <br />
                    <button class="darkhvr" style="background: ${data.background}; filter: brightness(90%);" onclick="showDelModal('${data.author}', '${data.title}', 'space')">Delete</button>

                    <!-- Three-dot menu -->
                    <div class="menu-container" style="position: absolute; top: 12px; right: 12px;">
                        <button class="menu-button" onclick="toggleMenu(this)" style="background: transparent; border: none; font-size: 18px;">⋮</button>
                        <div class="menu-dropdown" style="display: none; position: absolute; right: 0; background: var(--bg-light); border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); z-index: 10;">
                            <button onclick="shareSpace('${data.author}', '${data.title}')" style="padding: 8px 12px; width: 100%; background: none; border: none; text-align: left; background-color: var(--bg-light); color: var(--text-dark)">Share</button>
                        </div>
                    </div>
                </div>
            `;
            }
        }
        catch (err) {
            console.warn(`Failed to parse ${file}:`, err);
        }
    });
    return html;
}
async function share(username, repo) {
    const files = getSpaces();
    for (const file of files) {
        const fullPath = path.join(spaceDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data = JSON.parse(content);
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
        }
        catch (err) {
            console.warn(`Error processing ${file}:`, err);
        }
    }
    console.warn(`No matching space found for ${username}/${repo}`);
}
async function shareSite(url, title) {
    const files = getWebsites();
    for (const file of files) {
        const fullPath = path.join(siteDir, file);
        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const data = JSON.parse(content);
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
        }
        catch (err) {
            console.warn(`Error processing ${file}:`, err);
        }
    }
    console.warn(`No matching website found for ${title}`);
}
//@ts-ignore
function register() {
    ipcMain.handle("hfspaces:get-cards", () => {
        return getData();
    });
    ipcMain.handle("hfspaces:delete", (_event, username, repo) => {
        return deleteSpaceByUserRepo(username, repo);
    });
    ipcMain.handle("hfspaces:share", async (_event, username, repo) => {
        await share(username, repo);
    });
    ipcMain.handle("hfspaces:get-website-cards", () => {
        return getWebsiteData();
    });
    ipcMain.handle("hfspaces:delete-website", (_event, url) => {
        return deleteWebsiteByURL(url);
    });
    ipcMain.handle("hfspaces:share-website", async (_event, url, title) => {
        await shareSite(url, title);
    });
}
module.exports = { register };
//# sourceMappingURL=spaces.js.map