import { useState, useEffect, createContext, useContext } from 'react';
import { apiMe } from './api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('auth_token');
    if (t) {
      apiMe()
        .then(d => setUser(d))
        .catch(() => localStorage.removeItem('auth_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('auth_token');
    window.location.href = '/';
  };

  return <Ctx.Provider value={{ user, logout, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
