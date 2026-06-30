import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Package, DollarSign, Users, Shield, Check
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Textarea, Card } from '../../components/ui/Components';
import { normalizeTipoBeneficio, usePlanosStore } from '../../lib/PlanosStore';
import { useToast } from '../../lib/ToastStore';
import { listarKitsPorPlano, criarKitDoPlano, type KitPlanoResumo } from '../../lib/kitPlanoService';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { empresasVisiveisDoPlano, rotulosUnidadesPlano } from '../../lib/planosUnidades';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';

const emptyForm = {
  nome: '',
  descricao: '',
  descricao_completa: '',
  categoria: 'individual',
  categoria_id: '',
  tipo: 'funerario',
  valorMensal: '',
  valorAnual: '',
  taxaAdesao: '',
  maxBeneficiarios: '1',
  carenciaDias: '30',
  status: 'ativo',
  comissaoVendaInicial: '0',
  comissaoVendaFixa: '0',
  comissaoRecorrente: '0',
  comissaoGerenteInicial: '0',
  comissaoGerenteRecorrente: '0',
  comissaoAgentePercentual: '0',
  comissaoAgenteFixa: '0',
  comissaoAtendentePercentual: '0',
  comissaoAtendenteFixa: '0',
};

const segmentoOptions = [
  { value: 'funerario', label: 'Funerário' },
  { value: 'odontologico', label: 'Odontológico' },
  { value: 'optica', label: 'Óptica' },
  { value: 'saude', label: 'Saúde' },
];

const categoriaOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'familiar', label: 'Familiar' },
  { value: 'empresarial', label: 'Empresarial' },
];

const carenciaOptions = [
  { value: '0', label: 'Sem carência' },
  { value: '30', label: '30 dias' },
  { value: '60', label: '60 dias' },
  { value: '90', label: '90 dias' },
  { value: '180', label: '180 dias (6 meses)' },
  { value: '365', label: '365 dias (1 ano)' },
];

const toCentavos = (valor?: string) => Math.round(parseFloat(valor || '0') * 100);
const toNumber = (valor?: string, fallback = 0) => parseFloat(valor || `${fallback}`) || fallback;
const toInt = (valor?: string, fallback = 0) => parseInt(valor || `${fallback}`, 10) || fallback;
const DEFAULT_ADMIN_USER_ID = 'fecc790c-2b24-4d00-a3bf-53c23ba4977d';
const getSessionUserId = () => sessionStorage.getItem('userId') || DEFAULT_ADMIN_USER_ID;

export const PlanoForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { id } = useParams();
  const {
    planos, categorias, beneficiosDisponiveis,
    permissoes, loading, error, createPlano, updatePlano,
    loadPermissoes, loadPlanos, loadBeneficios
  } = usePlanosStore();

  const isEditing = !!id;
  const modo = useMemo(() => new URLSearchParams(location.search).get('modo'), [location.search]);
  const isViewMode = isEditing && modo === 'visualizar';
  const [formData, setFormData] = useState(emptyForm);
  const [jsonBeneficios, setJsonBeneficios] = useState<{ nome: string; incluido: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [kitsPlano, setKitsPlano] = useState<KitPlanoResumo[]>([]);
  const [gerandoKit, setGerandoKit] = useState(false);
  const { empresasDoGrupo, empresaIdsFiltro, empresaNomePorId, visaoConsolidada } = useEmpresaIdsOperacao();
  const [empresasVisiveisSelecionadas, setEmpresasVisiveisSelecionadas] = useState<string[]>([]);
  const currentSection = useMemo(() => new URLSearchParams(location.search).get('secao'), [location.search]);
  const focusValores = currentSection === 'valores';

  // Load permissions
  useEffect(() => {
    loadPlanos();
    loadBeneficios();
    loadPermissoes(getSessionUserId());
  }, [loadPlanos, loadPermissoes, loadBeneficios]);

  // Check permissions
  const canCreate = permissoes?.pode_criar_plano ?? true;
  const canEdit = permissoes?.pode_editar_plano ?? true;
  const canView = permissoes?.pode_visualizar_plano ?? true;
  const hasPermission = isViewMode ? canView : (isEditing ? canEdit : canCreate);

  // Load existing plano data 
  const plano = useMemo(() => planos.find(p => p.id === id), [planos, id]);

  useEffect(() => {
    if (!isEditing && empresasVisiveisSelecionadas.length === 0 && empresasDoGrupo.length > 0) {
      const padrao =
        empresaIdsFiltro.length > 0
          ? empresaIdsFiltro
          : empresasDoGrupo.map((e) => e.id);
      setEmpresasVisiveisSelecionadas([...new Set(padrao.filter(Boolean))]);
    }
  }, [isEditing, empresasDoGrupo, empresaIdsFiltro, empresasVisiveisSelecionadas.length]);

  useEffect(() => {
    if (plano) {
      setEmpresasVisiveisSelecionadas(empresasVisiveisDoPlano(plano));
      setFormData({
        nome: plano.nome,
        descricao: plano.descricao || '',
        descricao_completa: plano.descricao_completa || '',
        categoria: plano.categoria,
        categoria_id: plano.categoria_id || '',
        tipo: normalizeTipoBeneficio(plano.tipo),
        valorMensal: String(plano.valor_mensal_centavos / 100),
        valorAnual: plano.valor_anual_centavos ? String(plano.valor_anual_centavos / 100) : '',
        taxaAdesao: plano.taxa_adesao_centavos ? String(plano.taxa_adesao_centavos / 100) : '',
        maxBeneficiarios: String(plano.numero_max_beneficiarios),
        carenciaDias: String(plano.carencia_dias),
        status: plano.status,
        comissaoVendaInicial: String(plano.comissao_venda_inicial || 0),
        comissaoVendaFixa: plano.comissao_venda_fixa_centavos
          ? String(plano.comissao_venda_fixa_centavos / 100)
          : '0',
        comissaoRecorrente: String(plano.comissao_recorrente || 0),
        comissaoGerenteInicial: String(plano.comissao_gerente_inicial || 0),
        comissaoGerenteRecorrente: String(plano.comissao_gerente_recorrente || 0),
        comissaoAgentePercentual: String(plano.comissao_agente_percentual || 0),
        comissaoAgenteFixa: plano.comissao_agente_fixo_centavos
          ? String(plano.comissao_agente_fixo_centavos / 100)
          : '0',
        comissaoAtendentePercentual: String(plano.comissao_atendente_percentual || 0),
        comissaoAtendenteFixa: plano.comissao_atendente_fixo_centavos
          ? String(plano.comissao_atendente_fixo_centavos / 100)
          : '0',
      });
      // Load JSONB beneficios for checkboxes
      if (plano.beneficios) {
        setJsonBeneficios(plano.beneficios);
      }
    }
  }, [plano]);

  useEffect(() => {
    if (!id) {
      setKitsPlano([]);
      return;
    }
    void listarKitsPorPlano(id).then(setKitsPlano);
  }, [id]);

  const recarregarKitsPlano = useCallback(() => {
    if (!id) return;
    void listarKitsPorPlano(id).then(setKitsPlano);
  }, [id]);

  const handleGerarKitAutomatico = async () => {
    if (!id || !plano) return;
    const idsGrupo = empresasDoGrupo.map((e) => e.id).filter(Boolean);
    const empresaIdsProdutos = idsGrupo.length > 0 ? idsGrupo : empresaIdsFiltro;
    if (empresaIdsProdutos.length === 0) {
      showToast('Selecione a unidade no topo antes de gerar o kit.', 'warning');
      return;
    }

    setGerandoKit(true);
    try {
      const resultado = await criarKitDoPlano(id, empresaIdsProdutos);
      showToast(
        `Kit criado com ${resultado.itensInseridos} produto(s). Revise em Estoque → Kits se precisar ajustar.`,
        'success',
      );
      recarregarKitsPlano();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar kit do plano.';
      showToast(msg, 'error');
    } finally {
      setGerandoKit(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const toggleEmpresaVisivel = (empresaId: string) => {
    setEmpresasVisiveisSelecionadas((prev) => {
      if (prev.includes(empresaId)) {
        const next = prev.filter((id) => id !== empresaId);
        return next.length > 0 ? next : prev;
      }
      return [...prev, empresaId];
    });
  };

  const toggleJsonBeneficio = (nome: string) => {
    setJsonBeneficios(prev => {
      const exists = prev.find(b => b.nome === nome);
      if (exists) {
        return prev.filter(b => b.nome !== nome);
      }
      return [...prev, { nome, incluido: true }];
    });
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const valorMensal = toNumber(formData.valorMensal, 0);
    const valorAnual = toNumber(formData.valorAnual, 0);
    const taxaAdesao = toNumber(formData.taxaAdesao, 0);
    const maxBeneficiarios = toInt(formData.maxBeneficiarios, 0);
    const comissoes = [
      { label: 'Comissão vendedor (inicial)', value: toNumber(formData.comissaoVendaInicial, 0) },
      { label: 'Comissão vendedor (recorrente)', value: toNumber(formData.comissaoRecorrente, 0) },
      { label: 'Comissão gerente (inicial)', value: toNumber(formData.comissaoGerenteInicial, 0) },
      { label: 'Comissão gerente (recorrente)', value: toNumber(formData.comissaoGerenteRecorrente, 0) },
    ];

    if (!formData.nome.trim()) errors.push('O nome do plano é obrigatório.');
    if (!formData.descricao.trim()) errors.push('A descrição do plano é obrigatória.');
    if (valorMensal <= 0) errors.push('O valor mensal deve ser maior que zero.');
    if (formData.valorAnual && valorAnual <= 0) errors.push('O valor anual deve ser maior que zero.');
    if (valorAnual > 0 && valorAnual < valorMensal) errors.push('O valor anual não pode ser menor que o valor mensal.');
    if (taxaAdesao < 0) errors.push('A taxa de adesão não pode ser negativa.');
    if (maxBeneficiarios < 1) errors.push('O número máximo de beneficiários deve ser no mínimo 1.');

    for (const comissao of comissoes) {
      if (comissao.value < 0 || comissao.value > 100) {
        errors.push(`${comissao.label} deve estar entre 0% e 100%.`);
      }
    }

    return errors;
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewMode) return;
    if (!hasPermission) return;

    if (validationErrors.length > 0) {
      showToast(validationErrors[0], 'warning');
      return;
    }

    if (empresasVisiveisSelecionadas.length === 0) {
      showToast('Selecione ao menos uma unidade em que o plano ficará disponível.', 'warning');
      return;
    }

    setSaving(true);
    const userId = sessionStorage.getItem('userId');
    if (!userId) {
      setSaving(false);
      showToast('Sessão inválida. Faça login novamente.', 'error');
      navigate('/');
      return;
    }

    const beneficioIds = [
      ...new Set(
        jsonBeneficios
          .map((jb) => beneficiosDisponiveis.find((b) => b.nome === jb.nome)?.id)
          .filter((bid): bid is string => !!bid),
      ),
    ];

    const params = {
      nome: formData.nome,
      descricao: formData.descricao,
      descricao_completa: formData.descricao_completa || undefined,
      categoria: formData.categoria,
      categoria_id: formData.categoria_id || undefined,
      tipo: normalizeTipoBeneficio(formData.tipo),
      valor_mensal_centavos: toCentavos(formData.valorMensal),
      valor_anual_centavos: formData.valorAnual ? toCentavos(formData.valorAnual) : undefined,
      taxa_adesao_centavos: formData.taxaAdesao ? toCentavos(formData.taxaAdesao) : undefined,
      numero_max_beneficiarios: toInt(formData.maxBeneficiarios, 1),
      carencia_dias: toInt(formData.carenciaDias, 0),
      beneficios: jsonBeneficios.length > 0 ? jsonBeneficios : [],
      beneficio_ids: beneficioIds.length > 0 ? beneficioIds : undefined,
      comissao_venda_inicial: toNumber(formData.comissaoVendaInicial, 0),
      comissao_venda_fixa_centavos: formData.comissaoVendaFixa ? toCentavos(formData.comissaoVendaFixa) : 0,
      comissao_recorrente: toNumber(formData.comissaoRecorrente, 0),
      comissao_gerente_inicial: toNumber(formData.comissaoGerenteInicial, 0),
      comissao_gerente_recorrente: toNumber(formData.comissaoGerenteRecorrente, 0),
      comissao_agente_percentual: toNumber(formData.comissaoAgentePercentual, 0),
      comissao_agente_fixo_centavos: formData.comissaoAgenteFixa ? toCentavos(formData.comissaoAgenteFixa) : 0,
      comissao_atendente_percentual: toNumber(formData.comissaoAtendentePercentual, 0),
      comissao_atendente_fixo_centavos: formData.comissaoAtendenteFixa ? toCentavos(formData.comissaoAtendenteFixa) : 0,
      empresa_ids_visiveis: empresasVisiveisSelecionadas,
    };

    let errMsg: string | null = null;
    if (isEditing && id) {
      errMsg = await updatePlano(id, params, userId);
    } else {
      const newId = await createPlano(params, userId);
      if (!newId) errMsg = error || 'Não foi possível criar o plano. Verifique permissões e dados obrigatórios.';
    }

    setSaving(false);
    if (!errMsg) {
      showToast(`Plano ${isEditing ? 'atualizado' : 'criado'} com sucesso.`, 'success');
      setSuccess(true);
      setTimeout(() => navigate('/planos'), 1200);
    } else {
      showToast(errMsg, 'error');
    }
  };

  // Filter benefits by selected plan type
  const availableBenefits = useMemo(() => {
    const type = normalizeTipoBeneficio(formData.tipo);
    return beneficiosDisponiveis.filter(b => normalizeTipoBeneficio(b.tipo) === type);
  }, [beneficiosDisponiveis, formData.tipo]);

  // Redirect if no permission
  if (!hasPermission && permissoes) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Acesso Negado</h2>
        <p className="text-gray-500 mb-6">
          Você não tem permissão para {isViewMode ? 'visualizar' : (isEditing ? 'editar' : 'criar')} planos.
        </p>
        <Button variant="outline" onClick={() => navigate('/planos')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para Planos
        </Button>
      </div>
    );
  }

  if (isEditing && id && !plano && !loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Plano não encontrado. <Button variant="outline" onClick={() => navigate('/planos')}>Voltar</Button>
      </div>
    );
  }

  // Success animation
  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Plano {isEditing ? 'atualizado' : 'criado'} com sucesso!
        </h2>
        <p className="text-gray-500 mt-2">Redirecionando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <PageHeader
        title={isViewMode ? 'Detalhes do Plano' : (isEditing ? 'Editar Plano' : 'Novo Plano')}
        subtitle={isViewMode
          ? 'Visualização em modo somente leitura'
          : (isEditing ? 'Edite dados e valores do plano selecionado' : 'Preencha as informações do plano')}
        actionButton={
          <Button variant="outline" size="sm" onClick={() => navigate('/planos')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isViewMode && validationErrors.length > 0 && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-800">Pendências para salvar</p>
            <p className="text-xs text-amber-700 mt-1">{validationErrors[0]}</p>
          </Card>
        )}
        <div className="contents">
          {/* Informações Básicas */}
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Informações Básicas</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input
                label="Nome do Plano *"
                name="nome"
                value={formData.nome}
                onChange={handleChange}
                placeholder="Ex: Plano Familiar Premium"
                disabled={isViewMode}
                required
              />
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Segmento *" name="tipo" value={formData.tipo} onChange={handleChange} disabled={isViewMode}>
                    {segmentoOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                  <Select label="Categoria *" name="categoria" value={formData.categoria} onChange={handleChange} disabled={isViewMode}>
                    {categoriaOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </div>
                <Select label="Nível" name="categoria_id" value={formData.categoria_id} onChange={handleChange} disabled={isViewMode}>
                  <option value="">Selecionar...</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </Select>
              </div>
            </div>

            <Textarea
              label="Descrição *"
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              placeholder="Descreva os benefícios do plano..."
              rows={3}
              disabled={isViewMode}
              required
            />

            {empresasDoGrupo.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-sm font-medium text-gray-700">
                  Unidades em que o plano aparece *
                </p>
                <p className="text-xs text-gray-500">
                  {visaoConsolidada
                    ? 'Marque Onix, Fênix e demais CNPJs do grupo em que este plano pode ser vendido.'
                    : 'Por padrão usa a unidade do seletor no topo; marque outras se o plano for compartilhado.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {empresasDoGrupo.map((emp) => {
                    const sel = empresasVisiveisSelecionadas.includes(emp.id);
                    const label = unidadeNomeCurto(emp.nome);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        disabled={isViewMode}
                        onClick={() => toggleEmpresaVisivel(emp.id)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                          sel
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-medium'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        } ${isViewMode ? 'cursor-not-allowed opacity-80' : ''}`}
                      >
                        {sel && <Check className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
                {isEditing && plano && (
                  <p className="text-xs text-gray-400">
                    Atual: {rotulosUnidadesPlano(plano, empresaNomePorId).join(', ') || '—'}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="status" value="ativo"
                  checked={formData.status === 'ativo'} onChange={handleChange}
                  className="text-blue-600 focus:ring-blue-500"
                  disabled={isViewMode}
                />
                <span className="text-sm">Ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="status" value="inativo"
                  checked={formData.status === 'inativo'} onChange={handleChange}
                  className="text-blue-600 focus:ring-blue-500"
                  disabled={isViewMode}
                />
                <span className="text-sm">Inativo</span>
              </label>
            </div>
          </Card>

          {/* Valores */}
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Valores e Condições</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Input
                label="Valor Mensal (R$) *"
                name="valorMensal"
                type="number" step="0.01" min="0"
                value={formData.valorMensal}
                onChange={handleChange}
                placeholder="0.00"
                autoFocus={focusValores && !isViewMode}
                disabled={isViewMode}
                required
              />
              <Input
                label="Valor Anual (R$)"
                name="valorAnual"
                type="number" step="0.01" min="0"
                value={formData.valorAnual}
                onChange={handleChange}
                placeholder="0.00"
                disabled={isViewMode}
              />
              <Input
                label="Taxa de Adesão (R$)"
                name="taxaAdesao"
                type="number" step="0.01" min="0"
                value={formData.taxaAdesao}
                onChange={handleChange}
                placeholder="0.00"
                disabled={isViewMode}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input
                label="Máx. Beneficiários *"
                name="maxBeneficiarios"
                type="number" min="1"
                value={formData.maxBeneficiarios}
                onChange={handleChange}
                disabled={isViewMode}
                required
              />
              <Select label="Carência *" name="carenciaDias" value={formData.carenciaDias} onChange={handleChange} disabled={isViewMode}>
                {carenciaOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>
          </Card>

          {/* Benefícios / Serviços */}
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-5 w-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Benefícios Inclusos</h3>
            </div>
            <p className="text-sm text-gray-500">Selecione os serviços incluídos neste plano:</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableBenefits.length > 0 ? (
                availableBenefits.map(ben => {
                  const isSelected = jsonBeneficios.some(b => b.nome === ben.nome);
                  return (
                    <button
                      key={ben.id}
                      type="button"
                      onClick={() => !isViewMode && toggleJsonBeneficio(ben.nome)}
                      disabled={isViewMode}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all text-left ${isSelected
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        } ${isViewMode ? 'cursor-not-allowed opacity-80' : ''}`}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-600' : 'bg-gray-200'
                        }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="truncate">{ben.nome}</span>
                    </button>
                  );
                })
              ) : (
                <p className="col-span-3 text-center text-gray-400 py-4 border border-dashed rounded-lg">
                  Nenhum benefício cadastrado para este segmento.
                </p>
              )}
            </div>
          </Card>

          {isEditing && (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Kit do Plano (Atendimento)</h3>
                </div>
                {!isViewMode && (
                  <div className="flex gap-2 flex-wrap">
                    {kitsPlano.length === 0 && (
                      <Button
                        type="button"
                        size="sm"
                        loading={gerandoKit}
                        onClick={() => void handleGerarKitAutomatico()}
                      >
                        Gerar kit automaticamente
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/estoque/kits/novo?plano_id=${id}`)}
                    >
                      Montar kit manualmente
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500">
                O kit vinculado a este plano é usado no atendimento pelo botão &quot;Kit do plano&quot; — todos os produtos cadastrados no kit são lançados de uma vez (ex.: urna, flores, paramentação do Plano Fênix).
              </p>
              {kitsPlano.length === 0 ? (
                <div className="border border-dashed rounded-lg p-4 text-sm text-gray-500 text-center space-y-2">
                  <p>Nenhum kit vinculado a este plano.</p>
                  <p>Use <strong>Gerar kit automaticamente</strong> para montar com os produtos do estoque do grupo, ou monte manualmente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {kitsPlano.map((kit) => (
                    <div
                      key={kit.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-gray-50"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{kit.nome}</p>
                        {kit.descricao && <p className="text-xs text-gray-500">{kit.descricao}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/estoque/kits/${kit.id}/editar`)}
                      >
                        Editar kit
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Comissões */}
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg font-semibold text-gray-900">Comissões de Venda</h3>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              Percentual sobre adesão e bônus fixo por contrato são cumulativos no módulo de comissões.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Input
                label="Vendedor (% sobre adesão)"
                name="comissaoVendaInicial"
                type="number" step="0.01" min="0" max="100"
                value={formData.comissaoVendaInicial}
                onChange={handleChange}
                disabled={isViewMode}
              />
              <Input
                label="Vendedor (bônus fixo R$)"
                name="comissaoVendaFixa"
                type="number" step="0.01" min="0"
                value={formData.comissaoVendaFixa}
                onChange={handleChange}
                disabled={isViewMode}
              />
              <Input
                label="Vendedor (Recorrente %)"
                name="comissaoRecorrente"
                type="number" step="0.01" min="0" max="100"
                value={formData.comissaoRecorrente}
                onChange={handleChange}
                disabled={isViewMode}
              />
              <Input
                label="Gerente (Inicial)"
                name="comissaoGerenteInicial"
                type="number" step="0.01" min="0" max="100"
                value={formData.comissaoGerenteInicial}
                onChange={handleChange}
                disabled={isViewMode}
              />
              <Input
                label="Gerente (Recorrente)"
                name="comissaoGerenteRecorrente"
                type="number" step="0.01" min="0" max="100"
                value={formData.comissaoGerenteRecorrente}
                onChange={handleChange}
                disabled={isViewMode}
              />
            </div>

            <div className="pt-4 border-t space-y-3">
              <h4 className="text-sm font-semibold text-gray-800">Comissões operacionais (OS concluída)</h4>
              <p className="text-xs text-gray-500">
                Percentual sobre faturamento da OS e valor fixo por OS são cumulativos, conforme o plano ativo do cliente.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input
                  label="Agente Funerário (%)"
                  name="comissaoAgentePercentual"
                  type="number" step="0.01" min="0" max="100"
                  value={formData.comissaoAgentePercentual}
                  onChange={handleChange}
                  disabled={isViewMode}
                />
                <Input
                  label="Agente Funerário (fixo R$)"
                  name="comissaoAgenteFixa"
                  type="number" step="0.01" min="0"
                  value={formData.comissaoAgenteFixa}
                  onChange={handleChange}
                  disabled={isViewMode}
                />
                <Input
                  label="Atendente (%)"
                  name="comissaoAtendentePercentual"
                  type="number" step="0.01" min="0" max="100"
                  value={formData.comissaoAtendentePercentual}
                  onChange={handleChange}
                  disabled={isViewMode}
                />
                <Input
                  label="Atendente (fixo R$)"
                  name="comissaoAtendenteFixa"
                  type="number" step="0.01" min="0"
                  value={formData.comissaoAtendenteFixa}
                  onChange={handleChange}
                  disabled={isViewMode}
                />
              </div>
            </div>
          </Card>

        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/planos')}>
            Voltar
          </Button>
          {!isViewMode && (
            !isEditing ? (
              <Button type="submit" loading={saving} disabled={!hasPermission}>
                <Save className="h-4 w-4 mr-1" />
                Criar Plano
              </Button>
            ) : (
              <Button type="submit" loading={saving} disabled={!hasPermission}>
                <Save className="h-4 w-4 mr-1" />
                Salvar Alterações
              </Button>
            )
          )}
        </div>
      </form>
    </div>
  );
};
