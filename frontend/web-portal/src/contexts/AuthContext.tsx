'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { UserRole } from '@fadl/types';

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

  useEffect(() => {
    const stored = localStorage.getItem('fadl_token');
    const storedUser = localStorage.getItem('fadl_user');
    if (stored && storedUser) {
      setToken(stored);
      setUser(JSON.parse(storedUser) as AuthUser);
    }
    setIsLoading(false);
  }, []);

  function login(newToken: string, newUser: AuthUser) {
    localStorage.setItem('fadl_token', newToken);
    localStorage.setItem('fadl_user', JSON.stringify(newUser));
    // Store the JWT itself as a cookie so middleware can verify its signature.
    // 24-hour expiry matches typical token lifetime.
    document.cookie = `fadl_token=${newToken}; path=/; SameSite=Strict; max-age=${60 * 60 * 24}`;
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem('fadl_token');
    localStorage.removeItem('fadl_user');
    document.cookie = 'fadl_token=; path=/; max-age=0';
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
