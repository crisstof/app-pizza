import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "@/api";
import type { AuthClient } from "@/api";

type AuthContextValue = {
  client: AuthClient | null;
  loading: boolean;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<AuthClient | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setClient(await api.fetchMe());
    } catch {
      setClient(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function register(input: { name: string; email: string; password: string }) {
    setClient(await api.register(input));
  }

  async function login(input: { email: string; password: string }) {
    setClient(await api.login(input));
  }

  async function logout() {
    await api.logout();
    setClient(null);
  }

  return (
    <AuthContext.Provider value={{ client, loading, register, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
