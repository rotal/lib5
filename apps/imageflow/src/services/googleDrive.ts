import { useAuthStore } from '../store/authStore';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'lib5';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

function getToken(): string {
  const token = useAuthStore.getState().accessToken;
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function driveRequest(url: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    throw new Error('Session expired. Please sign in again.');
  }
  return res;
}

/** Find the lib5 folder, or return null */
async function findFolder(): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveRequest(`${DRIVE_API}/files?q=${q}&fields=files(id)&spaces=drive`);
  if (!res.ok) throw new Error('Failed to search for folder');
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

/** Create the lib5 folder */
async function createFolder(): Promise<string> {
  const res = await driveRequest(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!res.ok) throw new Error('Failed to create folder');
  const data = await res.json();
  return data.id;
}

/** Get or create the lib5 folder */
async function ensureFolder(): Promise<string> {
  const existing = await findFolder();
  if (existing) return existing;
  return createFolder();
}

/** List .json files in the lib5 folder */
export async function listFiles(): Promise<DriveFile[]> {
  const folderId = await findFolder();
  if (!folderId) return [];

  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType='application/json' and trashed=false`
  );
  const res = await driveRequest(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&spaces=drive`
  );
  if (!res.ok) throw new Error('Failed to list files');
  const data = await res.json();
  return data.files ?? [];
}

/** Read a file's JSON content from Drive */
export async function readFile(fileId: string): Promise<any> {
  const res = await driveRequest(`${DRIVE_API}/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error('Failed to read file');
  return res.json();
}

/** Create a new JSON file in the lib5 folder */
export async function createFile(name: string, content: object): Promise<DriveFile> {
  const folderId = await ensureFolder();

  const fileName = name.endsWith('.l5') ? name : `${name}.l5`;
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
  };

  const body = new FormData();
  body.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  body.append(
    'file',
    new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })
  );

  const res = await driveRequest(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime`, {
    method: 'POST',
    body,
  });
  if (!res.ok) throw new Error('Failed to create file');
  return res.json();
}

/** Update an existing file on Drive */
export async function updateFile(fileId: string, content: object, newName?: string): Promise<DriveFile> {
  const metadata: any = {};
  if (newName) {
    metadata.name = newName.endsWith('.l5') ? newName : `${newName}.l5`;
  }

  const body = new FormData();
  body.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  body.append(
    'file',
    new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })
  );

  const res = await driveRequest(`${UPLOAD_API}/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`, {
    method: 'PATCH',
    body,
  });
  if (!res.ok) throw new Error('Failed to update file');
  return res.json();
}

/** Delete (trash) a file on Drive */
export async function deleteFile(fileId: string): Promise<void> {
  const res = await driveRequest(`${DRIVE_API}/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) throw new Error('Failed to delete file');
}
