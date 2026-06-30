import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Fuel, Plus, Search, RefreshCw, Edit3, TrendingUp, TrendingDown,
    Car, Users, Calendar, DollarSign, Droplets
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { useToast } from '../../lib/ToastStore';
import { frotaListAbastecimentos } from '../../lib/frotaSupabase';

interface Abastecimento {
    id: string;
    veiculo_placa: string;
    veiculo_modelo: string;
    motorista: string;
    data: string;
    km_atual: number;
    km_anterior: number;
    litros: number;
    valor_litro: number;
    valor_total: number;
    combustivel: 'gasolina' | 'diesel' | 'flex' | 'gnv';
    posto: string;
    nota_fiscal?: string;
}

const formatCurrency = (value: number) =>
    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export const AbastecimentosList: React.FC = () => {
    const navigate = useNavigate();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [combustivelFilter, setCombustivelFilter] = useState('');
    const [mesFilter, setMesFilter] = useState<string>(() => {
        return String(new Date().getMonth() + 1).padStart(2, '0');
    });
    const [anoFilter, setAnoFilter] = useState<string>(() => {
        return String(new Date().getFullYear());
    });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const loadAbastecimentos = async () => {
        if (!empresaIdEfetivo) return;
        if (skipUntilGrupoCarrega) return;
        setLoading(true);
        try {
            const rows = await frotaListAbastecimentos(
                empresaIdEfetivo,
                {
                    search: searchTerm || undefined,
                },
                frotaOpts,
            );
            const mapped: Abastecimento[] = (rows || []).map((a) => ({
                id: a.id,
                veiculo_placa: a.placa,
                veiculo_modelo: a.modelo,
                motorista: a.motorista_nome || '-',
                data: a.data_abastecimento,
                km_atual: Number(a.km_atual || 0),
                km_anterior: Number(a.km_anterior || 0),
                litros: Number(a.litros || 0),
                valor_litro: Number(a.valor_litro || 0),
                valor_total: Number(a.valor_total || 0),
                combustivel: a.combustivel || 'diesel',
                posto: a.posto || '-',
                nota_fiscal: a.nota_fiscal || undefined,
            }));
            setAbastecimentos(mapped);
        } catch (error) {
            const msg =
                error instanceof Error ? error.message : 'Erro ao carregar abastecimentos';
            showToast(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAbastecimentos();
    }, [empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega, searchTerm]);

    const filtered = useMemo(() => abastecimentos.filter(a => {
        const term = searchTerm.toLowerCase();
        const matchSearch = !searchTerm ||
            a.veiculo_placa.toLowerCase().includes(term) ||
            a.motorista.toLowerCase().includes(term) ||
            a.posto.toLowerCase().includes(term);
        const matchCombustivel = !combustivelFilter || a.combustivel === combustivelFilter;
        
        const dateParts = a.data ? a.data.split('-') : [];
        const matchMes = !mesFilter || dateParts[1] === mesFilter;
        const matchAno = !anoFilter || dateParts[0] === anoFilter;

        return matchSearch && matchCombustivel && matchMes && matchAno;
    }), [searchTerm, combustivelFilter, mesFilter, anoFilter, abastecimentos]);

    const totais = useMemo(() => ({
        totalGasto: filtered.reduce((s, a) => s + a.valor_total, 0),
        totalLitros: filtered.reduce((s, a) => s + a.litros, 0),
        mediaConsumo: filtered.length ? filtered.reduce((s, a) => {
            const km = a.km_atual - a.km_anterior;
            return s + (km / a.litros);
        }, 0) / filtered.length : 0,
        registros: filtered.length,
    }), [filtered]);

    const mediaPorCarro = useMemo(() => {
        const groups: Record<string, {
            placa: string;
            modelo: string;
            litros: number;
            valorTotal: number;
            kmPercorrido: number;
            registros: number;
        }> = {};

        filtered.forEach(a => {
            if (!groups[a.veiculo_placa]) {
                groups[a.veiculo_placa] = {
                    placa: a.veiculo_placa,
                    modelo: a.veiculo_modelo,
                    litros: 0,
                    valorTotal: 0,
                    kmPercorrido: 0,
                    registros: 0,
                };
            }
            const g = groups[a.veiculo_placa];
            g.litros += a.litros;
            g.valorTotal += a.valor_total;
            g.kmPercorrido += Math.max(0, a.km_atual - a.km_anterior);
            g.registros += 1;
        });

        return Object.values(groups).map(g => {
            const media = g.litros > 0 ? g.kmPercorrido / g.litros : 0;
            return {
                ...g,
                media,
            };
        }).sort((a, b) => b.valorTotal - a.valorTotal);
    }, [filtered]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Abastecimentos"
                subtitle="Controle de combustível, consumo e gastos por veículo"
                backTo="/frota"
                accentColor="#be123c"
                icon={<Fuel className="h-5 w-5 text-rose-650" />}
                actionButton={
                    <Button onClick={() => navigate('/frota/abastecimentos/novo')}>
                        <Plus className="h-4 w-4 mr-2" /> Registrar Abastecimento
                    </Button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-blue-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Gasto (filtrado)</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(totais.totalGasto)}</p>
                </Card>
                <Card className="p-4 bg-amber-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total em Litros</p>
                    <p className="text-2xl font-bold text-amber-700 mt-1">{totais.totalLitros.toLocaleString('pt-BR')} L</p>
                </Card>
                <Card className="p-4 bg-green-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Média Consumo</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">{totais.mediaConsumo.toFixed(1)} km/L</p>
                </Card>
                <Card className="p-4 bg-gray-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Registros</p>
                    <p className="text-2xl font-bold text-gray-700 mt-1">{totais.registros}</p>
                </Card>
            </div>

            {/* Tabela de Consumo por Veículo */}
            <Card className="p-4 overflow-hidden border border-gray-150 shadow-sm bg-white">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                        Desempenho e Média de Consumo por Veículo
                    </h3>
                    <span className="text-xs text-gray-500 font-semibold bg-gray-50 px-2.5 py-1 rounded-md border">
                        {mesFilter && anoFilter ? `Exibindo médias de ${mesFilter}/${anoFilter}` : 'Exibindo médias do período'}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="bg-gray-50 border-b font-semibold text-gray-600">
                                <th className="py-2.5 px-3">Veículo / Placa</th>
                                <th className="py-2.5 px-3 text-center">Abastecimentos</th>
                                <th className="py-2.5 px-3 text-center">KM Percorrido</th>
                                <th className="py-2.5 px-3 text-center">Litros Abastecidos</th>
                                <th className="py-2.5 px-3 text-right">Total Gasto</th>
                                <th className="py-2.5 px-3 text-center font-bold text-blue-700 bg-blue-50/50">Média Consumo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {mediaPorCarro.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-4 text-center text-gray-400 italic">
                                        Nenhum registro de abastecimento no período.
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {mediaPorCarro.map(g => (
                                        <tr key={g.placa} className="hover:bg-gray-50/50">
                                            <td className="py-2.5 px-3 font-semibold text-gray-800">
                                                {g.placa} <span className="font-normal text-gray-500">({g.modelo})</span>
                                            </td>
                                            <td className="py-2.5 px-3 text-center">{g.registros}</td>
                                            <td className="py-2.5 px-3 text-center">{g.kmPercorrido.toLocaleString('pt-BR')} km</td>
                                            <td className="py-2.5 px-3 text-center">{g.litros.toLocaleString('pt-BR')} L</td>
                                            <td className="py-2.5 px-3 text-right font-medium text-gray-700">{formatCurrency(g.valorTotal)}</td>
                                            <td className="py-2.5 px-3 text-center font-bold text-green-700 bg-green-50/20">
                                                {g.media > 0 ? `${g.media.toFixed(2)} km/L` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-50/70 font-bold border-t border-gray-200 text-gray-900">
                                        <td className="py-2.5 px-3 uppercase tracking-wider text-gray-650">Total Geral</td>
                                        <td className="py-2.5 px-3 text-center">
                                            {mediaPorCarro.reduce((acc, g) => acc + g.registros, 0)}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            {mediaPorCarro.reduce((acc, g) => acc + g.kmPercorrido, 0).toLocaleString('pt-BR')} km
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            {mediaPorCarro.reduce((acc, g) => acc + g.litros, 0).toLocaleString('pt-BR')} L
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                            {formatCurrency(mediaPorCarro.reduce((acc, g) => acc + g.valorTotal, 0))}
                                        </td>
                                        <td className="py-2.5 px-3 text-center text-green-800 bg-green-50/30 font-extrabold">
                                            {(() => {
                                                const totalLitros = mediaPorCarro.reduce((acc, g) => acc + g.litros, 0);
                                                const totalKm = mediaPorCarro.reduce((acc, g) => acc + g.kmPercorrido, 0);
                                                return totalLitros > 0 ? `${(totalKm / totalLitros).toFixed(2)} km/L` : '—';
                                            })()}
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Buscar por placa, motorista ou posto..." className="pl-9"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="w-full md:w-44">
                    <Select value={combustivelFilter} onChange={e => setCombustivelFilter(e.target.value)}>
                        <option value="">Combustível: Todos</option>
                        <option value="diesel">Diesel</option>
                        <option value="gasolina">Gasolina</option>
                        <option value="flex">Flex</option>
                        <option value="gnv">GNV</option>
                    </Select>
                </div>
                <div className="w-full md:w-40">
                    <Select value={mesFilter} onChange={e => setMesFilter(e.target.value)}>
                        <option value="">Mês: Todos</option>
                        <option value="01">Janeiro</option>
                        <option value="02">Fevereiro</option>
                        <option value="03">Março</option>
                        <option value="04">Abril</option>
                        <option value="05">Maio</option>
                        <option value="06">Junho</option>
                        <option value="07">Julho</option>
                        <option value="08">Agosto</option>
                        <option value="09">Setembro</option>
                        <option value="10">Outubro</option>
                        <option value="11">Novembro</option>
                        <option value="12">Dezembro</option>
                    </Select>
                </div>
                <div className="w-full md:w-32">
                    <Select value={anoFilter} onChange={e => setAnoFilter(e.target.value)}>
                        <option value="">Ano: Todos</option>
                        <option value="2024">2024</option>
                        <option value="2025">2025</option>
                        <option value="2026">2026</option>
                        <option value="2027">2027</option>
                    </Select>
                </div>
                <Button variant="outline" onClick={() => { setSearchTerm(''); setCombustivelFilter(''); setMesFilter(''); setAnoFilter(''); loadAbastecimentos(); }}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Limpar
                </Button>
            </div>

            {/* Table */}
            <Card className="overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Data</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Veículo</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Motorista</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Posto</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">KM / Consumo</th>
                                <th className="text-right py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Litros</th>
                                <th className="text-right py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Valor Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map(a => {
                                const kmPercorridos = a.km_atual - a.km_anterior;
                                const consumo = kmPercorridos / a.litros;
                                return (
                                    <tr key={a.id}
                                        onClick={() => { setSelectedId(a.id); setOpenMenuId(null); }}
                                        onContextMenu={e => {
                                            e.preventDefault();
                                            setSelectedId(a.id);
                                            setOpenMenuId(a.id);
                                            setMenuPosition({ x: e.clientX, y: e.clientY });
                                        }}
                                        className={`transition-all cursor-pointer ${
                                            openMenuId === a.id || selectedId === a.id
                                                ? 'bg-blue-50 ring-1 ring-inset ring-blue-100'
                                                : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                <span className="text-gray-700">
                                                    {new Date(a.data + 'T00:00').toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                            {openMenuId === a.id && (
                                                <DropdownMenuContent isOpen={true} onClose={() => setOpenMenuId(null)} position={menuPosition}>
                                                    <DropdownMenuItem onClick={() => { setOpenMenuId(null); }}>
                                                        <Edit3 className="h-4 w-4 mr-2" /> Editar Registro
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <Car className="h-4 w-4 text-blue-500" />
                                                <div>
                                                    <p className="font-semibold text-gray-900">{a.veiculo_placa}</p>
                                                    <p className="text-xs text-gray-500">{a.veiculo_modelo}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1.5">
                                                <Users className="h-3.5 w-3.5 text-gray-400" />
                                                <span className="text-gray-700">{a.motorista}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <p className="text-gray-700">{a.posto}</p>
                                            {a.nota_fiscal && (
                                                <p className="text-xs text-gray-400">NF: {a.nota_fiscal}</p>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <p className="font-mono text-gray-700">{a.km_atual.toLocaleString('pt-BR')} km</p>
                                            <div className="flex items-center justify-center gap-1 text-xs mt-0.5">
                                                {consumo >= 8 ? (
                                                    <TrendingUp className="h-3 w-3 text-green-500" />
                                                ) : (
                                                    <TrendingDown className="h-3 w-3 text-red-500" />
                                                )}
                                                <span className={consumo >= 8 ? 'text-green-600' : 'text-red-500'}>
                                                    {consumo.toFixed(1)} km/L
                                                </span>
                                                <span className="text-gray-400">({kmPercorridos} km)</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Droplets className="h-3.5 w-3.5 text-blue-400" />
                                                <span className="font-medium text-gray-700">{a.litros} L</span>
                                            </div>
                                            <p className="text-xs text-gray-400">R$ {a.valor_litro.toFixed(2)}/L</p>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="font-bold text-gray-900">{formatCurrency(a.valor_total)}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t">
                                <td colSpan={5} className="py-3 px-4 text-right text-sm font-semibold text-gray-600">Totais:</td>
                                <td className="py-3 px-4 text-right font-bold text-gray-900">
                                    {filtered.reduce((s, a) => s + a.litros, 0)} L
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-gray-900">
                                    {formatCurrency(filtered.reduce((s, a) => s + a.valor_total, 0))}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>
            {loading && <div className="text-sm text-gray-500">Carregando...</div>}
        </div>
    );
};
