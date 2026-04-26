// File reading utilities

export async function readJsonLines(fileHandle: FileSystemFileHandle): Promise<any[]> {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // Skip invalid lines
      }
    }
    return parsed;
  } catch {
    return [];
  }
}

export async function readJson(fileHandle: FileSystemFileHandle): Promise<any> {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isUuidDir(name: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(name);
}
