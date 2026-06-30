import { createContext, useContext, useMemo, useState } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem("fenix_user");
    return saved ? JSON.parse(saved) : null;
  });

  async function login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    sessionStorage.setItem("fenix_token", data.token);
    sessionStorage.setItem("fenix_user", JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    sessionStorage.removeItem("fenix_token");
    sessionStorage.removeItem("fenix_user");
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro do AuthProvider");
  return ctx;
}
