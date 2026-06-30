import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Loader2, Calendar, BadgeDollarSign, Info } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Label, Select, Textarea } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';

export const EstoqueEquipamentoForm: React.FC = () => {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [codigo, setCodigo] = useState('');

    const [formData, setFormData] = useState({
        nome: '',
        numero_serie: '',
        senha_equipamento: '',
        marca: '',
        modelo: '',
        data_aquisicao: '',
        valor_aquisicao: '',
        status: 'ativo',
        localizacao: '',
        responsavel: '',
        descricao: ''
    });

    useEffect(() => {
        if (id) {
            loadEquipamento();
        }
    }, [id]);

    const obterCodigoSequencial = async (empresaId: string) => {
        const { data, error } = await supabase.rpc('fn_gerar_codigo_equipamento', {
            p_empresa_id: empresaId,
        });
        if (error || typeof data !== 'string' || !/^EQP-\d+$/.test(data)) {
            throw new Error(error?.message || 'Não foi possível gerar código sequencial.');
        }
        return data;
    };

    const loadEquipamento = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('estoque_equipamentos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            showToast(`Erro ao carregar: ${error.message}`, 'error');
            navigate('/estoque/equipamentos');
        } else if (data) {
            setFormData({
                nome: data.nome || '',
                numero_serie: data.numero_serie || '',
                senha_equipamento: data.senha_equipamento || '',
                marca: data.marca || '',
                modelo: data.modelo || '',
                data_aquisicao: data.data_aquisicao || '',
                valor_aquisicao: data.valor_aquisicao?.toString() || '',
                status: data.status || 'ativo',
                localizacao: data.localizacao || '',
                responsavel: data.responsavel || '',
                descricao: data.descricao || ''
            });
            setCodigo(data.codigo || '');
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.empresa_id) return;

        setSaving(true);
        const data = {
            ...formData,
            empresa_id: user.empresa_id,
            valor_aquisicao: formData.valor_aquisicao ? parseFloat(formData.valor_aquisicao) : null,
            updated_at: new Date().toISOString()
        };

        if (id) {
            const { error } = await supabase.from('estoque_equipamentos').update(data).eq('id', id);
            if (error) {
                showToast(`Erro ao salvar: ${error.message}`, 'error');
                setSaving(false);
                return;
            }
            showToast(id ? 'Equipamento atualizado' : 'Equipamento cadastrado com sucesso');
            navigate('/estoque/equipamentos');
            setSaving(false);
            return;
        }

        for (let tentativa = 0; tentativa < 12; tentativa++) {
            let codigoTentativa = '';
            try {
                codigoTentativa = await obterCodigoSequencial(user.empresa_id);
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Erro ao gerar código do equipamento.', 'error');
                setSaving(false);
                return;
            }
            const { error } = await supabase
                .from('estoque_equipamentos')
                .insert([{ ...data, codigo: codigoTentativa }]);

            if (!error) {
                showToast(`Equipamento cadastrado com código ${codigoTentativa}`);
                navigate('/estoque/equipamentos');
                setSaving(false);
                return;
            }

            if (error.code === '23505' && tentativa < 11) continue;

            showToast(`Erro ao salvar: ${error.message}`, 'error');
            setSaving(false);
            return;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={id ? 'Editar Equipamento' : 'Novo Equipamento'}
                subtitle={id ? `Editando: ${formData.nome}` : 'Cadastre um novo ativo fixo ou equipamento'}
                backTo="/estoque/equipamentos"
            />

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="p-6">
                        {!isEdit && (
                            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 mb-4 text-sm text-blue-700">
                                O código interno do equipamento será gerado automaticamente ao salvar.
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {isEdit && (
                                <div>
                                    <Label htmlFor="codigo">Cód. Patrimônio / Interno</Label>
                                    <Input id="codigo" value={codigo} readOnly />
                                </div>
                            )}
                            <div className="md:col-span-2">
                                <Label htmlFor="nome">Nome do Equipamento *</Label>
                                <Input
                                    id="nome"
                                    placeholder="Ex: Impressora Térmica HP"
                                    required
                                    value={formData.nome}
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label htmlFor="numero_serie">Número de Série</Label>
                                <Input
                                    id="numero_serie"
                                    placeholder="SN: 123456789"
                                    value={formData.numero_serie}
                                    onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label htmlFor="senha_equipamento">Senha do Equipamento</Label>
                                <Input
                                    id="senha_equipamento"
                                    type="text"
                                    placeholder="Ex: senha de login do equipamento"
                                    value={formData.senha_equipamento}
                                    onChange={(e) => setFormData({ ...formData, senha_equipamento: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label htmlFor="marca">Marca</Label>
                                <Input
                                    id="marca"
                                    placeholder="Ex: Dell, HP, Samsung"
                                    value={formData.marca}
                                    onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label htmlFor="modelo">Modelo</Label>
                                <Input
                                    id="modelo"
                                    placeholder="Ex: LaserJet Pro M404n"
                                    value={formData.modelo}
                                    onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <Label htmlFor="descricao">Descrição / Observações</Label>
                                <Textarea
                                    id="descricao"
                                    rows={3}
                                    placeholder="Detalhes técnicos, acessórios inclusos, etc."
                                    value={formData.descricao}
                                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                                />
                            </div>
                        </div>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" type="button" onClick={() => navigate('/estoque/equipamentos')}>
                            Cancelar
                        </Button>
                        <Button type="submit" loading={saving}>
                            <Save className="h-4 w-4 mr-2" />
                            {id ? 'Salvar Alterações' : 'Cadastrar Equipamento'}
                        </Button>
                    </div>
                </div>

                <div className="space-y-6">
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Info className="h-5 w-5 text-blue-600" />
                            Status, Local e Responsável
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="status">Status Atual</Label>
                                <Select
                                    id="status"
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                >
                                    <option value="ativo">Ativo / Operacional</option>
                                    <option value="manutencao">Em Manutenção</option>
                                    <option value="baixado">Baixado / Fora de Uso</option>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="localizacao">Departamento</Label>
                                <Input
                                    id="localizacao"
                                    placeholder="Ex: Recepção, Comercial, Financeiro"
                                    value={formData.localizacao}
                                    onChange={(e) => setFormData({ ...formData, localizacao: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label htmlFor="responsavel">Pessoa Responsável / Usuário</Label>
                                <Input
                                    id="responsavel"
                                    placeholder="Nome de quem vai usar"
                                    value={formData.responsavel}
                                    onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                                />
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6 bg-slate-50 border-slate-200">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
                            Informações de Compra
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="data_aquisicao">Data de Aquisição</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="data_aquisicao"
                                        type="date"
                                        className="pl-10"
                                        value={formData.data_aquisicao}
                                        onChange={(e) => setFormData({ ...formData, data_aquisicao: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="valor_aquisicao">Valor de Compra (R$)</Label>
                                <Input
                                    id="valor_aquisicao"
                                    type="number"
                                    step="0.01"
                                    placeholder="0,00"
                                    value={formData.valor_aquisicao}
                                    onChange={(e) => setFormData({ ...formData, valor_aquisicao: e.target.value })}
                                />
                            </div>
                        </div>
                    </Card>
                </div>
            </form>
        </div>
    );
};
