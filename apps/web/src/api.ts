import { authTokensSchema } from "@classroom-tracker/shared";

const TOKEN_KEY = "ct_access_token";

let refreshInFlight: Promise<boolean> | null = null;

/**
 * API base URL. Empty `VITE_API_BASE_URL` keeps the Vite `/api` proxy for local
 * dev. Production sets this to the Render/Railway origin (no trailing slash).
 */
export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }
  return "/api";
}

function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path}`;
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isAuthEntryPath(path: string): boolean {
  return (
    path === "/auth/login" ||
    path === "/auth/register" ||
    path === "/auth/forgot-password" ||
    path === "/auth/reset-password" ||
    path === "/auth/refresh"
  );
}

function sendToLogin(): void {
  clearAccessToken();
  if (globalThis.location.pathname !== "/login") {
    globalThis.location.assign("/login");
  }
}

async function performRefresh(): Promise<boolean> {
  const response = await fetch(apiUrl("/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    sendToLogin();
    return false;
  }

  const data: unknown = await response.json().catch(() => null);
  const parsed = authTokensSchema.safeParse(data);
  if (!parsed.success) {
    sendToLogin();
    return false;
  }

  setAccessToken(parsed.data.accessToken);
  return true;
}

/** One refresh at a time. Parallel 401s share this promise. */
function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  hasRetried = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && !hasRetried && !isAuthEntryPath(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, init, true);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Authenticated file download (CSV, etc.). Retries once after refresh on 401.
 */
export async function apiDownload(
  path: string,
  fallbackFilename: string,
  hasRetried = false,
): Promise<void> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), {
    headers,
    credentials: "include",
  });

  if (response.status === 401 && !hasRetried && !isAuthEntryPath(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiDownload(path, fallbackFilename, true);
    }
  }

  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));
    const message =
      typeof data === "object" &&
      data &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Download failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
    fallbackFilename;
  triggerBrowserDownload(blob, filename);
}

/** Unauthenticated download (parent share links). */
export async function publicDownload(
  path: string,
  fallbackFilename: string,
): Promise<void> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new ApiError(`Download failed (${response.status})`, response.status);
  }
  const blob = await response.blob();
  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
    fallbackFilename;
  triggerBrowserDownload(blob, filename);
}
