import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  authTokensSchema,
  authUserSchema,
  type AuthUser,
} from "@classroom-tracker/shared";
import {
  apiFetch,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "./api";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (!getAccessToken()) {
        if (!cancelled) {
          setReady(true);
        }
        return;
      }
      try {
        const me = authUserSchema.parse(await apiFetch<unknown>("/auth/me"));
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        clearAccessToken();
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      async login(email: string, password: string) {
        const result = authTokensSchema.parse(
          await apiFetch<unknown>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          }),
        );
        setAccessToken(result.accessToken);
        setUser(result.user);
      },
      async logout() {
        try {
          await apiFetch<void>("/auth/logout", { method: "POST" });
        } finally {
          clearAccessToken();
          setUser(null);
        }
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
