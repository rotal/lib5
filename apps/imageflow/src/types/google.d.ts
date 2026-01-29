/** Google Identity Services (GIS) typings */

interface GoogleTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type: string; message: string }) => void;
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GoogleAccountsOAuth2 {
  initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
  revoke(token: string, callback?: () => void): void;
}

interface GoogleAccounts {
  oauth2: GoogleAccountsOAuth2;
}

interface Google {
  accounts: GoogleAccounts;
}

declare const google: Google;

interface Window {
  google?: Google;
}
