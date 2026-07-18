import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, AuthUser, Household, getToken, setToken, clearToken } from '../services/api';

interface AuthContextValue {
  user: AuthUser | null;
  household: Household | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { email: string; password: string; name: string; householdName?: string; inviteCode?: string }) => Promise<void>;
  logout: () => void;
  refreshHousehold: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const response = await authApi.me();
      setUser(response.data.user);
      setHousehold(response.data.household);
    } catch {
      clearToken();
      setUser(null);
      setHousehold(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (email: string, password: string) => {
    const response = await authApi.login({ email, password });
    setToken(response.data.token);
    setUser(response.data.user);
    await loadMe();
  };

  const signup = async (data: { email: string; password: string; name: string; householdName?: string; inviteCode?: string }) => {
    const response = await authApi.signup(data);
    setToken(response.data.token);
    setUser(response.data.user);
    await loadMe();
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setHousehold(null);
  };

  return (
    <AuthContext.Provider value={{ user, household, loading, login, signup, logout, refreshHousehold: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
