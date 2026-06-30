import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LucideIcon, ArrowRight, LayoutGrid, Star } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import {
  favoritoIdPath,
  ordenarComFavoritosPrimeiro,
  useNavegacaoFavoritos,
} from '../../lib/navegacaoFavoritos';
import { FavoritoEstrelaButton } from './FavoritoEstrelaButton';

interface MenuItem {
    icon: LucideIcon;
    label: string;
    path: string;
    description?: string;
    color?: string;
    /** Código da rotina, ex: '201', '301' */
    code?: string;
}

interface ModuleMenuProps {
    title: string;
    subtitle: string;
    items: MenuItem[];
    /** Cor de acento do módulo (hex) — usada no header. Padrão: #1e3a5f */
    accentColor?: string;
    children?: React.ReactNode;
}

export const ModuleMenu: React.FC<ModuleMenuProps> = ({
    title,
    subtitle,
    items,
    accentColor = '#1e3a5f',
    children,
}) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { favoritos, isFavorito, toggle } = useNavegacaoFavoritos(user?.id);

    const itemsOrdenados = useMemo(
        () =>
            ordenarComFavoritosPrimeiro(items, favoritos, (item) =>
                favoritoIdPath(item.path),
            ),
        [items, favoritos],
    );

    return (
        <div className="space-y-6">
            {/* ── HEADER DO MÓDULO ── */}
            <header
                className="relative overflow-hidden rounded-2xl text-white"
                style={{
                    background: `linear-gradient(135deg, ${accentColor} 0%, #0f2342 100%)`,
                }}
            >
                {/* Dot-grid decorativo */}
                <div className="absolute inset-0 pointer-events-none">
                    <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id={`dots-${title}`} x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                                <circle cx="1" cy="1" r="1" fill="white" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill={`url(#dots-${title})`} />
                    </svg>
                    <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/5 blur-3xl" />
                </div>

                <div className="relative z-10 px-8 py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
                            <LayoutGrid className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-extrabold tracking-tight text-white leading-tight">
                                {title}
                            </h1>
                            <p className="text-sm text-blue-200 mt-0.5 font-medium">{subtitle}</p>
                        </div>
                    </div>
                    <div className="flex-shrink-0 bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-blue-200 mb-0.5">Rotinas</p>
                        <p className="text-xl font-black text-white leading-none">{items.length}</p>
                    </div>
                </div>
            </header>

            {favoritos.length > 0 && (
                <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        Acesso rápido
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {favoritos
                            .filter((f) => items.some((i) => favoritoIdPath(i.path) === f.id))
                            .map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => navigate(f.path)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm hover:border-amber-300 hover:shadow transition-all dark:bg-slate-900 dark:border-amber-900 dark:text-white"
                                >
                                    {f.label}
                                    <ArrowRight className="h-3 w-3 text-amber-500" />
                                </button>
                            ))}
                    </div>
                </section>
            )}

            {children}

            {/* ── GRID DE ROTINAS ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {itemsOrdenados.map((item, idx) => {
                    const seq = String(idx + 1).padStart(2, '0');
                    const favId = favoritoIdPath(item.path);
                    const favAtivo = isFavorito(favId);
                    return (
                        <div
                            key={item.path}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(item.path)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(item.path);
                                }
                            }}
                            className="group relative flex items-start gap-4 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg text-left transition-all duration-200 overflow-hidden cursor-pointer"
                        >
                            {/* Faixa lateral de cor */}
                            <div
                                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-200 group-hover:w-1"
                                style={{ backgroundColor: item.color || accentColor }}
                            />

                            {/* Ícone */}
                            <div
                                className="flex-shrink-0 rounded-xl p-2.5 mt-0.5 group-hover:scale-105 transition-transform duration-200"
                                style={{ backgroundColor: `${item.color || accentColor}18` }}
                            >
                                <item.icon
                                    className="h-5 w-5"
                                    style={{ color: item.color || accentColor }}
                                />
                            </div>

                            {/* Textos */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span
                                        className="text-[9px] font-black uppercase tracking-widest"
                                        style={{ color: item.color || accentColor }}
                                    >
                                        {item.code || seq}
                                    </span>
                                </div>
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                                    {item.label}
                                </h3>
                                {item.description && (
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                                        {item.description}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col items-end gap-1 mt-0.5 shrink-0">
                                <FavoritoEstrelaButton
                                    ativo={favAtivo}
                                    onToggle={() =>
                                        toggle({
                                            id: favId,
                                            label: item.label,
                                            path: item.path,
                                        })
                                    }
                                />
                                <ArrowRight
                                    className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── RODAPÉ ── */}
            <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest text-center select-none">
                APex-Plan ERP · {title}
            </p>
        </div>
    );
};
