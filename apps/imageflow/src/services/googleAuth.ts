import { useAuthStore, type UserInfo } from '../store/authStore';

const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient: GoogleTokenClient | null = null;
let gisLoaded = false;

function getClientId(): string | null {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? null;
}

export function isGoogleAuthAvailable(): boolean {
  return !!getClientId();
}

function loadGisScript(): Promise<void> {
  if (gisLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${GIS_SRC}"]`)) {
      gisLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      gisLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export async function loginWithGoogle(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Google Client ID not configured');

  await loadGisScript();

  return new Promise((resolve, reject) => {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        try {
          const user = await fetchUserInfo(response.access_token);
          useAuthStore.getState().setAuth(response.access_token, user);
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      error_callback: (error) => {
        reject(new Error(error.message || 'OAuth error'));
      },
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function fetchUserInfo(token: string): Promise<UserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  const data = await res.json();
  return {
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}

export function logout(): void {
  const token = useAuthStore.getState().accessToken;
  if (token && window.google) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  useAuthStore.getState().clearAuth();
  tokenClient = null;
}
