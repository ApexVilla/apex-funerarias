import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  RefreshCw,
  LayoutDashboard,
  ClipboardList,
  Users,
  HandHeart,
  DollarSign,
  BarChart,
  Settings,
  Coins,
  FileText,
  Boxes,
  Car,
  Wallet,
  Timer,
  Files,
  MessageCircle,
  Landmark,
  CreditCard,
  Receipt,
  ArrowLeftRight,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Activity,
  BadgePercent,
  type LucideIcon,
} from 'lucide-react';
import { useTabs } from '../../lib/TabsContext';
import { motion, AnimatePresence } from 'framer-motion';

const SPRING_TAB = { type: 'spring' as const, stiffness: 420, damping: 34 };
const SPRING_PILL = { type: 'spring' as const, stiffness: 380, damping: 32 };

function getTabIcon(path: string): LucideIcon {
  const p = path.toLowerCase().split('?')[0];

  if (p.startsWith('/inicio')) return LayoutDashboard;
  if (p.startsWith('/dashboard')) return BarChart;

  if (p.includes('/financeiro/tesouraria')) return Landmark;
  if (p.includes('/financeiro/contas-pagar')) return CreditCard;
  if (p.includes('/financeiro/contas-receber')) return Receipt;
  if (p.includes('/financeiro/baixa-parcelas')) return Coins;
  if (p.includes('/financeiro/fluxo-caixa')) return ArrowLeftRight;
  if (p.includes('/financeiro/contas-bancarias')) return Building2;
  if (p.includes('/financeiro/plano-contas') || p.includes('/financeiro/naturezas') || p.includes('/financeiro/centros-custo')) return FileText;
  if (p.startsWith('/financeiro')) return DollarSign;

  if (p.includes('/rh/presenca-banco-horas')) return Activity;
  if (p.includes('/rh/espelho-ponto')) return CalendarClock;
  if (p.includes('/rh/colaboradores')) return Users;
  if (p.includes('/rh/ferias')) return CalendarClock;
  if (p.includes('/rh/beneficios')) return Wallet;
  if (p.includes('/rh/ocorrencias')) return ClipboardCheck;
  if (p.includes('/rh/comissoes')) return BadgePercent;
  if (p.startsWith('/rh')) return Users;

  if (p.includes('/ponto/jornadas')) return Timer;
  if (p.includes('/ponto/espelho')) return CalendarClock;
  if (p.includes('/ponto/registro')) return Clock;
  if (p.startsWith('/ponto')) return Timer;

  if (p.startsWith('/planos')) return ClipboardList;
  if (p.startsWith('/venda')) return Coins;
  if (p.startsWith('/atendimentos')) return HandHeart;
  if (p.startsWith('/estoque')) return Boxes;
  if (p.startsWith('/frota')) return Car;
  if (p.startsWith('/cobradores')) return Wallet;
  if (p.startsWith('/comissoes')) return BadgePercent;
  if (p.startsWith('/documentos')) return Files;
  if (p.startsWith('/clientes')) return Users;
  if (p.startsWith('/crm')) return MessageCircle;
  if (p.startsWith('/config')) return Settings;
  if (p.startsWith('/relatorios')) return BarChart;

  return FileText;
}

export const TabBar: React.FC = () => {
  const { tabs, activeTab, closeTab, clearTabs } = useTabs();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

  if (tabs.length === 0) return null;

  return (
    <div className="sticky top-16 z-20 w-full border-b border-slate-200/70 dark:border-slate-800/70 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-lg supports-[backdrop-filter]:bg-slate-50/80 dark:supports-[backdrop-filter]:bg-slate-950/80">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 lg:px-8 h-11 max-w-[1600px] mx-auto">
        <div
          ref={containerRef}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 flex-1 min-w-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.path;
              const Icon = getTabIcon(tab.path);

              return (
                <motion.button
                  key={tab.path}
                  layout
                  initial={{ opacity: 0, scale: 0.92, x: -6 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: 6, transition: { duration: 0.15 } }}
                  transition={{
                    ...SPRING_TAB,
                    layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                  }}
                  data-active={isActive}
                  onClick={() => navigate(tab.path)}
                  className={`group relative flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer min-w-0 border transition-[color,background-color,border-color,box-shadow] duration-300 ease-out ${
                    isActive
                      ? 'text-white border-transparent shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-100 hover:bg-white/80 dark:hover:bg-slate-800/60 hover:border-slate-200/80 dark:hover:border-slate-700/80 hover:shadow-sm'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 rounded-full bg-[var(--accent-color,#2563eb)] shadow-[0_2px_10px_-2px_color-mix(in_srgb,var(--accent-color,#2563eb),transparent_55%)] -z-10"
                      transition={SPRING_PILL}
                    />
                  )}

                  <span
                    className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-700 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </span>

                  <span className="truncate max-w-[11rem] sm:max-w-[14rem]">{tab.label}</span>

                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Fechar aba ${tab.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.path);
                    }}
                    className={`ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'text-white/70 hover:text-white hover:bg-white/20'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
                    } opacity-100 md:opacity-0 md:scale-75 md:group-hover:opacity-100 md:group-hover:scale-100`}
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        <button
          onClick={clearTabs}
          title="Fechar todas as abas"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/90 dark:border-slate-700/90 bg-white/70 dark:bg-slate-900/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 shadow-sm transition-all duration-300 hover:border-red-200 dark:hover:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 active:scale-95 cursor-pointer"
        >
          <RefreshCw className="h-3 w-3 transition-transform duration-500 group-hover:rotate-180" />
          <span className="hidden sm:inline">Limpar</span>
        </button>
      </div>
    </div>
  );
};
