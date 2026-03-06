import { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthUser = {
  sub: string;
  name: string;
  email: string;
  picture?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  googleConfigured: boolean;
  setUserFromCredential: (credential: string) => void;
  setUserFromProfile: (profile: AuthUser) => void;
  signOut: () => void;
};

const STORAGE_KEY = "lawyerbot-auth-user";
const AuthContext = createContext<AuthContextValue | null>(null);

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw) as AuthUser);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const setUserFromCredential = (credential: string) => {
    const payload = decodeJwtPayload(credential);
    if (!payload) return;
    const parsed: AuthUser = {
      sub: String(payload.sub ?? ""),
      name: String(payload.name ?? "Google User"),
      email: String(payload.email ?? ""),
      picture: payload.picture ? String(payload.picture) : undefined,
    };
    if (!parsed.sub) return;
    setUser(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const setUserFromProfile = (profile: AuthUser) => {
    if (!profile.sub) return;
    setUser(profile);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      googleConfigured: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID),
      setUserFromCredential,
      setUserFromProfile,
      signOut,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
