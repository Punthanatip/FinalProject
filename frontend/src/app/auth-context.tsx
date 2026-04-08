"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

// ==================== Types ====================

interface User {
  sub: string;
  username: string;
  exp: number;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
}

// ==================== Context ====================

const AuthCtx = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  register: async () => {},
});

// ==================== Provider ====================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // ดึงข้อมูล user จาก cookie (ผ่าน /api/auth/me)
  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Login: ยิง POST /api/auth/login
  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || "Login failed");
    }

    const data = await res.json();
    // อัปเดต user state จาก response (cookie ถูก set โดย route.ts แล้ว)
    setUser({ sub: "", username: data.username, exp: 0 });
    router.push("/");
  }, [router]);

  // Register: ยิง POST /api/auth/register แล้ว redirect /dashboard
  const register = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || "Register failed");
    }

    const data = await res.json();
    setUser({ sub: "", username: data.username, exp: 0 });
    router.push("/");
  }, [router]);

  // Logout: ยิง POST /api/auth/logout แล้ว redirect /login
  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthCtx.Provider>
  );
}

// ==================== Hook ====================

export function useAuth() {
  return useContext(AuthCtx);
}
