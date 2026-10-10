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
