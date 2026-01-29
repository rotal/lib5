import { create } from 'zustand';

export interface UserInfo {
  email: string;
  name: string;
  picture: string;
}

interface AuthState {
  accessToken: string | null;
  user: UserInfo | null;
  currentDriveFileId: string | null;

  setAuth: (token: string, user: UserInfo) => void;
  clearAuth: () => void;
  setCurrentDriveFileId: (id: string | null) => void;
}

function loadSession(): { accessToken: string | null; user: UserInfo | null } {
  try {
    const token = sessionStorage.getItem('lib5_token');
    const userJson = sessionStorage.getItem('lib5_user');
    if (token && userJson) {
      return { accessToken: token, user: JSON.parse(userJson) };
    }
  } catch { /* ignore */ }
  return { accessToken: null, user: null };
}

function saveSession(token: string, user: UserInfo) {
  sessionStorage.setItem('lib5_token', token);
  sessionStorage.setItem('lib5_user', JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem('lib5_token');
  sessionStorage.removeItem('lib5_user');
}

const restored = loadSession();

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: restored.accessToken,
  user: restored.user,
  currentDriveFileId: null,

  setAuth: (token, user) => {
    saveSession(token, user);
    set({ accessToken: token, user });
  },
  clearAuth: () => {
    clearSession();
    set({ accessToken: null, user: null, currentDriveFileId: null });
  },
  setCurrentDriveFileId: (id) => set({ currentDriveFileId: id }),
}));
