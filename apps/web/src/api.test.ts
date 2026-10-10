import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiBaseUrl,
  apiFetch,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "./api";

afterEach(() => {
  clearAccessToken();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiBaseUrl", () => {
  it("defaults to the Vite /api proxy path", () => {
    expect(apiBaseUrl()).toBe("/api");
  });
});

describe("apiFetch refresh on 401", () => {
  it("refreshes once and retries the original request with the new token", async () => {
    setAccessToken("expired-token");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) {
          return jsonResponse(200, {
            accessToken: "fresh-token",
            user: {
              id: "user_1",
              name: "Priya",
              email: "teacher@demo.local",
              role: "TEACHER",
            },
          });
        }
        const auth = new Headers(init?.headers).get("Authorization");
        if (auth === "Bearer expired-token") {
          return jsonResponse(401, {
            error: "Invalid or expired access token",
          });
        }
        return jsonResponse(200, { ok: true });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>("/classes");

    expect(result.ok).toBe(true);
    expect(getAccessToken()).toBe("fresh-token");
    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
    const classCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/classes"),
    );
    expect(classCalls).toHaveLength(2);
    expect(new Headers(classCalls[1]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
  });

  it("shares one refresh across parallel 401s", async () => {
    setAccessToken("expired-token");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) {
          return jsonResponse(200, {
            accessToken: "fresh-token",
            user: {
              id: "user_1",
              name: "Priya",
              email: "teacher@demo.local",
              role: "TEACHER",
            },
          });
        }
        const auth = new Headers(init?.headers).get("Authorization");
        if (auth === "Bearer expired-token") {
          return jsonResponse(401, {
            error: "Invalid or expired access token",
          });
        }
        return jsonResponse(200, { ok: true });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      apiFetch<{ ok: boolean }>("/classes"),
      apiFetch<{ ok: boolean }>("/schools"),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("clears the token and sends the user to login when refresh fails", async () => {
    setAccessToken("expired-token");
    const assign = vi.fn();
    vi.stubGlobal("location", { assign, pathname: "/" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(401, { error: "Invalid or expired refresh token" });
      }
      return jsonResponse(401, { error: "Invalid or expired access token" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/classes")).rejects.toThrow(/expired|failed/i);
    expect(getAccessToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
