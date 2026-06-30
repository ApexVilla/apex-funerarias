import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelatorios, RelatorioConfig } from '../../lib/RelatoriosStore';
import { useAuth } from '../../lib/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { Card, Button, Input, Badge } from '../../components/ui/Components';
import {
    Search, Star, FileText, PieChart, Users, DollarSign,
    Activity, Shield, AlertTriangle, Briefcase, ChevronRight,
    TrendingUp, LayoutGrid, List, Clock, BookOpen, Package, Truck,
    Download, Printer, Filter, ChevronDown, Sparkles
} from 'lucide-react';

/* ─── Configuração dos Departamentos ─────────────────────────── */
const DEPARTAMENTOS: Record<string, {
    label: string;
    icon: React.ElementType;
    color: string;
    description: string;
}> = {
    financeiro: { label: 'Financeiro', icon: DollarSign, color: '#10b981', description: 'Fluxo de caixa, DRE, contas a pagar/receber e faturamento.' },
    comercial: { label: 'Comercial & Vendas', icon: BookOpen, color: '#3b82f6', description: 'Desempenho de vendas, conversão de leads e novos contratos.' },
    operacional: { label: 'Operacional', icon: Briefcase, color: '#f59e0b', description: 'Logística de serviços, escalas e controle de execução.' },
    estoque: { label: 'Estoque', icon: Package, color: '#8b5cf6', description: 'Movimentação de produtos, inventário e níveis de reposição.' },
    frota: { label: 'Frota', icon: Truck, color: '#ef4444', description: 'Gastos com veículos, manutenções e quilometragem.' },
    atendimento: { label: 'Atendimento', icon: FileText, color: '#06b6d4', description: 'Estatísticas de óbitos, tipos de serviço e satisfação.' },
    cobranca: { label: 'Cobrança', icon: TrendingUp, color: '#6366f1', description: 'Inadimplência, acordos e performance de cobradores.' },
    clientes: { label: 'Clientes', icon: Users, color: '#ec4899', description: 'Crescimento de base, perfil demográfico e retenção.' },
    rh: { label: 'RH & Pessoal', icon: Users, color: '#ec4899', description: 'Folha, comissões, treinamentos e desempenho.' },
    gerencial: { label: 'Gerencial (BI)', icon: PieChart, color: '#111827', description: 'Visão holística, indicadores chave (KPIs) e metas.' },
    auditoria: { label: 'Auditoria', icon: Shield, color: '#64748b', description: 'Logs de sistema, alterações críticas e conformidade.' }
};

/* ─── Card de Relatório ───────────────────────────────────────── */
const RelatorioCard: React.FC<{
    rel: RelatorioConfig;
    isFavorito: boolean;
    onToggleFavorito: () => void;
    viewMode: 'grid' | 'list';
    color: string;
}> = ({ rel, isFavorito, onToggleFavorito, viewMode, color }) => {
    const navigate = useNavigate();

    if (viewMode === 'list') {
        return (
            <div 
                onClick={() => navigate(`/relatorios/${rel.codigo}`)}
                className="group bg-white hover:bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center gap-4 transition-all hover:shadow-sm cursor-pointer"
            >
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}10`, color: color }}>
                    <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900 truncate group-hover:text-primary transition-colors">{rel.nome}</h4>
                        {isFavorito && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{rel.descricao}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                    <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase">
                        {rel.codigo}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                </div>
            </div>
        );
    }

    return (
        <Card 
            onClick={() => navigate(`/relatorios/${rel.codigo}`)}
            className="group relative overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1 border-gray-100 cursor-pointer bg-white"
        >
            <div className="absolute top-0 left-0 w-1.5 h-full transition-all group-hover:w-2" style={{ backgroundColor: color }}></div>
            
            <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                    <div 
                        className="p-3 rounded-xl transition-all group-hover:scale-110 shadow-sm"
                        style={{ backgroundColor: `${color}10`, color: color }}
                    >
                        <FileText className="h-6 w-6" />
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleFavorito(); }}
                        className={`p-2 rounded-full transition-all hover:scale-110 ${isFavorito ? 'bg-amber-50 text-amber-500 shadow-sm' : 'text-gray-300 hover:text-gray-400'}`}
                    >
                        <Star className={`h-4 w-4 ${isFavorito ? 'fill-current' : ''}`} />
                    </button>
                </div>

                <div>
                    <h4 className="font-extrabold text-gray-900 text-lg mb-1 group-hover:text-primary transition-colors leading-tight">
                        {rel.nome}
                    </h4>
                    <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed h-10">
                        {rel.descricao}
                    </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        <Clock className="h-3 w-3" />
                        Disponível
                    </div>
                    <div className="flex items-center gap-2">
                         <span className="text-[10px] font-mono font-bold text-gray-300 uppercase">
                            {rel.codigo}
                        </span>
                        <div className="p-1 rounded-full bg-gray-50 text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <ChevronRight className="h-4 w-4" />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

/* ─── Componente Principal ────────────────────────────────────── */
export const RelatoriosList: React.FC = () => {
    const { user } = useAuth();
    const { 
        relatorios, 
        favoritos, 
        loading, 
        loadRelatorios, 
        toggleFavorito 
    } = useRelatorios();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDept, setSelectedDept] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({
        financeiro: true,
        comercial: true,
        operacional: true,
        estoque: true,
        atendimento: true,
        gerencial: true
    });

    useEffect(() => {
        if (user) {
            loadRelatorios();
        }
    }, [user, loadRelatorios]);

    const filteredRelatorios = useMemo(() => {
        return relatorios.filter(r => {
            const matchesSearch = !searchTerm || 
                r.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.codigo?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDept = !selectedDept || r.categoria === selectedDept;
            return matchesSearch && matchesDept;
        });
    }, [relatorios, searchTerm, selectedDept]);

    const relatoriosPorDepto = useMemo(() => {
        return filteredRelatorios.reduce((acc, r) => {
            const depto = r.categoria || 'gerencial';
            if (!acc[depto]) acc[depto] = [];
            acc[depto].push(r);
            return acc;
        }, {} as Record<string, RelatorioConfig[]>);
    }, [filteredRelatorios]);

    const toggleDept = (dept: string) => {
        setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }));
    };

    const getDeptInfo = (key: string) => {
        return DEPARTAMENTOS[key] || { label: key, icon: FileText, color: '#6b7280', description: '' };
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-20 px-4 md:px-0">
            <PageHeader 
                title="Central de Relatórios" 
                subtitle="Analise dados, acompanhe indicadores e gere documentos estratégicos categorizados por departamento."
                actionButton={
                    <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <LayoutGrid className="h-5 w-5" />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <List className="h-5 w-5" />
                        </button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                {/* Sidebar Filtros */}
                <div className="lg:col-span-1 space-y-6 sticky top-24">
                    <Card className="p-5 space-y-6 bg-white/80 backdrop-blur-sm">
                        <div>
                            <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3 block">Busca Rápida</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Nome, código ou descrição..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 h-11 border-gray-200 focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3 block">Departamentos</label>
                            <div className="space-y-1">
                                <button
                                    onClick={() => setSelectedDept(null)}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                                        selectedDept === null 
                                            ? 'bg-primary text-white font-bold shadow-lg shadow-primary/20 scale-[1.02]' 
                                            : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <LayoutGrid className="h-4 w-4" /> Todos
                                    </span>
                                    <Badge variant={selectedDept === null ? 'secondary' : 'outline'} className="text-[10px]">{relatorios.length}</Badge>
                                </button>
                                {Object.entries(DEPARTAMENTOS).map(([key, info]) => {
                                    const count = relatorios.filter(r => r.categoria === key).length;
                                    if (count === 0 && selectedDept !== key) return null;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setSelectedDept(key)}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                                                selectedDept === key 
                                                    ? 'bg-primary text-white font-bold shadow-lg shadow-primary/20 scale-[1.02]' 
                                                    : 'text-gray-600 hover:bg-gray-100'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <info.icon className="h-4 w-4" /> {info.label}
                                            </span>
                                            <Badge variant={selectedDept === key ? 'secondary' : 'outline'} className="text-[10px]">{count}</Badge>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {favoritos.length > 0 && (
                            <div className="pt-4 border-t border-gray-100">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Meus Favoritos
                                </label>
                                <div className="space-y-2">
                                    {favoritos.slice(0, 5).map(fav => (
                                        <button
                                            key={fav.id}
                                            onClick={() => window.location.href = `#/relatorios/${fav.codigo}`}
                                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 hover:text-primary transition-all truncate"
                                        >
                                            • {fav.nome}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>

                    <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-5 text-white shadow-xl shadow-primary/10 overflow-hidden relative group">
                        <Sparkles className="absolute -right-4 -top-4 h-24 w-24 text-white/10 rotate-12 transition-transform group-hover:scale-125" />
                        <h4 className="font-bold mb-2 relative z-10">Precisa de um relatório personalizado?</h4>
                        <p className="text-xs text-white/80 mb-4 relative z-10">Nossa equipe pode criar painéis específicos para sua necessidade.</p>
                        <Button variant="outline" size="sm" className="w-full bg-white/10 border-white/20 text-white hover:bg-white hover:text-primary border-none font-bold">
                            Solicitar Agora
                        </Button>
                    </div>
                </div>

                {/* Listagem Central */}
                <div className="lg:col-span-3 space-y-8">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                            <p className="mt-4 text-gray-500 font-medium italic">Sincronizando base de dados...</p>
                        </div>
                    ) : Object.keys(relatoriosPorDepto).length === 0 ? (
                        <Card className="p-20 text-center flex flex-col items-center justify-center bg-gray-50/50 border-dashed border-2">
                            <div className="bg-white w-20 h-20 rounded-3xl shadow-xl flex items-center justify-center mb-6">
                                <Search className="h-10 w-10 text-gray-200" />
                            </div>
                            <h3 className="text-xl font-extrabold text-gray-900 mb-2">Nenhum relatório encontrado</h3>
                            <p className="text-gray-500 max-w-xs mx-auto mb-8 text-sm">Não encontramos nenhum resultado para "{searchTerm}". Tente usar termos mais genéricos.</p>
                            <Button variant="primary" onClick={() => { setSearchTerm(''); setSelectedDept(null); }}>
                                Limpar Todos os Filtros
                            </Button>
                        </Card>
                    ) : (
                        (Object.entries(relatoriosPorDepto) as [string, RelatorioConfig[]][]).map(([deptKey, items]) => {
                            const deptInfo = getDeptInfo(deptKey);
                            const isExpanded = expandedDepts[deptKey] ?? true;

                            return (
                                <div key={deptKey} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <button 
                                        onClick={() => toggleDept(deptKey)}
                                        className="flex items-center gap-4 w-full group transition-all"
                                    >
                                        <div 
                                            className="p-3 rounded-2xl transition-all shadow-sm group-hover:shadow-md group-hover:scale-105"
                                            style={{ backgroundColor: `${deptInfo.color}15`, color: deptInfo.color }}
                                        >
                                            <deptInfo.icon className="h-6 w-6" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                                {deptInfo.label}
                                                <Badge variant="outline" className="text-xs font-mono py-0 text-gray-400 border-gray-200">
                                                    {items.length}
                                                </Badge>
                                            </h2>
                                            <p className="text-xs text-gray-400 font-medium">{deptInfo.description}</p>
                                        </div>
                                        <div className={`p-2 rounded-full transition-all ${isExpanded ? 'bg-gray-100 text-gray-600' : 'bg-primary/5 text-primary'}`}>
                                            <ChevronDown className={`h-6 w-6 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className={viewMode === 'grid' 
                                            ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" 
                                            : "space-y-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm"
                                        }>
                                            {items.map((relatorio) => (
                                                <RelatorioCard 
                                                    key={relatorio.id} 
                                                    rel={relatorio} 
                                                    isFavorito={relatorio.is_favorito}
                                                    onToggleFavorito={() => toggleFavorito(relatorio)}
                                                    viewMode={viewMode}
                                                    color={deptInfo.color}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
