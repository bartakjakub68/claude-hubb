import { useState, useEffect, createContext, useContext } from 'react';
import { login as apiLogin, getMe, setToken, getToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken(); // zkusí hub token i vlastní token
    if (t) {
      getMe()
        .then(d => setUser(d.user))
        .catch(() => {
          // Token neplatný — smaž oba
          localStorage.removeItem('auth_token');
          localStorage.removeItem('at-token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
