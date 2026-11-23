// src/lib/api.ts
// Central API base URL resolver.
// Dev: VITE_API_BASE_URL empty -> uses Vite proxy '/api' -> localhost:8787
// Android (Capacitor): must set VITE_API_BASE_URL=https://<hosted-api-url> at build time.
const rawBase = (import.meta.env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  return rawBase ? rawBase + path : path;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
