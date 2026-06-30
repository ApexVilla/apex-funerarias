import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, Plus, Edit, Eye, FileText } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import {
    Button,
    Card,
    Badge,
    DropdownMenuContent,
    DropdownMenuItem,
} from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useEstoqueEmpresaScope } from '../../lib/estoqueEmpresaScope';
import { rotuloDepositoUnidade } from '../../lib/estoqueDepositosUnidade';
import { useToast } from '../../lib/ToastStore';

type EntradaRow = {
    id: string;
    numero_documento: string;
    fornecedor_nome: string | null;
    data_entrada: string;
    valor_total_centavos: number;
    status: 'pendente' | 'confirmada';
    deposito_id?: string | null;
    estoque_depositos?: { nome: string } | null;
};

function formatData(iso: string) {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatValor(centavos: number) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const EstoqueEntradas: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { empresaIds, dataRevisionEmpresa } = useEstoqueEmpresaScope();
    const [entradas, setEntradas] = React.useState<Array<EntradaRow & { itens_count: number; deposito_nome: string }>>([]);
    const [loading, setLoading] = React.useState(false);
    const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number } | null>(null);

    const openRowMenu = (id: string, event: React.MouseEvent) => {
        setSelectedId(id);
        setOpenMenuId(id);
        setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
    };

    const abrirEdicao = (id: string) => navigate(`/estoque/entradas/${id}/editar`);

    React.useEffect(() => {
        const load = async () => {
            if (!user?.empresa_id || empresaIds.length === 0) return;
            setLoading(true);

            const { data, error } = await supabase
                .from('estoque_entradas')
                .select(
                    'id, numero_documento, fornecedor_nome, data_entrada, valor_total_centavos, status, deposito_id, created_at',
                )
                .in('empresa_id', empresaIds)
                .order('data_entrada', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) {
                showToast(`Erro ao carregar entradas: ${error.message}`, 'error');
                setEntradas([]);
                setLoading(false);
                return;
            }

            const rows = (data ?? []) as EntradaRow[];
            const depIds = [...new Set(rows.map((r) => r.deposito_id).filter(Boolean))] as string[];
            const depMap = new Map<string, string>();

            if (depIds.length > 0) {
                const { data: deps } = await supabase
                    .from('estoque_depositos')
                    .select('id, nome, filiais ( nome )')
                    .in('id', depIds);
                for (const d of deps ?? []) {
                    const filialNome = (d as { filiais?: { nome?: string } | null }).filiais?.nome;
                    depMap.set(
                        d.id as string,
                        rotuloDepositoUnidade({
                            id: d.id as string,
                            nome: d.nome as string,
                            filial_id: null,
                            filial_nome: filialNome,
                        }),
                    );
                }
            }

            const entradaIds = rows.map((r) => r.id);
            const itensCountMap = new Map<string, number>();
            if (entradaIds.length > 0) {
                const { data: itensRows } = await supabase
                    .from('estoque_entrada_itens')
                    .select('entrada_id')
                    .in('entrada_id', entradaIds);
                for (const row of itensRows ?? []) {
                    const eid = row.entrada_id as string;
                    itensCountMap.set(eid, (itensCountMap.get(eid) || 0) + 1);
                }
            }

            setEntradas(
                rows.map((entry) => ({
                    ...entry,
                    itens_count: itensCountMap.get(entry.id) || 0,
                    deposito_nome: entry.deposito_id
                        ? depMap.get(entry.deposito_id) || '—'
                        : '—',
                })),
            );
            setLoading(false);
        };
        void load();
    }, [user?.empresa_id, empresaIds, dataRevisionEmpresa, showToast]);

    const renderMenu = (entradaId: string) =>
        openMenuId === entradaId ? (
            <DropdownMenuContent isOpen onClose={() => setOpenMenuId(null)} position={menuPosition}>
                <DropdownMenuItem
                    onClick={() => {
                        abrirEdicao(entradaId);
                        setOpenMenuId(null);
                    }}
                >
                    <Edit className="h-4 w-4 mr-2" /> Editar entrada
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenMenuId(null)}>
                    <Eye className="h-4 w-4 mr-2" /> Visualizar itens
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenMenuId(null)}>
                    <FileText className="h-4 w-4 mr-2" /> Ver nota fiscal
                </DropdownMenuItem>
            </DropdownMenuContent>
        ) : null;

    const linhaSelecionada = (id: string) =>
        openMenuId === id || selectedId === id ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-gray-50';

    return (
        <div className="space-y-6 min-w-0 max-w-full">
            <PageHeader
                title="Entradas de Estoque"
                subtitle="Registro de recebimento de materiais e mercadorias"
                actionButton={
                    <Button onClick={() => navigate('/estoque/entradas/nova')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Entrada
                    </Button>
                }
            />

            {/* Mobile / telas estreitas: cards — não empurra menu nem contexto do usuário */}
            <div className="md:hidden space-y-3 min-w-0">
                {entradas.length === 0 ? (
                    <Card className="p-8 text-center text-gray-500 text-sm">
                        {loading ? 'Carregando entradas...' : 'Nenhuma entrada cadastrada.'}
                    </Card>
                ) : (
                    entradas.map((entrada) => (
                        <Card
                            key={entrada.id}
                            className={`p-4 cursor-pointer transition-colors relative ${linhaSelecionada(entrada.id)}`}
                            onClick={() => {
                                setSelectedId(entrada.id);
                                setOpenMenuId(null);
                            }}
                            onDoubleClick={() => abrirEdicao(entrada.id)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                openRowMenu(entrada.id, e);
                            }}
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <button
                                    type="button"
                                    className="font-mono text-sm font-bold text-blue-600"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        abrirEdicao(entrada.id);
                                    }}
                                >
                                    {entrada.numero_documento}
                                </button>
                                <Badge variant={entrada.status === 'confirmada' ? 'success' : 'warning'}>
                                    {entrada.status === 'confirmada' ? 'Confirmada' : 'Pendente'}
                                </Badge>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                                <div className="col-span-2">
                                    <dt className="text-[10px] uppercase tracking-wide text-gray-500">Fornecedor</dt>
                                    <dd className="text-gray-900 truncate">{entrada.fornecedor_nome || '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] uppercase tracking-wide text-gray-500">Depósito</dt>
                                    <dd className="text-gray-900 truncate">{entrada.deposito_nome}</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] uppercase tracking-wide text-gray-500">Data</dt>
                                    <dd className="text-gray-900">{formatData(entrada.data_entrada)}</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] uppercase tracking-wide text-gray-500">Itens</dt>
                                    <dd className="text-gray-900 font-medium">{entrada.itens_count}</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] uppercase tracking-wide text-gray-500">Valor</dt>
                                    <dd className="text-gray-900 font-semibold">{formatValor(entrada.valor_total_centavos)}</dd>
                                </div>
                            </dl>
                            {renderMenu(entrada.id)}
                        </Card>
                    ))
                )}
            </div>

            {/* Desktop: tabela contida no painel, sem scroll da página inteira */}
            <div className="hidden md:block list-table-shell min-w-0 max-w-full">
                <div className="overflow-x-auto max-w-full">
                    <table className="list-table w-full table-fixed">
                        <thead>
                            <tr>
                                <th className="w-[18%]">Documento</th>
                                <th className="w-[22%]">Fornecedor</th>
                                <th className="w-[16%]">Depósito</th>
                                <th className="w-[10%]">Data</th>
                                <th className="w-[8%] text-right">Itens</th>
                                <th className="w-[14%] text-right">Valor</th>
                                <th className="w-[12%]">Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entradas.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-gray-500">
                                        {loading ? 'Carregando entradas...' : 'Nenhuma entrada cadastrada.'}
                                    </td>
                                </tr>
                            ) : (
                                entradas.map((entrada) => (
                                    <tr
                                        key={entrada.id}
                                        onClick={() => {
                                            setSelectedId(entrada.id);
                                            setOpenMenuId(null);
                                        }}
                                        onDoubleClick={() => abrirEdicao(entrada.id)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            openRowMenu(entrada.id, e);
                                        }}
                                        className={`transition-all cursor-pointer ${linhaSelecionada(entrada.id)}`}
                                    >
                                        <td className="relative truncate">
                                            <span
                                                className="font-mono text-xs text-blue-600 hover:text-blue-800 font-bold"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    abrirEdicao(entrada.id);
                                                }}
                                            >
                                                {entrada.numero_documento}
                                            </span>
                                            {renderMenu(entrada.id)}
                                        </td>
                                        <td className="truncate text-slate-900" title={entrada.fornecedor_nome || ''}>
                                            {entrada.fornecedor_nome || '—'}
                                        </td>
                                        <td className="truncate text-slate-700" title={entrada.deposito_nome}>
                                            {entrada.deposito_nome}
                                        </td>
                                        <td className="whitespace-nowrap">{formatData(entrada.data_entrada)}</td>
                                        <td className="text-right text-slate-900">{entrada.itens_count}</td>
                                        <td className="text-right text-slate-900 font-medium whitespace-nowrap">
                                            {formatValor(entrada.valor_total_centavos)}
                                        </td>
                                        <td>
                                            <Badge variant={entrada.status === 'confirmada' ? 'success' : 'warning'}>
                                                {entrada.status === 'confirmada' ? 'Confirmada' : 'Pendente'}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Card className="p-5 border-dashed hidden sm:flex">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                    <PackagePlus className="h-5 w-5 text-gray-400 shrink-0" />
                    <span>Clique duas vezes ou use o botão direito na linha para editar a entrada.</span>
                </div>
            </Card>
        </div>
    );
};
