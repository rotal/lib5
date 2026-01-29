let dirHandle: FileSystemDirectoryHandle | null = null;

export function hasLocalDir(): boolean {
  return dirHandle !== null;
}

export async function pickLocalDir(): Promise<boolean> {
  try {
    dirHandle = await (window as any).showDirectoryPicker({
      id: 'lib5-project',
      mode: 'readwrite',
      startIn: 'documents',
    });
    return true;
  } catch {
    return false;
  }
}

export interface LocalFile {
  name: string;
  lastModified: number;
}

export async function listLocalFiles(): Promise<LocalFile[]> {
  if (!dirHandle) return [];
  const files: LocalFile[] = [];
  for await (const entry of (dirHandle as any).values()) {
    if (entry.kind === 'file' && (entry.name.endsWith('.l5') || entry.name.endsWith('.json'))) {
      const file = await (entry as FileSystemFileHandle).getFile();
      files.push({ name: file.name, lastModified: file.lastModified });
    }
  }
  files.sort((a, b) => b.lastModified - a.lastModified);
  return files;
}

export async function readLocalFile(name: string): Promise<any> {
  if (!dirHandle) throw new Error('No project folder selected');
  const fileHandle = await dirHandle.getFileHandle(name);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function writeLocalFile(name: string, content: object): Promise<void> {
  if (!dirHandle) throw new Error('No project folder selected');
  const fileName = name.endsWith('.l5') ? name : `${name}.l5`;
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(JSON.stringify(content, null, 2));
  await writable.close();
}

export async function deleteLocalFile(name: string): Promise<void> {
  if (!dirHandle) throw new Error('No project folder selected');
  await (dirHandle as any).removeEntry(name);
}
