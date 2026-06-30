import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TabBar } from './TabBar';
import { TabsProvider } from '../../lib/TabsContext';
import { ApexLoader } from '../ui/ApexLoader';
import { RouteErrorBoundary } from '../ui/RouteErrorBoundary';
import {
  readSidebarCollapsedFromStorage,
  SIDEBAR_WIDTH_COLLAPSED_PX,
  SIDEBAR_WIDTH_EXPANDED_PX,
  writeSidebarCollapsedToStorage,
} from '../../lib/sidebarLayout';

const PageFallback: React.FC = () => (
  <div className="flex items-center justify-center py-32">
    <ApexLoader />
  </div>
);

export const Layout: React.FC = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedFromStorage);

  useEffect(() => {
    writeSidebarCollapsedToStorage(sidebarCollapsed);
    const w = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED_PX : SIDEBAR_WIDTH_EXPANDED_PX;
    document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
  }, [sidebarCollapsed]);

  const mainPadClass = sidebarCollapsed ? 'md:pl-[76px]' : 'md:pl-[280px]';

  return (
    <TabsProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 overflow-x-hidden transition-colors duration-300">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        <Header
          onMenuClick={() => setIsSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main
          className={`pt-16 min-h-screen w-full max-w-full transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${mainPadClass}`}
        >
          <TabBar />
          <div className="p-4 md:p-6 lg:p-8 max-w-full mx-auto min-w-0">
            <RouteErrorBoundary key={location.key}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </RouteErrorBoundary>
          </div>
        </main>
      </div>
    </TabsProvider>
  );
};
