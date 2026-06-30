import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { routeLabels } from '../components/layout/Header';

export interface Tab {
  path: string;
  label: string;
  lastAccessed: number;
}

interface TabsContextType {
  tabs: Tab[];
  activeTab: string | null;
  addTab: (path: string) => void;
  closeTab: (path: string) => void;
  clearTabs: () => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

// Helper to determine the tab label professionally
export function getTabLabel(pathname: string): string {
  // Try exact match first
  if (routeLabels[pathname]) {
    return routeLabels[pathname];
  }

  // Handle dynamic paths like /clientes/123/editar or /clientes/123
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const mainSection = parts[0]; // e.g. "clientes", "planos", "frota"
    const subRoute = parts[parts.length - 1]; // e.g. "editar", "novo", or the ID
    
    // Capitalize function
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    
    // Custom friendly section names in Portuguese
    const sectionNames: Record<string, string> = {
      clientes: 'Cliente',
      planos: 'Plano',
      financeiro: 'Financeiro',
      atendimentos: 'Atendimento',
      estoque: 'Estoque',
      frota: 'Frota',
      cobradores: 'Cobrador',
      ponto: 'Ponto',
      relatorios: 'Relatório'
    };

    const sectionName = sectionNames[mainSection] || cap(mainSection);

    if (subRoute === 'editar') {
      return `Editar ${sectionName}`;
    }
    if (subRoute === 'novo' || subRoute === 'nova') {
      return `Novo ${sectionName}`;
    }
    
    // If last part is an ID or not a known keyword
    const isId = /^\d+$/.test(subRoute) || subRoute.length > 8;
    if (isId || parts.length === 2) {
      return `Detalhes ${sectionName}`;
    }
  }

  return 'Página';
}

// Helper to retrieve the last visited subpath of a module for persistence
export function resolveModulePath(prefix: string, defaultPath: string): string {
  try {
    const saved = localStorage.getItem(`apex_module_last_path_${prefix}`);
    return saved || defaultPath;
  } catch {
    return defaultPath;
  }
}

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Load initial tabs from localStorage
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const saved = localStorage.getItem('apex_open_tabs');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Erro ao ler abas do localStorage', e);
      return [];
    }
  });

  const [activeTab, setActiveTab] = useState<string | null>(location.pathname);

  // Sync tabs with localStorage
  useEffect(() => {
    localStorage.setItem('apex_open_tabs', JSON.stringify(tabs));
  }, [tabs]);

  // Keep track of the active tab based on router location & persist last active module path
  useEffect(() => {
    setActiveTab(location.pathname);
    addTab(location.pathname);

    // Save the last active sub-route under the main module prefix to enable persistent navigation
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const modulePrefix = `/${parts[0]}`;
      const ignoredPrefixes = ['/', '/inicio', '/dashboard', '/login'];
      if (!ignoredPrefixes.includes(modulePrefix)) {
        const fullPath = location.pathname + location.search;
        localStorage.setItem(`apex_module_last_path_${modulePrefix}`, fullPath);
      }
    }
  }, [location.pathname, location.search]);

  const addTab = (path: string) => {
    // Ignore login, password resets, first access, etc.
    if (!path || path === '/' || path === '/primeiro-acesso' || path === '/redefinir-senha') return;

    const label = getTabLabel(path);
    const now = Date.now();

    setTabs((prev) => {
      // 1. If tab already exists, update its lastAccessed time and keep it
      const existingIndex = prev.findIndex((t) => t.path === path);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], lastAccessed: now, label };
        return updated;
      }

      // 2. If we reached the limit of 6 open tabs, remove the least recently used one (LRU)
      if (prev.length >= 6) {
        let oldestIndex = 0;
        let oldestTime = prev[0].lastAccessed;

        for (let i = 1; i < prev.length; i++) {
          if (prev[i].lastAccessed < oldestTime) {
            oldestTime = prev[i].lastAccessed;
            oldestIndex = i;
          }
        }

        // Filter out the oldest and append the new tab
        const filtered = prev.filter((_, idx) => idx !== oldestIndex);
        return [...filtered, { path, label, lastAccessed: now }];
      }

      // 3. Otherwise, just append the new tab
      return [...prev, { path, label, lastAccessed: now }];
    });
  };

  const closeTab = (path: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.path !== path);

      // If we are closing the active tab, navigate to the next most recently used tab
      if (location.pathname === path) {
        if (newTabs.length > 0) {
          // Sort remaining tabs by lastAccessed descending to get the MRU
          const sorted = [...newTabs].sort((a, b) => b.lastAccessed - a.lastAccessed);
          const nextActive = sorted[0];
          setTimeout(() => navigate(nextActive.path), 0);
        } else {
          // If no tabs remain, go back to Início
          setTimeout(() => navigate('/inicio'), 0);
        }
      }

      return newTabs;
    });
  };

  const clearTabs = () => {
    setTabs([]);
    navigate('/inicio');
  };

  return (
    <TabsContext.Provider value={{ tabs, activeTab, addTab, closeTab, clearTabs }}>
      {children}
    </TabsContext.Provider>
  );
};

export const useTabs = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('useTabs deve ser usado dentro de um TabsProvider');
  }
  return context;
};
