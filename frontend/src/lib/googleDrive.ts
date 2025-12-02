/**
 * Google Drive sync for Sonar Ledger
 * Stores data in user's own Google Drive (no server needed)
 */

/// <reference path="../types/google.d.ts" />

// Google API configuration
// You'll need to create a project at https://console.cloud.google.com
// 1. Enable Google Drive API
// 2. Create OAuth 2.0 Client ID (Web application)
// 3. Add authorized JavaScript origins (e.g., http://localhost:5173, https://yourusername.github.io)
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

const DATA_FILENAME = 'sonar-ledger-data.json';
const TOKEN_STORAGE_KEY = 'sonar-ledger-google-token';

type TokenClient = google.accounts.oauth2.TokenClient;

let tokenClient: TokenClient | null = null;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

// Load cached token on module init
try {
  const cached = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (cached) {
    const { token, expiry } = JSON.parse(cached);
    // Only use if not expired (with 5 min buffer)
    if (expiry && Date.now() < expiry - 5 * 60 * 1000) {
      accessToken = token;
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }
} catch {
  // Ignore errors
}

/**
 * Save token to localStorage
 */
function cacheToken(token: string, expiresIn: number): void {
  try {
    const expiry = Date.now() + expiresIn * 1000;
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiry }));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear cached token
 */
function clearCachedToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export type SyncData = {
  statements: unknown[];
  userMappings: Record<string, string>;
  version: number;
  lastModified: string;
};

export type SyncStatus = 'idle' | 'loading' | 'syncing' | 'success' | 'error';

/**
 * Load the Google API client library
 */
export async function initGoogleApi(): Promise<boolean> {
  if (!CLIENT_ID) {
    console.warn('Google Drive sync not configured. Set VITE_GOOGLE_CLIENT_ID in .env');
    return false;
  }

  return new Promise((resolve) => {
    // Load GAPI
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
          });
          gapiInited = true;
          maybeEnableSync(resolve);
        } catch (err) {
          console.error('Error initializing GAPI:', err);
          resolve(false);
        }
      });
    };
    document.body.appendChild(gapiScript);

    // Load GIS (Google Identity Services)
    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response: { access_token?: string; expires_in?: number }) => {
            if (response.access_token) {
              accessToken = response.access_token;
              // Cache token with expiry (default 1 hour if not specified)
              cacheToken(response.access_token, response.expires_in || 3600);
            }
          },
        });
        gisInited = true;
        maybeEnableSync(resolve);
      } catch (err) {
        console.error('Error initializing GIS:', err);
        resolve(false);
      }
    };
    document.body.appendChild(gisScript);
  });
}

function maybeEnableSync(resolve: (value: boolean) => void) {
  if (gapiInited && gisInited) {
    resolve(true);
  }
}

/**
 * Check if Google Drive sync is available
 */
export function isGoogleDriveAvailable(): boolean {
  return gapiInited && gisInited && !!CLIENT_ID;
}

/**
 * Check if user is signed in
 */
export function isSignedIn(): boolean {
  return !!accessToken;
}

/**
 * Sign in to Google
 */
export async function signIn(): Promise<boolean> {
  if (!tokenClient) {
    console.error('Token client not initialized');
    return false;
  }

  return new Promise((resolve) => {
    tokenClient!.callback = (response) => {
      if (response.access_token) {
        accessToken = response.access_token;
        resolve(true);
      } else {
        resolve(false);
      }
    };

    if (accessToken === null) {
      // First time - prompt for consent
      tokenClient!.requestAccessToken({ prompt: 'consent' });
    } else {
      // Already have token - just refresh
      tokenClient!.requestAccessToken({ prompt: '' });
    }
  });
}

/**
 * Sign out from Google
 */
export function signOut(): void {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
      clearCachedToken();
    });
  }
  clearCachedToken();
}

/**
 * Find the data file in Google Drive appDataFolder
 */
async function findDataFile(): Promise<string | null> {
  try {
    const response = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      q: `name='${DATA_FILENAME}'`,
      fields: 'files(id, name, modifiedTime)',
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      return files[0].id!;
    }
    return null;
  } catch (err) {
    console.error('Error finding data file:', err);
    return null;
  }
}

/**
 * Save data to Google Drive
 */
export async function saveToGoogleDrive(data: SyncData): Promise<boolean> {
  if (!accessToken) {
    console.error('Not signed in');
    return false;
  }

  try {
    const fileId = await findDataFile();
    const fileContent = JSON.stringify(data, null, 2);
    const blob = new Blob([fileContent], { type: 'application/json' });

    if (fileId) {
      // Update existing file
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: blob,
      });
    } else {
      // Create new file in appDataFolder
      const metadata = {
        name: DATA_FILENAME,
        parents: ['appDataFolder'],
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });
    }

    console.log('Data saved to Google Drive');
    return true;
  } catch (err) {
    console.error('Error saving to Google Drive:', err);
    return false;
  }
}

/**
 * Load data from Google Drive
 */
export async function loadFromGoogleDrive(): Promise<SyncData | null> {
  if (!accessToken) {
    console.error('Not signed in');
    return null;
  }

  try {
    const fileId = await findDataFile();
    if (!fileId) {
      console.log('No data file found in Google Drive');
      return null;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to load file: ${response.status}`);
    }

    const data = await response.json();
    console.log('Data loaded from Google Drive');
    return data as SyncData;
  } catch (err) {
    console.error('Error loading from Google Drive:', err);
    return null;
  }
}

/**
 * Get last modified time of the data file
 */
export async function getLastModified(): Promise<Date | null> {
  if (!accessToken) return null;

  try {
    const response = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      q: `name='${DATA_FILENAME}'`,
      fields: 'files(id, modifiedTime)',
    });

    const files = response.result.files;
    if (files && files.length > 0 && files[0].modifiedTime) {
      return new Date(files[0].modifiedTime);
    }
    return null;
  } catch (err) {
    console.error('Error getting last modified:', err);
    return null;
  }
}
