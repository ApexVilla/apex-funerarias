import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Package, Plus, Warehouse } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';

type FilialRow = { id: string; nome: string; ativo: boolean };
type DepositoRow = {
    id: string;
    nome: string;
    tipo: string;
    filial_id: string | null;
    ativo: boolean;
};

const TIPO_LABEL: Record<string, string> = {
    central: 'Central / base',
    motorista: 'Estoque motorista / veículo',
    outro: 'Outro',
};

export const EstoqueFiliaisDepositos: React.FC = () => {
    const navigate = useNavigate();
    const { empresa } = useAuth();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [filiais, setFiliais] = useState<(FilialRow & { empresa_nome?: string })[]>([]);
    const [depositos, setDepositos] = useState<(DepositoRow & { empresa_nome?: string })[]>([]);
    const [novaFilial, setNovaFilial] = useState('');
    const [novoDeposito, setNovoDeposito] = useState({ nome: '', filial_id: '', tipo: 'central' as DepositoRow['tipo'] });

    const load = useCallback(async () => {
        if (!empresaIdOperacao) return;
        setLoading(true);
        const [fr, dr] = await Promise.all([
            supabase
                .from('filiais')
                .select('id, nome, ativo, empresas(nome)')
                .eq('empresa_id', empresaIdOperacao)
                .order('nome'),
            supabase
                .from('estoque_depositos')
                .select('id, nome, tipo, filial_id, ativo, empresas(nome)')
                .eq('empresa_id', empresaIdOperacao)
                .order('nome'),
        ]);
        if (fr.error) {
            showToast(`Erro ao carregar filiais: ${fr.error.message}`, 'error');
        } else {
            const mapped = (fr.data as any[] || []).map(f => ({
                ...f,
                empresa_nome: f.empresas?.nome
            }));
            setFiliais(mapped);
        }
        if (dr.error) {
            showToast(`Erro ao carregar depósitos: ${dr.error.message}`, 'error');
        } else {
            const mapped = (dr.data as any[] || []).map(d => ({
                ...d,
                empresa_nome: d.empresas?.nome
            }));
            setDepositos(mapped);
        }
        setLoading(false);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const addFilial = async () => {
        if (!empresaIdOperacao) return;
        const nome = novaFilial.trim();
        if (!nome) {
            showToast('Informe o nome da filial.', 'warning');
            return;
        }
        const { error } = await supabase.from('filiais').insert({
            empresa_id: empresaIdOperacao,
            nome,
            ativo: true,
        });
        if (error) {
            showToast(`Erro ao criar filial: ${error.message}`, 'error');
            return;
        }
        showToast('Filial cadastrada.', 'success');
        setNovaFilial('');
        void load();
    };

    const toggleFilial = async (row: FilialRow) => {
        const { error } = await supabase
            .from('filiais')
            .update({ ativo: !row.ativo, updated_at: new Date().toISOString() })
            .eq('id', row.id);
        if (error) {
            showToast(error.message, 'error');
            return;
        }
        void load();
    };

    const addDeposito = async () => {
        if (!empresaIdOperacao) return;
        const nome = novoDeposito.nome.trim();
        if (!nome) {
            showToast('Informe o nome do depósito.', 'warning');
            return;
        }
        const filialId = novoDeposito.filial_id || null;
        if (!filialId) {
            showToast('Selecione a filial (Catalão, Aparecida, Ipameri…) para vincular o depósito.', 'warning');
            return;
        }
        const { error } = await supabase.from('estoque_depositos').insert({
            empresa_id: empresaIdOperacao,
            nome,
            tipo: novoDeposito.tipo,
            filial_id: filialId,
            ativo: true,
        });
        if (error) {
            showToast(`Erro ao criar depósito: ${error.message}`, 'error');
            return;
        }
        showToast('Depósito cadastrado.', 'success');
        setNovoDeposito({ nome: '', filial_id: '', tipo: 'central' });
        void load();
    };

    const toggleDeposito = async (row: DepositoRow) => {
        const { error } = await supabase
            .from('estoque_depositos')
            .update({ ativo: !row.ativo, updated_at: new Date().toISOString() })
            .eq('id', row.id);
        if (error) {
            showToast(error.message, 'error');
            return;
        }
        void load();
    };

    const filialNome = (id: string | null) => {
        if (!id) return 'Todas as filiais';
        return filiais.find((f) => f.id === id)?.nome || '—';
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Filiais e depósitos"
                subtitle={`Organize o estoque por filial e depósito (incluindo estoque em motorista/veículo). Empresa: ${empresa?.nome || '—'}`}
                actionButton={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => navigate('/estoque/produtos')}>
                            <Package className="h-4 w-4 mr-2" />
                            Ver produtos
                        </Button>
                        <Button variant="outline" onClick={() => navigate('/estoque')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Menu estoque
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="p-6 space-y-4">
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                        <Building2 className="h-5 w-5 text-blue-600" />
                        Filiais
                    </div>
                    <p className="text-sm text-gray-500">
                        Cadastre unidades da operação (ex.: <strong>Catalão</strong>, <strong>Ipameri</strong>,{' '}
                        <strong>Aparecida</strong>, <strong>Matriz</strong>). Os produtos podem ser vinculados a uma filial nos filtros e no cadastro.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            placeholder="Nome da filial"
                            value={novaFilial}
                            onChange={(e) => setNovaFilial(e.target.value)}
                            className="flex-1"
                        />
                        <Button onClick={() => void addFilial()} disabled={loading}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar
                        </Button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="py-2.5 px-3">Nome</th>
                                    <th className="py-2.5 px-3">Empresa</th>
                                    <th className="py-2.5 px-3 w-28">Situação</th>
                                    <th className="py-2.5 px-3 w-32" />
                                </tr>
                            </thead>
                            <tbody>
                                {filiais.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="py-6 px-3 text-center text-gray-400">
                                            Nenhuma filial cadastrada.
                                        </td>
                                    </tr>
                                )}
                                {filiais.map((f) => (
                                    <tr key={f.id} className="border-t border-gray-100">
                                        <td className="py-2.5 px-3 font-medium text-slate-800">{f.nome}</td>
                                        <td className="py-2.5 px-3 text-gray-500 text-xs">{f.empresa_nome}</td>
                                        <td className="py-2.5 px-3 text-xs">{f.ativo ? <span className="text-emerald-600">Ativa</span> : <span className="text-gray-400">Inativa</span>}</td>
                                        <td className="py-2.5 px-3 text-right">
                                            <Button variant="outline" size="sm" onClick={() => void toggleFilial(f)}>
                                                {f.ativo ? 'Desativar' : 'Reativar'}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="p-6 space-y-4">
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                        <Warehouse className="h-5 w-5 text-amber-600" />
                        Depósitos
                    </div>
                    <p className="text-sm text-gray-500">
                        Cada depósito deve estar vinculado a uma filial (Catalão, Aparecida, Ipameri…) para que entradas de estoque
                        lancem saldo no local correto.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Select
                            label="Filial (cidade / unidade) *"
                            value={novoDeposito.filial_id}
                            onChange={(e) => setNovoDeposito((p) => ({ ...p, filial_id: e.target.value }))}
                        >
                            <option value="">Selecione a filial…</option>
                            {filiais.filter((f) => f.ativo).map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.nome}
                                </option>
                            ))}
                        </Select>
                        <Select
                            label="Tipo"
                            value={novoDeposito.tipo}
                            onChange={(e) => setNovoDeposito((p) => ({ ...p, tipo: e.target.value as DepositoRow['tipo'] }))}
                        >
                            <option value="central">Central / base</option>
                            <option value="motorista">Estoque motorista / veículo</option>
                            <option value="outro">Outro</option>
                        </Select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            placeholder="Nome do depósito (ex.: Almoxarifado matriz, Van UTI-01)"
                            value={novoDeposito.nome}
                            onChange={(e) => setNovoDeposito((p) => ({ ...p, nome: e.target.value }))}
                            className="flex-1"
                        />
                        <Button onClick={() => void addDeposito()} disabled={loading}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar
                        </Button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="py-2.5 px-3">Nome</th>
                                    <th className="py-2.5 px-3">Filial</th>
                                    <th className="py-2.5 px-3">Empresa</th>
                                    <th className="py-2.5 px-3">Tipo</th>
                                    <th className="py-2.5 px-3 w-32" />
                                </tr>
                            </thead>
                            <tbody>
                                {depositos.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-6 px-3 text-center text-gray-400">
                                            Nenhum depósito cadastrado.
                                        </td>
                                    </tr>
                                )}
                                {depositos.map((d) => (
                                    <tr key={d.id} className="border-t border-gray-100">
                                        <td className="py-2.5 px-3 font-medium text-slate-800">{d.nome}</td>
                                        <td className="py-2.5 px-3 text-gray-600">{filialNome(d.filial_id)}</td>
                                        <td className="py-2.5 px-3 text-gray-500 text-xs">{d.empresa_nome}</td>
                                        <td className="py-2.5 px-3 text-xs text-gray-700">{TIPO_LABEL[d.tipo] || d.tipo}</td>
                                        <td className="py-2.5 px-3 text-right">
                                            <Button variant="outline" size="sm" onClick={() => void toggleDeposito(d)}>
                                                {d.ativo ? 'Desativar' : 'Reativar'}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
};
