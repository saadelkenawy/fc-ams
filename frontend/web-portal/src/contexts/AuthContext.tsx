'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import type { UserRole } from '@fadl/types';
import { setAccessToken, refreshAccessToken } from '@/lib/api';

interface AuthUser {
  id: string;
  nameEn: string;
  nameAr: string;
  role: UserRole;
  branchId: number;
  doctorId?: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Session restore: the access token lives in memory only, so on a fresh
  // page load we exchange the HttpOnly refresh cookie for a new one. The
  // user object (display data only) is cached in localStorage.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storedUser = localStorage.getItem('fadl_user');
      if (!storedUser) {
        setIsLoading(false);
        return;
      }
      const restored = await refreshAccessToken();
      if (cancelled) return;
      if (restored) {
        setToken(restored);
        setUser(JSON.parse(storedUser) as AuthUser);
      } else {
        localStorage.removeItem('fadl_user');
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function login(newToken: string, newUser: AuthUser) {
    // Tokens are set as HttpOnly cookies by the /api/auth/login route handler;
    // here we only keep the access token in memory and the user for display.
    localStorage.setItem('fadl_user', JSON.stringify(newUser));
    setAccessToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    void axios.post('/api/auth/logout').catch(() => undefined);
    localStorage.removeItem('fadl_user');
    setAccessToken(null);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
