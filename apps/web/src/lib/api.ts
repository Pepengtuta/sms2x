const BASE = "";

function accessToken() {
  return localStorage.getItem("jwt") ?? "";
}

function refreshToken() {
  return localStorage.getItem("refreshToken") ?? "";
}

export function clearSession() {
  localStorage.removeItem("jwt");
  localStorage.removeItem("refreshToken");
}

let refreshInFlight: Promise<boolean> | null = null;

// Exchange the refresh token for a new access token. Concurrent callers share one request.
async function refreshSession(): Promise<boolean> {
  if (!refreshToken()) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(BASE + "/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: refreshToken() }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        localStorage.setItem("jwt", data.token);
        localStorage.setItem("refreshToken", data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string) =>
    fetch(BASE + path, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
      ...init,
    });

  let res = await send(accessToken());

  // Never auto-refresh on auth endpoints — a failed login is a 401 we must surface.
  if (res.status === 401 && !path.startsWith("/auth/") && (await refreshSession())) {
    res = await send(accessToken());
  }

  if (!res.ok) {
    // Session is dead and could not be refreshed — send the user back to login.
    if (res.status === 401 && !path.startsWith("/auth/")) {
      clearSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error?.message ?? res.statusText), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  refresh: refreshSession,
  clearSession,
};
