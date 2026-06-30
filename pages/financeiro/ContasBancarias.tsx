import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Building2, Star, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge } from '../../components/ui/Components';
import { useFinanceiro, formatCentavos, ContaBancaria } from '../../lib/FinanceiroStore';
import { EmptyFinanceiro, FinanceiroLoading } from '../../components/financeiro/FinanceiroComponents';
import { NovaContaBancariaModal } from '../../components/financeiro/NovaContaBancariaModal';
import { ExtratoContaModal } from '../../components/financeiro/ExtratoContaModal';
import { ContaBancariaMenuAcoes } from '../../components/financeiro/ContaBancariaMenuAcoes';
import { useAuth } from '../../lib/AuthContext';
import { usuarioPodeVerTodosCaixas } from '../../lib/finCaixaPermissoes';
import { supabase } from '../../lib/supabase';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';

const tipoLabels: Record<string, string> = {
    corrente: 'Conta Corrente',
    poupanca: 'Poupança',
    caixa: 'Caixa',
    cartao_credito: 'Cartão de Crédito',
    investimento: 'Investimento',
    digital: 'Conta Digital',
};

const tipoColors: Record<string, string> = {
    corrente: 'from-blue-500 to-blue-700',
    poupanca: 'from-green-500 to-green-700',
    caixa: 'from-amber-500 to-amber-700',
    cartao_credito: 'from-purple-500 to-purple-700',
    investimento: 'from-cyan-500 to-cyan-700',
    digital: 'from-pink-500 to-pink-700',
};

export const ContasBancarias: React.FC = () => {
    const { contasBancarias, loadContasBancarias, loading } = useFinanceiro();
    const { user } = useAuth();
    const { empresaIdsParaFiltro } = useEmpresaContextoAtivo();
    const [showModal, setShowModal] = useState(false);
    const [selectedConta, setSelectedConta] = useState<ContaBancaria | null>(null);
    const [contaMenu, setContaMenu] = useState<ContaBancaria | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const [contaExtrato, setContaExtrato] = useState<ContaBancaria | null>(null);
    const [sessaoAbertaMap, setSessaoAbertaMap] = useState<Record<string, boolean>>({});

    const verTodosCaixas = usuarioPodeVerTodosCaixas(
        user?.role,
        user?.permissoes as Record<string, unknown> | undefined,
    );

    const carregarSessoesAbertas = useCallback(async () => {
        const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
        let query = supabase.from('fin_caixa_sessoes').select('conta_bancaria_id').eq('status', 'aberto');
        if (ids.length > 0) query = query.in('empresa_id', ids);
        const { data } = await query;
        const map: Record<string, boolean> = {};
        (data || []).forEach((s: { conta_bancaria_id: string }) => {
            map[s.conta_bancaria_id] = true;
        });
        setSessaoAbertaMap(map);
    }, [empresaIdsParaFiltro]);

    useEffect(() => {
        loadContasBancarias();
        void carregarSessoesAbertas();
    }, [loadContasBancarias, carregarSessoesAbertas]);

    const abrirMenuConta = (conta: ContaBancaria, event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setContaMenu(conta);
        setOpenMenuId(conta.id);
        setMenuPosition({ x: event.clientX, y: event.clientY });
    };

    const fecharMenu = () => {
        setOpenMenuId(null);
        setMenuPosition(null);
    };

    if (loading && contasBancarias.length === 0 && !showModal) return <FinanceiroLoading />;

    const totalSaldo = contasBancarias.filter(c => c.ativo).reduce((s, c) => s + c.saldo_atual_centavos, 0);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Contas Bancárias"
                subtitle="Clique na conta para abrir o menu de ações. Vincule operadores em Editar para evitar baixa no caixa errado."
                actionButton={
                    <Button onClick={() => { setSelectedConta(null); setShowModal(true); }}>
                        <Plus className="h-4 w-4 mr-2" /> Nova Conta
                    </Button>
                }
            />

            <Card className="p-6 bg-gradient-to-r from-slate-800 to-slate-900 text-white border-0">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-300 font-medium">Saldo Total Consolidado</p>
                        <p className="text-4xl font-bold mt-2">{formatCentavos(totalSaldo)}</p>
                        <p className="text-sm text-slate-400 mt-1">{contasBancarias.filter(c => c.ativo).length} conta(s) ativa(s)</p>
                    </div>
                    <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center">
                        <Wallet className="h-8 w-8 text-white" />
                    </div>
                </div>
            </Card>

            {contasBancarias.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {contasBancarias.map((conta) => (
                        <Card
                            key={conta.id}
                            className={`overflow-hidden cursor-pointer transition-all ${!conta.ativo ? 'opacity-60' : ''} ${openMenuId === conta.id ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-md'}`}
                            onClick={(e) => abrirMenuConta(conta, e)}
                            onContextMenu={(e) => abrirMenuConta(conta, e)}
                            title="Clique para ver ações"
                        >
                            <div className={`bg-gradient-to-r ${tipoColors[conta.tipo] || 'from-gray-500 to-gray-700'} p-4 text-white`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-5 w-5" />
                                        <span className="text-sm font-medium opacity-90">{tipoLabels[conta.tipo] || conta.tipo}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {sessaoAbertaMap[conta.id] && (
                                            <Badge variant="success" className="text-[10px]">Aberto</Badge>
                                        )}
                                        {conta.principal && (
                                            <Star className="h-4 w-4 text-yellow-300 fill-yellow-300" />
                                        )}
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold mt-2">{conta.nome}</h3>
                                <p className="text-xs opacity-75 font-mono mt-0.5">{conta.codigo}</p>
                            </div>

                            <div className="p-4">
                                <div className="mb-2">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo Atual</p>
                                    <p className={`text-2xl font-bold mt-1 ${conta.saldo_atual_centavos >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCentavos(conta.saldo_atual_centavos)}
                                    </p>
                                </div>
                                {(conta.autorizados_operacao?.length || 0) > 0 && (
                                    <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                                        {conta.autorizados_operacao!.length} operador(es) vinculado(s)
                                    </p>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <EmptyFinanceiro
                    icon={<Building2 className="h-8 w-8 text-gray-400" />}
                    title="Nenhuma conta cadastrada"
                    description="Cadastre suas contas bancárias para gerenciar saldos e movimentações."
                    action={<Button onClick={() => { setSelectedConta(null); setShowModal(true); }}>+ Nova Conta</Button>}
                />
            )}

            {contaMenu && openMenuId && menuPosition && (
                <ContaBancariaMenuAcoes
                    conta={contaMenu}
                    isOpen={true}
                    onClose={fecharMenu}
                    position={menuPosition}
                    variant="contas"
                    sessaoAberta={!!sessaoAbertaMap[contaMenu.id]}
                    userId={user?.id}
                    isGestor={verTodosCaixas}
                    onExtrato={() => setContaExtrato(contaMenu)}
                    onEditar={() => { setSelectedConta(contaMenu); setShowModal(true); }}
                />
            )}

            {showModal && (
                <NovaContaBancariaModal
                    conta={selectedConta}
                    onClose={() => { setShowModal(false); setSelectedConta(null); }}
                    onSuccess={() => { loadContasBancarias(); void carregarSessoesAbertas(); }}
                />
            )}

            {contaExtrato && (
                <ExtratoContaModal
                    conta={contaExtrato}
                    onClose={() => setContaExtrato(null)}
                />
            )}
        </div>
    );
};
