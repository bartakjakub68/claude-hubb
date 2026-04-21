/**
 * auth-check.js — vložte do každé aplikace
 * Použití: <script src="https://vas-server.com/auth-check.js"></script>
 *
 * Po načtení je dostupný objekt: window.AuthUser
 *   AuthUser.id, AuthUser.jmeno, AuthUser.email, AuthUser.role
 *
 * Pokud uživatel není přihlášen → automaticky přesměruje na login.
 */
(function () {
  const LOGIN_URL = '/'; // URL přihlašovací stránky
  const API_BASE  = '';  // prázdné = stejná doména

  function parseJWT(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64));
    } catch (e) {
      return null;
    }
  }

  function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_name');
    window.location.href = LOGIN_URL;
  }

  const token = localStorage.getItem('auth_token');

  if (!token) {
    window.location.href = LOGIN_URL;
    throw new Error('Not authenticated');
  }

  const payload = parseJWT(token);

  if (!payload || payload.exp * 1000 < Date.now()) {
    logout();
    throw new Error('Token expired');
  }

  // Globální objekt s info o uživateli
  window.AuthUser = {
    id:        payload.id,
    jmeno:     payload.jmeno,
    email:     payload.email,
    role:      payload.role,
    manazer_id: payload.manazer_id,
    token:     token,
    logout:    logout,
    isAdmin:   () => payload.role === 'admin',
    isManazer: () => payload.role === 'manazer',
    isPoradce: () => payload.role === 'poradce',
    authHeader: () => ({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' })
  };

})();
