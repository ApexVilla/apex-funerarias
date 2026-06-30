import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { supabase } from '../../lib/supabase';
import { buscarEnderecoPorCep, cepSomenteDigitos, formatCepInput } from '../../lib/viaCep';

export const EstoqueFornecedorForm: React.FC = () => {
    const navigate = useNavigate();
    const { fornecedorId } = useParams();
    const { showToast } = useToast();
    const { user } = useAuth();
    const { empresaIdEfetivo } = useEmpresaContextoAtivo();
    const empresaIdOperacao = empresaIdEfetivo || user?.empresa_id || '';
    const isEdit = Boolean(fornecedorId);
    const [loading, setLoading] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);
    const cepAbortRef = useRef<AbortController | null>(null);
    const [codigo, setCodigo] = useState('');
    const [form, setForm] = useState({
        nome: '',
        documento: '',
        contato: '',
        email: '',
        tipo: 'geral',
        status: 'ativo',
        cep: '',
        logradouro: '',
        numero: '',
        bairro: '',
        cidade: '',
        estado: '',
        complemento: '',
        observacoes: '',
    });

    const maskCpfCnpj = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 14);
        if (digits.length <= 11) {
            return digits
                .replace(/^(\d{3})(\d)/, '$1.$2')
                .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
                .replace(/\.(\d{3})(\d)/, '.$1-$2');
        }
        return digits
            .replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    };

    const isCpfValido = (cpf: string) => {
        const digits = cpf.replace(/\D/g, '');
        if (digits.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(digits)) return false;

        let soma = 0;
        for (let i = 0; i < 9; i++) soma += Number(digits[i]) * (10 - i);
        let resto = (soma * 10) % 11;
        if (resto === 10) resto = 0;
        if (resto !== Number(digits[9])) return false;

        soma = 0;
        for (let i = 0; i < 10; i++) soma += Number(digits[i]) * (11 - i);
        resto = (soma * 10) % 11;
        if (resto === 10) resto = 0;
        return resto === Number(digits[10]);
    };

    const isCnpjValido = (cnpj: string) => {
        const digits = cnpj.replace(/\D/g, '');
        if (digits.length !== 14) return false;
        if (/^(\d)\1{13}$/.test(digits)) return false;

        const calcDigito = (base: string, pesos: number[]) => {
            const soma = base
                .split('')
                .reduce((acc, curr, idx) => acc + Number(curr) * pesos[idx], 0);
            const resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        };

        const base12 = digits.slice(0, 12);
        const d1 = calcDigito(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        const d2 = calcDigito(`${base12}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        return digits === `${base12}${d1}${d2}`;
    };

    const gerarCodigoSequencial = async (): Promise<string> => {
        const { count } = await supabase
            .from('fornecedores')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresaIdOperacao);
        const seq = (count ?? 0) + 1;
        return String(seq).padStart(4, '0');
    };

    useEffect(() => {
        if (!empresaIdOperacao) return;
        if (!isEdit || !fornecedorId) return;

        const loadFornecedor = async () => {
            const { data, error } = await supabase
                .from('fornecedores')
                .select('*')
                .eq('id', fornecedorId)
                .is('deleted_at', null)
                .maybeSingle();

            if (error || !data) {
                showToast('Fornecedor não encontrado.', 'warning');
                navigate('/estoque/fornecedores');
                return;
            }

            setCodigo(data.codigo || '');
            setForm({
                nome: data.nome || '',
                documento: data.cnpj_cpf || '',
                contato: data.contato?.telefone || data.contato?.nome || '',
                email: data.contato?.email || '',
                tipo: data.tipo || 'geral',
                status: data.ativo ? 'ativo' : 'inativo',
                cep: formatCepInput(data.endereco?.cep || ''),
                logradouro: data.endereco?.logradouro || '',
                numero: data.endereco?.numero || '',
                bairro: data.endereco?.bairro || '',
                cidade: data.endereco?.cidade || '',
                estado: data.endereco?.estado || '',
                complemento: data.endereco?.complemento || '',
                observacoes: data.condicoes || '',
            });
        };

        void loadFornecedor();
    }, [fornecedorId, isEdit, navigate, showToast, empresaIdOperacao]);

    useEffect(() => {
        return () => {
            cepAbortRef.current?.abort();
        };
    }, []);

    const preencherEnderecoPorCep = async (cepRaw: string) => {
        const digits = cepSomenteDigitos(cepRaw);
        if (digits.length !== 8) return;

        cepAbortRef.current?.abort();
        const controller = new AbortController();
        cepAbortRef.current = controller;
        setCepLoading(true);

        try {
            const endereco = await buscarEnderecoPorCep(digits, controller.signal);
            setForm((prev) => ({
                ...prev,
                logradouro: endereco.logradouro || prev.logradouro,
                bairro: endereco.bairro || prev.bairro,
                cidade: endereco.cidade || prev.cidade,
                estado: endereco.estado || prev.estado,
                complemento: endereco.complemento || prev.complemento,
            }));
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            showToast(err instanceof Error ? err.message : 'Erro ao buscar CEP.', 'error');
        } finally {
            if (cepAbortRef.current === controller) {
                cepAbortRef.current = null;
            }
            setCepLoading(false);
        }
    };

    const handleCepChange = (value: string) => {
        const formatted = formatCepInput(value);
        setForm((prev) => ({ ...prev, cep: formatted }));
        if (cepSomenteDigitos(formatted).length === 8) {
            void preencherEnderecoPorCep(formatted);
        }
    };

    const handleSave = async () => {
        if (!empresaIdOperacao) {
            showToast('Empresa não identificada. Faça login novamente.', 'error');
            return;
        }
        if (!form.nome.trim()) {
            showToast('Informe o nome/razão social.', 'warning');
            return;
        }
        if (!form.documento.trim()) {
            showToast('Informe o CPF ou CNPJ do fornecedor.', 'warning');
            return;
        }
        const documentoDigits = form.documento.replace(/\D/g, '');
        if (documentoDigits.length === 11 && !isCpfValido(form.documento)) {
            showToast('CPF inválido. Verifique os dígitos.', 'warning');
            return;
        }
        if (documentoDigits.length === 14 && !isCnpjValido(form.documento)) {
            showToast('CNPJ inválido. Verifique os dígitos.', 'warning');
            return;
        }
        if (![11, 14].includes(documentoDigits.length)) {
            showToast('Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).', 'warning');
            return;
        }
        if (!form.cep.trim()) {
            showToast('Informe o CEP do fornecedor.', 'warning');
            return;
        }
        if (!form.logradouro.trim() || !form.numero.trim() || !form.bairro.trim() || !form.cidade.trim() || !form.estado.trim()) {
            showToast('Preencha o endereço completo do fornecedor.', 'warning');
            return;
        }

        setLoading(true);
        const payload = {
            empresa_id: empresaIdOperacao,
            nome: form.nome.trim(),
            tipo: form.tipo || 'geral',
            cnpj_cpf: form.documento.trim() || null,
            razao_social: form.nome.trim(),
            contato: {
                nome: form.nome.trim(),
                telefone: form.contato.trim() || null,
                email: form.email.trim() || null,
            },
            endereco: {
                cep: form.cep.trim(),
                logradouro: form.logradouro.trim(),
                numero: form.numero.trim(),
                bairro: form.bairro.trim(),
                cidade: form.cidade.trim(),
                estado: form.estado.trim().toUpperCase(),
                complemento: form.complemento.trim() || null,
            },
            condicoes: form.observacoes.trim() || null,
            ativo: form.status === 'ativo',
            updated_at: new Date().toISOString(),
        };

        if (isEdit && fornecedorId) {
            const { error } = await supabase
                .from('fornecedores')
                .update(payload)
                .eq('id', fornecedorId);

            if (error) {
                showToast(`Erro ao atualizar fornecedor: ${error.message}`, 'error');
                setLoading(false);
                return;
            }
            showToast('Fornecedor atualizado com sucesso.', 'success');
            navigate('/estoque/fornecedores');
            setLoading(false);
            return;
        }

        const codigoNovo = await gerarCodigoSequencial();
        const { error } = await supabase.from('fornecedores').insert({
            ...payload,
            codigo: codigoNovo,
        });

        if (error) {
            showToast(`Erro ao salvar fornecedor: ${error.message}`, 'error');
            setLoading(false);
            return;
        }

        showToast(`Fornecedor criado com código ${codigoNovo}.`, 'success');
        navigate('/estoque/fornecedores');
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                subtitle="Cadastro de fornecedores vinculados ao estoque"
                actionButton={
                    <Button variant="outline" onClick={() => navigate('/estoque/fornecedores')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                }
            />

            <Card className="p-6 space-y-4">
                {!isEdit && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        O código do fornecedor será gerado automaticamente ao salvar.
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isEdit && <Input label="Código" value={codigo} readOnly />}
                    <Input
                        label="Nome / Razão Social"
                        placeholder="Fornecedor Exemplo Ltda"
                        value={form.nome}
                        onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                    />
                    <Input
                        label="CPF / CNPJ"
                        placeholder="00.000.000/0001-00"
                        value={form.documento}
                        onChange={(e) => setForm((prev) => ({ ...prev, documento: maskCpfCnpj(e.target.value) }))}
                    />
                    <Input
                        label="Contato"
                        placeholder="(00) 0000-0000"
                        value={form.contato}
                        onChange={(e) => setForm((prev) => ({ ...prev, contato: e.target.value }))}
                    />
                    <Input
                        label="E-mail"
                        type="email"
                        placeholder="contato@fornecedor.com"
                        value={form.email}
                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative">
                        <Input
                            label="CEP"
                            placeholder="00000-000"
                            value={form.cep}
                            onChange={(e) => handleCepChange(e.target.value)}
                            onBlur={() => void preencherEnderecoPorCep(form.cep)}
                            helperText={
                                cepLoading
                                    ? 'Buscando endereço...'
                                    : 'Digite o CEP — ao completar 8 dígitos o endereço é preenchido automaticamente'
                            }
                        />
                        {cepLoading ? (
                            <div
                                className="absolute right-3 top-9 h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"
                                aria-hidden
                            />
                        ) : null}
                    </div>
                    <Input
                        label="Logradouro"
                        placeholder="Rua, avenida..."
                        value={form.logradouro}
                        onChange={(e) => setForm((prev) => ({ ...prev, logradouro: e.target.value }))}
                    />
                    <Input
                        label="Número"
                        placeholder="123"
                        value={form.numero}
                        onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))}
                    />
                    <Input
                        label="Complemento"
                        placeholder="Sala, bloco, referência"
                        value={form.complemento}
                        onChange={(e) => setForm((prev) => ({ ...prev, complemento: e.target.value }))}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                        label="Bairro"
                        value={form.bairro}
                        onChange={(e) => setForm((prev) => ({ ...prev, bairro: e.target.value }))}
                    />
                    <Input
                        label="Cidade"
                        value={form.cidade}
                        onChange={(e) => setForm((prev) => ({ ...prev, cidade: e.target.value }))}
                    />
                    <Input
                        label="UF"
                        placeholder="SP"
                        maxLength={2}
                        value={form.estado}
                        onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value.toUpperCase() }))}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                        label="Tipo"
                        value={form.tipo}
                        onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
                    >
                        <option value="geral">Geral</option>
                        <option value="urnas">Urnas</option>
                        <option value="floricultura">Floricultura</option>
                        <option value="velorio">Velório</option>
                        <option value="servicos">Serviços</option>
                    </Select>
                    <Select
                        label="Status"
                        value={form.status}
                        onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    </Select>
                </div>
                <Textarea
                    label="Observações"
                    placeholder="Informações comerciais e contratuais..."
                    value={form.observacoes}
                    onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => navigate('/estoque/fornecedores')}>Cancelar</Button>
                    <Button onClick={handleSave} loading={loading}>
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Fornecedor
                    </Button>
                </div>
            </Card>
        </div>
    );
};
