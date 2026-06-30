import React, { useState, useEffect, useMemo } from 'react';
import {
    X,
    CheckCircle,
    AlertCircle,
    RefreshCw,
    Trash2,
    Building2,
    Users,
    Settings2,
    Search,
    Eye,
    HandCoins,
    ArrowLeftRight,
    Info,
    Wallet,
} from 'lucide-react';
import { Button, Input, Select, Label } from '../ui/Components';
import { useFinanceiro, ContaBancaria } from '../../lib/FinanceiroStore';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { supabase } from '../../lib/supabase';

interface NovaContaBancariaModalProps {
    conta?: ContaBancaria | null;
    onClose: () => void;
    onSuccess: () => void;
}

type TabId = 'dados' | 'permissoes' | 'regras';
type PermissaoField = 'autorizados_operacao' | 'autorizados_visualizacao' | 'autorizados_transferencia';

const bancosPopulares = [
    { code: '001', name: 'Banco do Brasil' },
    { code: '237', name: 'Bradesco' },
    { code: '104', name: 'Caixa Econômica' },
    { code: '341', name: 'Itaú' },
    { code: '033', name: 'Santander' },
    { code: '260', name: 'Nubank' },
    { code: '077', name: 'Inter' },
    { code: '336', name: 'C6 Bank' },
    { code: '000', name: 'Caixa Interno' },
];

const tiposConta = [
    { value: 'caixa', label: 'Caixa (dinheiro físico)' },
    { value: 'corrente', label: 'Conta corrente' },
    { value: 'poupanca', label: 'Poupança' },
    { value: 'investimento', label: 'Investimento' },
    { value: 'cartao_credito', label: 'Cartão de crédito' },
];

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'dados', label: 'Dados da conta', icon: <Building2 className="h-4 w-4" /> },
    { id: 'permissoes', label: 'Quem acessa', icon: <Users className="h-4 w-4" /> },
    { id: 'regras', label: 'Regras do caixa', icon: <Settings2 className="h-4 w-4" /> },
];

const REGRAS_CAIXA: {
    field: keyof typeof formDefaults;
    title: string;
    desc: string;
}[] = [
    {
        field: 'permite_abertura_com_outro_caixa_aberto',
        title: 'Abrir com outro caixa já aberto',
        desc: 'Permite abrir esta conta mesmo se outro caixa da empresa estiver em aberto.',
    },
    {
        field: 'exclusivo_empresa',
        title: 'Exclusivo da empresa',
        desc: 'Restringe o uso desta conta ao contexto da empresa cadastrada.',
    },
    {
        field: 'compoe_dfc_dre',
        title: 'Compõe DFC e DRE',
        desc: 'Inclui movimentos desta conta nos relatórios de fluxo de caixa e resultado.',
    },
    {
        field: 'permite_saldo_negativo',
        title: 'Permite saldo negativo',
        desc: 'Autoriza fechar operações mesmo se o saldo ficar abaixo de zero.',
    },
    {
        field: 'permite_fechar_com_saldo_em_caixa',
        title: 'Fechar com saldo em caixa',
        desc: 'Permite encerrar a sessão do caixa mantendo valor contado em espécie.',
    },
];

const formDefaults = {
    nome: '',
    tipo: 'caixa',
    banco_nome: '',
    agencia: '',
    conta: '',
    pix_chave: '',
    pix_tipo: '',
    saldo_inicial: '0.00',
    principal: false,
    ativo: true,
    autorizados_visualizacao: [] as string[],
    autorizados_operacao: [] as string[],
    autorizados_transferencia: [] as string[],
    permite_abertura_com_outro_caixa_aberto: true,
    exclusivo_empresa: false,
    compoe_dfc_dre: true,
    permite_saldo_negativo: false,
    permite_fechar_com_saldo_em_caixa: true,
};

function InfoBox({ children, variant = 'blue' }: { children: React.ReactNode; variant?: 'blue' | 'amber' }) {
    const styles =
        variant === 'amber'
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-blue-50 border-blue-200 text-blue-900';
    return (
        <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
            <Info className="h-5 w-5 shrink-0 mt-0.5 opacity-70" />
            <div className="leading-relaxed">{children}</div>
        </div>
    );
}

export const NovaContaBancariaModal: React.FC<NovaContaBancariaModalProps> = ({ conta, onClose, onSuccess }) => {
    const { criarContaBancaria, updateContaBancaria, deleteContaBancaria } = useFinanceiro();
    const { empresaIdEfetivo, dataRevisionEmpresa } = useEmpresaContextoAtivo();
    const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string; email: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('dados');
    const [buscaUsuario, setBuscaUsuario] = useState('');
    const [formData, setFormData] = useState({ ...formDefaults });

    const ehCaixa = formData.tipo === 'caixa' || formData.tipo === 'corrente';

    useEffect(() => {
        const loadUsuarios = async () => {
            const empresaId = (empresaIdEfetivo || '').trim();
            if (!empresaId) return;
            const { data } = await supabase
                .from('users')
                .select('id, nome, email')
                .eq('empresa_id', empresaId)
                .order('nome', { ascending: true });
            setUsuarios((data ?? []) as Array<{ id: string; nome: string; email: string }>);
        };
        void loadUsuarios();
    }, [empresaIdEfetivo, dataRevisionEmpresa]);

    useEffect(() => {
        if (!conta) {
            setFormData({ ...formDefaults });
            setActiveTab('dados');
            return;
        }
        setFormData({
            nome: conta.nome,
            tipo: conta.tipo,
            banco_nome: conta.banco_nome || '',
            agencia: conta.agencia || '',
            conta: conta.conta || '',
            pix_chave: conta.pix_chave || '',
            pix_tipo: conta.pix_tipo || '',
            saldo_inicial: (conta.saldo_inicial_centavos / 100).toFixed(2),
            principal: conta.principal || false,
            ativo: conta.ativo !== false,
            autorizados_visualizacao: conta.autorizados_visualizacao || [],
            autorizados_operacao: conta.autorizados_operacao || [],
            autorizados_transferencia: conta.autorizados_transferencia || [],
            permite_abertura_com_outro_caixa_aberto: conta.permite_abertura_com_outro_caixa_aberto !== false,
            exclusivo_empresa: !!conta.exclusivo_empresa,
            compoe_dfc_dre: conta.compoe_dfc_dre !== false,
            permite_saldo_negativo: !!conta.permite_saldo_negativo,
            permite_fechar_com_saldo_em_caixa: conta.permite_fechar_com_saldo_em_caixa !== false,
        });
    }, [conta]);

    const usuariosFiltrados = useMemo(() => {
        const q = buscaUsuario.trim().toLowerCase();
        if (!q) return usuarios;
        return usuarios.filter(
            (u) =>
                (u.nome || '').toLowerCase().includes(q) ||
                (u.email || '').toLowerCase().includes(q),
        );
    }, [usuarios, buscaUsuario]);

    const resumoPermissoes = useMemo(
        () => ({
            operacao: formData.autorizados_operacao.length,
            visualizacao: formData.autorizados_visualizacao.length,
            transferencia: formData.autorizados_transferencia.length,
        }),
        [formData.autorizados_operacao, formData.autorizados_visualizacao, formData.autorizados_transferencia],
    );

    const handleChange = (field: string, value: unknown) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaldoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const centavos = parseInt(rawValue, 10) || 0;
        handleChange('saldo_inicial', (centavos / 100).toFixed(2));
    };

    const toggleUserPermissao = (field: PermissaoField, userId: string) => {
        setFormData((prev) => {
            const current = prev[field] || [];
            const next = current.includes(userId)
                ? current.filter((id) => id !== userId)
                : [...current, userId];
            return { ...prev, [field]: next };
        });
    };

    const marcarTodosCampo = (field: PermissaoField, marcar: boolean) => {
        setFormData((prev) => ({
            ...prev,
            [field]: marcar ? usuarios.map((u) => u.id) : [],
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.nome.trim()) {
            setError('Informe o nome da conta.');
            setActiveTab('dados');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const dataToSave = {
                nome: formData.nome.trim(),
                tipo: formData.tipo,
                banco_nome: formData.banco_nome,
                agencia: formData.agencia,
                conta: formData.conta,
                pix_chave: formData.pix_chave || null,
                pix_tipo: formData.pix_tipo || null,
                saldo_inicial_centavos: Math.round(parseFloat(formData.saldo_inicial) * 100),
                principal: formData.principal,
                ativo: formData.ativo,
                autorizados_visualizacao: formData.autorizados_visualizacao,
                autorizados_operacao: formData.autorizados_operacao,
                autorizados_transferencia: formData.autorizados_transferencia,
                permite_abertura_com_outro_caixa_aberto: formData.permite_abertura_com_outro_caixa_aberto,
                exclusivo_empresa: formData.exclusivo_empresa,
                compoe_dfc_dre: formData.compoe_dfc_dre,
                permite_saldo_negativo: formData.permite_saldo_negativo,
                permite_fechar_com_saldo_em_caixa: formData.permite_fechar_com_saldo_em_caixa,
            };
            if (conta) await updateContaBancaria(conta.id, dataToSave);
            else await criarContaBancaria(dataToSave);
            onSuccess();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao salvar conta bancária';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!conta || !window.confirm('Tem certeza que deseja excluir esta conta?')) return;
        setLoading(true);
        setError(null);
        try {
            await deleteContaBancaria(conta.id);
            onSuccess();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao excluir conta';
            setError(msg);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 sm:p-6">
            <div
                className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cabeçalho */}
                <div className="shrink-0 px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                                <Wallet className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    {conta ? 'Editar conta' : 'Nova conta bancária / caixa'}
                                </h2>
                                <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
                                    Cadastre a conta, defina quem pode operar e ajuste as regras do caixa em etapas.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                            aria-label="Fechar"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Abas */}
                    <nav className="flex flex-wrap gap-2 mt-5" aria-label="Etapas do cadastro">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                                {tab.id === 'permissoes' && (
                                    <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                            activeTab === tab.id ? 'bg-blue-500' : 'bg-gray-100 text-gray-600'
                                        }`}
                                    >
                                        {resumoPermissoes.operacao}/{usuarios.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        {error && (
                            <div className="mb-5 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm border border-red-100">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Aba: Dados */}
                        {activeTab === 'dados' && (
                            <div className="space-y-6">
                                <InfoBox>
                                    <strong>Passo 1 — Identificação.</strong> Use um nome claro (ex.: &quot;Caixa Sarah&quot;, &quot;Conta Bradesco PJ&quot;).
                                    Contas do tipo <strong>Caixa</strong> são usadas para dinheiro físico e baixa de parcelas na tesouraria.
                                </InfoBox>

                                <section className="rounded-xl border border-gray-200 p-5 space-y-4">
                                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                                        Identificação
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <Label>Nome da conta *</Label>
                                            <Input
                                                value={formData.nome}
                                                onChange={(e) => handleChange('nome', e.target.value)}
                                                placeholder="Ex.: Caixa recepção, Conta principal..."
                                                required
                                                className="text-base"
                                            />
                                        </div>
                                        <div>
                                            <Label>Tipo *</Label>
                                            <Select
                                                value={formData.tipo}
                                                onChange={(e) => handleChange('tipo', e.target.value)}
                                            >
                                                {tiposConta.map((t) => (
                                                    <option key={t.value} value={t.value}>
                                                        {t.label}
                                                    </option>
                                                ))}
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Banco</Label>
                                            <input
                                                list="bancos-list"
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                value={formData.banco_nome}
                                                onChange={(e) => handleChange('banco_nome', e.target.value)}
                                                placeholder="Opcional — selecione ou digite"
                                            />
                                            <datalist id="bancos-list">
                                                {bancosPopulares.map((b) => (
                                                    <option key={b.code} value={b.name} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>
                                </section>

                                {formData.tipo !== 'caixa' && (
                                    <section className="rounded-xl border border-gray-200 p-5 space-y-4">
                                        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                                            Dados bancários
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <Label>Agência</Label>
                                                <Input
                                                    value={formData.agencia}
                                                    onChange={(e) => handleChange('agencia', e.target.value)}
                                                    placeholder="0000-0"
                                                />
                                            </div>
                                            <div>
                                                <Label>Número da conta</Label>
                                                <Input
                                                    value={formData.conta}
                                                    onChange={(e) => handleChange('conta', e.target.value)}
                                                    placeholder="000000-0"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                                            <div>
                                                <Label>Tipo chave PIX</Label>
                                                <Select
                                                    value={formData.pix_tipo}
                                                    onChange={(e) => handleChange('pix_tipo', e.target.value)}
                                                >
                                                    <option value="">Não informar</option>
                                                    <option value="cpf">CPF</option>
                                                    <option value="cnpj">CNPJ</option>
                                                    <option value="email">E-mail</option>
                                                    <option value="telefone">Telefone</option>
                                                    <option value="aleatoria">Aleatória</option>
                                                </Select>
                                            </div>
                                            <div className="sm:col-span-2">
                                                <Label>Chave PIX</Label>
                                                <Input
                                                    value={formData.pix_chave}
                                                    onChange={(e) => handleChange('pix_chave', e.target.value)}
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                        </div>
                                    </section>
                                )}

                                <section className="rounded-xl border border-gray-200 p-5">
                                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-4">
                                        Saldo e status
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div>
                                            <Label>Saldo inicial (R$)</Label>
                                            <Input
                                                value={formData.saldo_inicial}
                                                onChange={handleSaldoChange}
                                                disabled={!!conta}
                                                className="text-lg font-semibold tabular-nums"
                                            />
                                            {conta && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    O saldo inicial não pode ser alterado após o cadastro.
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-3 justify-center">
                                            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.principal}
                                                    onChange={(e) => handleChange('principal', e.target.checked)}
                                                    className="rounded border-gray-300 text-blue-600 h-4 w-4"
                                                />
                                                <span>
                                                    <span className="block text-sm font-medium text-gray-900">Conta principal</span>
                                                    <span className="block text-xs text-gray-500">Sugestão padrão em baixas e lançamentos</span>
                                                </span>
                                            </label>
                                            {conta && (
                                                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.ativo}
                                                        onChange={(e) => handleChange('ativo', e.target.checked)}
                                                        className="rounded border-gray-300 text-blue-600 h-4 w-4"
                                                    />
                                                    <span>
                                                        <span className="block text-sm font-medium text-gray-900">Conta ativa</span>
                                                        <span className="block text-xs text-gray-500">Desmarque para ocultar sem excluir</span>
                                                    </span>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* Aba: Permissões */}
                        {activeTab === 'permissoes' && (
                            <div className="space-y-5">
                                <InfoBox variant="amber">
                                    <p className="font-medium mb-1">Quem pode fazer o quê nesta conta?</p>
                                    <ul className="list-disc list-inside space-y-1 text-[13px] opacity-95">
                                        <li>
                                            <strong>Operar</strong> — abrir/fechar o dia, baixar parcelas e lançar entradas/saídas.
                                            Evita baixa no caixa de outra pessoa.
                                        </li>
                                        <li>
                                            <strong>Ver</strong> — visualizar a conta em listagens e relatórios.
                                        </li>
                                        <li>
                                            <strong>Transferir</strong> — sangria, suprimento e transferências entre contas.
                                        </li>
                                    </ul>
                                    <p className="mt-2 text-[13px]">
                                        Listas vazias = liberado para todos da empresa (operar usa &quot;ver&quot; se operar estiver vazio).
                                        Quem não tem «Ver todos os caixas» em Configurações → Permissões → Tesouraria só enxerga as contas em que estiver marcado aqui.
                                    </p>
                                </InfoBox>

                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="relative flex-1 min-w-[220px] max-w-md">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            value={buscaUsuario}
                                            onChange={(e) => setBuscaUsuario(e.target.value)}
                                            placeholder="Buscar usuário por nome ou e-mail..."
                                            className="pl-9"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                                            {resumoPermissoes.operacao} operador(es)
                                        </span>
                                        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
                                            {resumoPermissoes.visualizacao} com restrição de ver
                                        </span>
                                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                                            {resumoPermissoes.transferencia} transferência restrita
                                        </span>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="overflow-x-auto max-h-[min(420px,50vh)]">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-gray-200">
                                                <tr>
                                                    <th className="text-left py-3 px-4 font-semibold text-gray-700 min-w-[200px]">
                                                        Usuário
                                                    </th>
                                                    <th className="text-center py-3 px-3 font-semibold text-amber-800 w-28">
                                                        <span className="inline-flex items-center justify-center gap-1">
                                                            <HandCoins className="h-3.5 w-3.5" />
                                                            Operar
                                                        </span>
                                                        <div className="mt-1 flex justify-center gap-1 font-normal">
                                                            <button
                                                                type="button"
                                                                className="text-[10px] text-blue-600 hover:underline"
                                                                onClick={() => marcarTodosCampo('autorizados_operacao', true)}
                                                            >
                                                                Todos
                                                            </button>
                                                            <span className="text-gray-300">|</span>
                                                            <button
                                                                type="button"
                                                                className="text-[10px] text-gray-500 hover:underline"
                                                                onClick={() => marcarTodosCampo('autorizados_operacao', false)}
                                                            >
                                                                Limpar
                                                            </button>
                                                        </div>
                                                    </th>
                                                    <th className="text-center py-3 px-3 font-semibold text-blue-800 w-28">
                                                        <span className="inline-flex items-center justify-center gap-1">
                                                            <Eye className="h-3.5 w-3.5" />
                                                            Ver
                                                        </span>
                                                        <div className="mt-1 flex justify-center gap-1 font-normal">
                                                            <button
                                                                type="button"
                                                                className="text-[10px] text-blue-600 hover:underline"
                                                                onClick={() => marcarTodosCampo('autorizados_visualizacao', true)}
                                                            >
                                                                Todos
                                                            </button>
                                                            <span className="text-gray-300">|</span>
                                                            <button
                                                                type="button"
                                                                className="text-[10px] text-gray-500 hover:underline"
                                                                onClick={() => marcarTodosCampo('autorizados_visualizacao', false)}
                                                            >
                                                                Limpar
                                                            </button>
                                                        </div>
                                                    </th>
                                                    <th className="text-center py-3 px-3 font-semibold text-slate-700 w-28">
                                                        <span className="inline-flex items-center justify-center gap-1">
                                                            <ArrowLeftRight className="h-3.5 w-3.5" />
                                                            Transferir
                                                        </span>
                                                        <div className="mt-1 flex justify-center gap-1 font-normal">
                                                            <button
                                                                type="button"
                                                                className="text-[10px] text-blue-600 hover:underline"
                                                                onClick={() => marcarTodosCampo('autorizados_transferencia', true)}
                                                            >
                                                                Todos
                                                            </button>
                                                            <span className="text-gray-300">|</span>
                                                            <button
                                                                type="button"
                                                                className="text-[10px] text-gray-500 hover:underline"
                                                                onClick={() => marcarTodosCampo('autorizados_transferencia', false)}
                                                            >
                                                                Limpar
                                                            </button>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {usuariosFiltrados.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="py-8 text-center text-gray-500">
                                                            Nenhum usuário encontrado.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    usuariosFiltrados.map((u) => (
                                                        <tr key={u.id} className="hover:bg-gray-50/80">
                                                            <td className="py-3 px-4">
                                                                <p className="font-medium text-gray-900">{u.nome || '—'}</p>
                                                                <p className="text-xs text-gray-500">{u.email}</p>
                                                            </td>
                                                            <td className="text-center py-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={formData.autorizados_operacao.includes(u.id)}
                                                                    onChange={() =>
                                                                        toggleUserPermissao('autorizados_operacao', u.id)
                                                                    }
                                                                    className="h-4 w-4 rounded border-gray-300 text-amber-600"
                                                                    aria-label={`Operar - ${u.nome}`}
                                                                />
                                                            </td>
                                                            <td className="text-center py-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={formData.autorizados_visualizacao.includes(u.id)}
                                                                    onChange={() =>
                                                                        toggleUserPermissao('autorizados_visualizacao', u.id)
                                                                    }
                                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                                                    aria-label={`Ver - ${u.nome}`}
                                                                />
                                                            </td>
                                                            <td className="text-center py-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={formData.autorizados_transferencia.includes(u.id)}
                                                                    onChange={() =>
                                                                        toggleUserPermissao('autorizados_transferencia', u.id)
                                                                    }
                                                                    className="h-4 w-4 rounded border-gray-300 text-slate-600"
                                                                    aria-label={`Transferir - ${u.nome}`}
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">
                                    {usuarios.length} usuário(s) na empresa · exibindo {usuariosFiltrados.length} na busca
                                </p>
                            </div>
                        )}

                        {/* Aba: Regras */}
                        {activeTab === 'regras' && (
                            <div className="space-y-5">
                                <InfoBox>
                                    <strong>Passo 3 — Regras do caixa.</strong>{' '}
                                    {ehCaixa
                                        ? 'Estas opções afetam abertura, fechamento e relatórios desta conta de caixa/corrente.'
                                        : 'Algumas regras aplicam-se principalmente a contas tipo caixa ou corrente.'}
                                </InfoBox>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {REGRAS_CAIXA.map((regra) => (
                                        <label
                                            key={regra.field}
                                            className="flex gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!!formData[regra.field as keyof typeof formData]}
                                                onChange={(e) =>
                                                    handleChange(regra.field, e.target.checked)
                                                }
                                                className="mt-1 rounded border-gray-300 text-blue-600 h-4 w-4 shrink-0"
                                            />
                                            <span>
                                                <span className="block text-sm font-semibold text-gray-900">
                                                    {regra.title}
                                                </span>
                                                <span className="block text-xs text-gray-500 mt-1 leading-relaxed">
                                                    {regra.desc}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Rodapé fixo */}
                    <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/80 flex flex-wrap items-center justify-between gap-3">
                        {conta ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="text-red-600 hover:bg-red-50 border-red-200"
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir conta
                            </Button>
                        ) : (
                            <p className="text-xs text-gray-500">
                                Campos com * são obrigatórios na aba Dados da conta.
                            </p>
                        )}

                        <div className="flex flex-wrap gap-2 ml-auto">
                            {activeTab !== 'dados' && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        setActiveTab(activeTab === 'regras' ? 'permissoes' : 'dados')
                                    }
                                >
                                    Voltar
                                </Button>
                            )}
                            {activeTab !== 'regras' && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        setActiveTab(activeTab === 'dados' ? 'permissoes' : 'regras')
                                    }
                                >
                                    Próximo
                                </Button>
                            )}
                            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
                            >
                                {loading ? (
                                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                )}
                                Salvar conta
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
