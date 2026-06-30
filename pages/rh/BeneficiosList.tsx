import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Badge, Textarea } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao, filtrarQueryPorEmpresaIds } from '../../lib/useEmpresaIdsOperacao';
import { 
  Gift, Search, Plus, Edit2, User, Trash2, X, Activity, CreditCard, Heart, Shield, Landmark, DollarSign
} from 'lucide-react';

interface Beneficio {
  id: string;
  usuario_id: string;
  tipo: 'vale_refeicao' | 'vale_alimentacao' | 'vale_transporte' | 'plano_saude' | 'plano_odontologico' | 'seguro_vida' | 'outro';
  valor: number;
  ativo: boolean;
  observacoes?: string;
  empresa_id: string;
  
  // Join fields
  usuario_nome?: string;
  usuario_cargo?: string;
  empresa_nome?: string;
}

interface ColaboradorSelect {
  id: string;
  nome: string;
  role: string;
}

const tipoOptions = [
  { value: 'vale_refeicao', label: 'Vale Refeição' },
  { value: 'vale_alimentacao', label: 'Vale Alimentação' },
  { value: 'vale_transporte', label: 'Vale Transporte' },
  { value: 'plano_saude', label: 'Plano de Saúde' },
  { value: 'plano_odontologico', label: 'Plano Odontológico' },
  { value: 'seguro_vida', label: 'Seguro de Vida' },
  { value: 'outro', label: 'Outro Benefício' }
];

export const BeneficiosList: React.FC = () => {
  const { showToast } = useToast();
  const { empresaIdsFiltro, empresasDoGrupo, empresaNomePorId, aguardandoContexto } = useEmpresaIdsOperacao();

  // Estados de Listagem
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorSelect[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');

  // Estados de Modais
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedBeneficio, setSelectedBeneficio] = useState<Beneficio | null>(null);

  // Formulário
  const [form, setForm] = useState({
    usuario_id: '',
    tipo: 'vale_refeicao' as Beneficio['tipo'],
    valor: '0.00',
    ativo: true,
    observacoes: '',
    empresa_id: ''
  });

  const loadData = async () => {
    if (aguardandoContexto) return;
    setLoading(true);
    try {
      // 1. Carrega benefícios com filtro de empresa
      let q = supabase
        .from('rh_beneficios')
        .select('*')
        .order('tipo', { ascending: true });

      q = filtrarQueryPorEmpresaIds(q, empresaIdsFiltro);
      const { data: beneficiosData, error: beneficiosErr } = await q;
      if (beneficiosErr) throw beneficiosErr;

      // 2. Carrega usuários correspondentes para fazer o join em memória
      let usersQuery = supabase
        .from('users')
        .select('id, nome, role, empresa_id');
      
      usersQuery = filtrarQueryPorEmpresaIds(usersQuery, empresaIdsFiltro);
      const { data: usersData, error: usersErr } = await usersQuery;
      if (usersErr) throw usersErr;

      // Monta listas e dicionários
      const usersMap = new Map(usersData?.map(u => [u.id, u]) || []);
      
      // Salva a lista de colaboradores ativos para o select no formulário
      setColaboradores(
        (usersData || []).map(u => ({
          id: u.id,
          nome: u.nome || '',
          role: u.role || ''
        })).sort((a, b) => a.nome.localeCompare(b.nome))
      );

      const mergedBeneficios: Beneficio[] = (beneficiosData || []).map(b => {
        const u = usersMap.get(b.usuario_id);
        return {
          ...b,
          usuario_nome: u?.nome || 'Colaborador não encontrado',
          usuario_cargo: u?.role || '',
          empresa_nome: empresaNomePorId[b.empresa_id] || 'Unidade Desconhecida'
        };
      });

      setBeneficios(mergedBeneficios);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar benefícios.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [empresaIdsFiltro.join(','), aguardandoContexto]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedBeneficio(null);
    setForm({
      usuario_id: colaboradores[0]?.id || '',
      tipo: 'vale_refeicao',
      valor: '0.00',
      ativo: true,
      observacoes: '',
      empresa_id: empresaIdsFiltro[0] || empresasDoGrupo[0]?.id || ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (b: Beneficio) => {
    setIsEditing(true);
    setSelectedBeneficio(b);
    setForm({
      usuario_id: b.usuario_id,
      tipo: b.tipo,
      valor: String(b.valor || '0.00'),
      ativo: b.ativo !== false,
      observacoes: b.observacoes || '',
      empresa_id: b.empresa_id
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        usuario_id: form.usuario_id,
        tipo: form.tipo,
        valor: parseFloat(form.valor) || 0,
        ativo: form.ativo,
        observacoes: form.observacoes || null,
        empresa_id: form.empresa_id
      };

      if (!isEditing) {
        const { error } = await supabase.from('rh_beneficios').insert(payload);
        if (error) throw error;
        showToast('Benefício atribuído com sucesso.', 'success');
      } else {
        if (!selectedBeneficio?.id) throw new Error('ID do benefício inválido.');
        const { error } = await supabase
          .from('rh_beneficios')
          .update(payload)
          .eq('id', selectedBeneficio.id);
        if (error) throw error;
        showToast('Benefício atualizado com sucesso.', 'success');
      }

      setShowModal(false);
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao salvar benefício.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este benefício do colaborador?')) return;
    try {
      const { error } = await supabase.from('rh_beneficios').delete().eq('id', id);
      if (error) throw error;
      showToast('Benefício removido com sucesso.', 'success');
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir benefício.', 'error');
    }
  };

  const getTipoIcon = (tipo: Beneficio['tipo']) => {
    switch (tipo) {
      case 'vale_refeicao':
      case 'vale_alimentacao':
        return <Activity className="h-4 w-4 text-emerald-600" />;
      case 'vale_transporte':
        return <CreditCard className="h-4 w-4 text-blue-600" />;
      case 'plano_saude':
      case 'plano_odontologico':
        return <Heart className="h-4 w-4 text-red-600" />;
      case 'seguro_vida':
        return <Shield className="h-4 w-4 text-purple-600" />;
      default:
        return <Gift className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTipoLabel = (tipo: Beneficio['tipo']) => {
    return tipoOptions.find(o => o.value === tipo)?.label || tipo;
  };

  // Filtros aplicados em memória
  const filteredBeneficios = beneficios.filter(b => {
    const matchesSearch = (b.usuario_nome || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipo = tipoFilter === 'todos' || b.tipo === tipoFilter;
    const matchesStatus = 
      statusFilter === 'todos' ||
      (statusFilter === 'ativos' && b.ativo !== false) ||
      (statusFilter === 'inativos' && b.ativo === false);

    return matchesSearch && matchesTipo && matchesStatus;
  });

  // Métricas do Dashboard Superior
  const totalValorAtivos = filteredBeneficios
    .filter(b => b.ativo)
    .reduce((sum, b) => sum + (b.valor || 0), 0);

  const totalAtivosCount = filteredBeneficios.filter(b => b.ativo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeader 
          title="Gestão de Benefícios" 
          subtitle="Atribuição, valores e controle de planos médicos, alimentação, transporte e seguros dos colaboradores"
        />
        <Button onClick={handleOpenCreate} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Atribuir Benefício
        </Button>
      </div>

      {/* Resumo Métrico */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-gradient-to-br from-teal-500 to-emerald-600 text-white border-0">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-teal-100 text-xs font-semibold uppercase tracking-wider">Custo Mensal Ativo</p>
              <h3 className="text-3xl font-extrabold mt-1">
                {totalValorAtivos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </h3>
            </div>
            <div className="p-3 bg-white/10 rounded-xl">
              <DollarSign className="h-8 w-8 text-teal-100" />
            </div>
          </div>
        </Card>
        <Card className="p-6 bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-0">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wider">Benefícios Concedidos</p>
              <h3 className="text-3xl font-extrabold mt-1">{totalAtivosCount} ativos</h3>
            </div>
            <div className="p-3 bg-white/10 rounded-xl">
              <Gift className="h-8 w-8 text-indigo-100" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-4 bg-gray-50/50 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar pelo nome do colaborador..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <Select
              value={tipoFilter}
              onChange={(e: any) => setTipoFilter(e.target.value)}
            >
              <option value="todos">Todos os Tipos</option>
              {tipoOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos os Status</option>
              <option value="ativos">Apenas Ativos</option>
              <option value="inativos">Apenas Inativos</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista de Benefícios */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando benefícios...</div>
      ) : filteredBeneficios.length === 0 ? (
        <Card className="p-12 text-center text-gray-500">
          <Gift className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-base font-semibold text-gray-700">Nenhum benefício encontrado</p>
          <p className="text-sm text-gray-400 mt-1">Nenhum registro correspondente aos filtros atuais.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBeneficios.map(b => (
            <Card key={b.id} className="relative hover:shadow-md transition-all duration-200 border border-gray-100 flex flex-col justify-between">
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gray-50 rounded-lg shrink-0">
                      {getTipoIcon(b.tipo)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 line-clamp-1">{b.usuario_nome}</h4>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                        {b.usuario_cargo || 'Cargo indefinido'}
                      </span>
                    </div>
                  </div>
                  {b.ativo ? (
                    <Badge variant="success">Ativo</Badge>
                  ) : (
                    <Badge variant="danger">Suspenso</Badge>
                  )}
                </div>

                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[10px] text-gray-400 font-medium uppercase block">Tipo de Benefício</span>
                    <strong className="text-sm text-gray-700">{getTipoLabel(b.tipo)}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 font-medium uppercase block">Valor Mensal</span>
                    <strong className="text-base text-teal-600">
                      {b.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-50">
                  <span>Unidade: <strong>{b.empresa_nome}</strong></span>
                </div>

                {b.observacoes && (
                  <div className="text-xs text-gray-500 bg-gray-50/50 p-2.5 rounded-lg border border-dashed border-gray-200/50 line-clamp-2">
                    <strong>Obs:</strong> {b.observacoes}
                  </div>
                )}
              </div>

              <div className="px-5 py-3.5 bg-gray-50/50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
                <Button size="sm" variant="outline" onClick={() => handleOpenEdit(b)} className="flex items-center gap-1.5 h-8">
                  <Edit2 className="h-3 w-3" />
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDelete(b.id)} className="flex items-center gap-1.5 h-8 text-red-600 hover:text-red-700 border-red-100 hover:bg-red-50">
                  <Trash2 className="h-3 w-3" />
                  Remover
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Atribuição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-lg bg-white">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Gift className="h-5 w-5 text-teal-600" />
                {isEditing ? 'Editar Benefício' : 'Atribuir Benefício'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <Select
                label="Colaborador"
                disabled={isEditing}
                required
                value={form.usuario_id}
                onChange={(e: any) => setForm({ ...form, usuario_id: e.target.value })}
              >
                <option value="">Selecione um colaborador...</option>
                {colaboradores.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.role})</option>
                ))}
              </Select>

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Tipo de Benefício"
                  value={form.tipo}
                  onChange={(e: any) => setForm({ ...form, tipo: e.target.value })}
                >
                  {tipoOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>

                <Input
                  label="Valor Mensal (R$)"
                  type="number"
                  step="0.01"
                  required
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="beneficio-ativo"
                    className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4 border-gray-300"
                    checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  />
                  <label htmlFor="beneficio-ativo" className="text-sm font-semibold text-gray-700 select-none">
                    Benefício Ativo
                  </label>
                </div>

                <Select
                  label="Empresa / Unidade"
                  value={form.empresa_id}
                  onChange={(e: any) => setForm({ ...form, empresa_id: e.target.value })}
                >
                  {empresasDoGrupo.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nome}</option>
                  ))}
                </Select>
              </div>

              <Textarea
                label="Observações / Detalhes"
                placeholder="Insira detalhes como número do cartão, operadora, vigência ou observações de desconto em folha..."
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 shrink-0">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {isEditing ? 'Salvar Alterações' : 'Conceder Benefício'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
