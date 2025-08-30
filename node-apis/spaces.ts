//@ts-ignore
const { app, ipcMain, BrowserWindow } = require("electron");
//@ts-ignore
const fs = require("fs");
//@ts-ignore
const path = require("path");

const spaceDir: string = path.join(app.getPath("userData"), "spaces");

interface SpaceData {
    type: string;
    title: string;
    author: string;
    emoji: string;
    background: string;
    short_description: string;
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
            const data: SpaceData = JSON.parse(content);

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
            const data: SpaceData = JSON.parse(content);
            if (data.type === "space") {
                html += `
                    <div class="marketplace-card" spaceid="${data.author}/${data.title}" style="background: ${data.background}; padding: 16px; border-radius: var(--border-radius); margin-bottom: 12px;">
                        <h3 style="margin: 0; font-size: 18px;">${data.emoji} ${data.title}</h3>
                        <p style="margin: 4px 0 0; font-size: 14px; color: var(--text-dark);">by ${data.author}</p>

                        <p style="margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); line-height: 1.4;">
                            ${data.short_description ?? "No description available."}
                        </p>

                        <button class="darkhvr" style="background: ${data.background}; filter: brightness(90%);">Launch</button>
                        <br />
                        <button class="darkhvr" style="background: ${data.background}; filter: brightness(90%);" onclick="showDelModal('${data.author}', '${data.title}', 'space')">Delete</button>
                    </div>
                `;
            }
        } catch (err: unknown) {
            console.warn(`Failed to parse ${file}:`, err);
        }
    });

    return html;
}

//@ts-ignore
function register(): void {
    ipcMain.handle("hfspaces:get-cards", (): string => {
        return getData();
    });
    //@ts-ignore
    ipcMain.handle("hfspaces:delete", (_event: Electron.IpcMainEvent, username: string, repo: string): boolean => {
        return deleteSpaceByUserRepo(username, repo);
    });
}

module.exports = { register };