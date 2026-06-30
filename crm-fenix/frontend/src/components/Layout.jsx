import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function MenuLink({ to, children }) {
  const location = useLocation();
  const active = location.pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`rounded px-3 py-2 text-sm font-medium ${
        active ? "bg-fenix-blue text-white" : "text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="bg-fenix-blue text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <h1 className="font-bold">CRM Fênix Funerária</h1>
          <div className="flex items-center gap-3 text-sm">
            <span>{user?.name}</span>
            <button onClick={logout} className="rounded bg-white/20 px-3 py-1 hover:bg-white/30">
              Sair
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-4 px-4 py-4">
        <aside className="w-56 rounded bg-white p-3 shadow">
          <nav className="flex flex-col gap-2">
            <MenuLink to="/dashboard">Dashboard</MenuLink>
            <MenuLink to="/clientes">Clientes</MenuLink>
            <MenuLink to="/contatos">Contatos</MenuLink>
          </nav>
        </aside>
        <main className="flex-1 rounded bg-white p-4 shadow">{children}</main>
      </div>
    </div>
  );
}
