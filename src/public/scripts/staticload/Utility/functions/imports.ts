export function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '_');
}

export async function saveImport(config: any) {
  const basePath = await window.utils.getPath();

  let folder: string;
  let fileName: string;

  if (config.type === "space") {
    folder = "spaces";
    fileName = `${sanitizeFilename(config.author)}____${sanitizeFilename(config.title)}.import`;
  } else {
    folder = "websites";
    fileName = `${crypto.randomUUID()}.import`;
  }

  const filePath = `${basePath}/${folder}/${fileName}`;
  await window.utils.saveFile(filePath, JSON.stringify(config, null, 2));
}
