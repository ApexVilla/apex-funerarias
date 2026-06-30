import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Badge, Textarea } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao, filtrarQueryPorEmpresaIds } from '../../lib/useEmpresaIdsOperacao';
import { 
  Calendar, Search, Plus, Edit2, User, Trash2, X, AlertCircle, CheckCircle, Clock, Play
} from 'lucide-react';

interface Ferias {
  id: string;
  usuario_id: string;
  data_inicio: string;
  data_fim: string;
  status: 'agendada' | 'gozo' | 'concluida' | 'cancelada';
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

const statusOptions = [
  { value: 'agendada', label: 'Agendada', color: 'indigo' },
  { value: 'gozo', label: 'Em Gozo', color: 'warning' },
  { value: 'concluida', label: 'Concluída', color: 'success' },
  { value: 'cancelada', label: 'Cancelada', color: 'danger' }
];

export const FeriasList: React.FC = () => {
  const { showToast } = useToast();
  const { empresaIdsFiltro, empresasDoGrupo, empresaNomePorId, aguardandoContexto } = useEmpresaIdsOperacao();

  // Estados de Listagem
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorSelect[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Estados de Modais
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedFerias, setSelectedFerias] = useState<Ferias | null>(null);

  // Formulário
  const [form, setForm] = useState({
    usuario_id: '',
    data_inicio: '',
    data_fim: '',
    status: 'agendada' as Ferias['status'],
    observacoes: '',
    empresa_id: ''
  });

  const loadData = async () => {
    if (aguardandoContexto) return;
    setLoading(true);
    try {
      // 1. Carrega todas as férias com filtro de empresa
      let q = supabase
        .from('rh_ferias')
        .select('*')
        .order('data_inicio', { ascending: false });

      q = filtrarQueryPorEmpresaIds(q, empresaIdsFiltro);
      const { data: feriasData, error: feriasErr } = await q;
      if (feriasErr) throw feriasErr;

      // 2. Carrega usuários correspondentes para fazer o join em memória
      let usersQuery: any = supabase
        .from('users')
        .select('id, nome, role, empresa_id');
      
      usersQuery = filtrarQueryPorEmpresaIds(usersQuery, empresaIdsFiltro);
      const { data: usersData, error: usersErr } = await usersQuery;
      if (usersErr) throw usersErr;

      // Monta listas e dicionários
      const usersMap = new Map<string, any>(usersData?.map(u => [u.id, u]) || []);
      
      // Salva a lista de colaboradores ativos para o select no formulário
      setColaboradores(
        (usersData || []).map(u => ({
          id: u.id,
          nome: u.nome || '',
          role: u.role || ''
        })).sort((a, b) => a.nome.localeCompare(b.nome))
      );

      const mergedFerias: Ferias[] = (feriasData || []).map(f => {
        const u = usersMap.get(f.usuario_id);
        return {
          ...f,
          usuario_nome: u?.nome || 'Colaborador não encontrado',
          usuario_cargo: u?.role || '',
          empresa_nome: empresaNomePorId[f.empresa_id] || 'Unidade Desconhecida'
        };
      });

      setFerias(mergedFerias);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar férias.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [empresaIdsFiltro.join(','), aguardandoContexto]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedFerias(null);
    setForm({
      usuario_id: colaboradores[0]?.id || '',
      data_inicio: new Date().toISOString().substring(0, 10),
      data_fim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // +30 dias
      status: 'agendada',
      observacoes: '',
      empresa_id: empresaIdsFiltro[0] || empresasDoGrupo[0]?.id || ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (f: Ferias) => {
    setIsEditing(true);
    setSelectedFerias(f);
    setForm({
      usuario_id: f.usuario_id,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
      status: f.status,
      observacoes: f.observacoes || '',
      empresa_id: f.empresa_id
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (new Date(form.data_fim) < new Date(form.data_inicio)) {
        throw new Error('A data de término não pode ser anterior à data de início.');
      }

      const payload = {
        usuario_id: form.usuario_id,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        status: form.status,
        observacoes: form.observacoes || null,
        empresa_id: form.empresa_id
      };

      if (!isEditing) {
        const { error } = await supabase.from('rh_ferias').insert(payload);
        if (error) throw error;
        showToast('Férias agendadas com sucesso.', 'success');
      } else {
        if (!selectedFerias?.id) throw new Error('ID das férias inválido.');
        const { error } = await supabase
          .from('rh_ferias')
          .update(payload)
          .eq('id', selectedFerias.id);
        if (error) throw error;
        showToast('Férias atualizadas com sucesso.', 'success');
      }

      setShowModal(false);
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao salvar férias.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente cancelar/remover este agendamento de férias?')) return;
    try {
      const { error } = await supabase.from('rh_ferias').delete().eq('id', id);
      if (error) throw error;
      showToast('Registro de férias excluído.', 'success');
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir férias.', 'error');
    }
  };

  const calculateDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const diff = e.getTime() - s.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
    return isNaN(days) ? 0 : days;
  };

  const getStatusIcon = (status: Ferias['status']) => {
    switch (status) {
      case 'agendada': return <Clock className="h-4 w-4 text-indigo-600" />;
      case 'gozo': return <Play className="h-4 w-4 text-amber-600 animate-pulse" />;
      case 'concluida': return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case 'cancelada': return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: Ferias['status']) => {
    switch (status) {
      case 'agendada': return <Badge variant="info">Agendada</Badge>;
      case 'gozo': return <Badge variant="warning">Em Gozo</Badge>;
      case 'concluida': return <Badge variant="success">Concluída</Badge>;
      case 'cancelada': return <Badge variant="danger">Cancelada</Badge>;
    }
  };

  // Filtros em memória
  const filteredFerias = ferias.filter(f => {
    const matchesSearch = (f.usuario_nome || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeader 
          title="Controle de Férias" 
          subtitle="Planejamento, agendamento e acompanhamento de períodos de gozo de férias dos colaboradores"
        />
        <Button onClick={handleOpenCreate} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Agendar Férias
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4 bg-gray-50/50 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos os Status</option>
              {statusOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Grid de Férias */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando agendamentos...</div>
      ) : filteredFerias.length === 0 ? (
        <Card className="p-12 text-center text-gray-500">
          <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-base font-semibold text-gray-700">Nenhum registro de férias</p>
          <p className="text-sm text-gray-400 mt-1">Nenhum agendamento ativo com os filtros atuais.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFerias.map(f => {
            const dias = calculateDays(f.data_inicio, f.data_fim);
            return (
              <Card key={f.id} className="relative hover:shadow-md transition-all duration-200 border border-gray-100 flex flex-col justify-between">
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-gray-50 rounded-lg shrink-0">
                        {getStatusIcon(f.status)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 line-clamp-1">{f.usuario_nome}</h4>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                          {f.usuario_cargo || 'Cargo indefinido'}
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(f.status)}
                  </div>

                  <div className="bg-gray-50/50 rounded-xl p-3 grid grid-cols-2 gap-2 text-center border border-gray-100/50">
                    <div>
                      <span className="text-[10px] text-gray-400 font-medium uppercase block">Início</span>
                      <strong className="text-xs text-gray-700">
                        {new Date(f.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </strong>
                    </div>
                    <div className="border-l border-gray-200">
                      <span className="text-[10px] text-gray-400 font-medium uppercase block">Fim</span>
                      <strong className="text-xs text-gray-700">
                        {new Date(f.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </strong>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Unidade: <strong>{f.empresa_nome}</strong></span>
                  <Badge variant="success" className="bg-teal-50 text-teal-700 border-teal-100">
                      {dias} {dias === 1 ? 'dia' : 'dias'}
                    </Badge>
                  </div>

                  {f.observacoes && (
                    <div className="text-xs text-gray-500 bg-gray-50/50 p-2.5 rounded-lg border border-dashed border-gray-200/50 line-clamp-2">
                      <strong>Obs:</strong> {f.observacoes}
                    </div>
                  )}
                </div>

                <div className="px-5 py-3.5 bg-gray-50/50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
                  <Button size="sm" variant="outline" onClick={() => handleOpenEdit(f)} className="flex items-center gap-1.5 h-8">
                    <Edit2 className="h-3 w-3" />
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(f.id)} className="flex items-center gap-1.5 h-8 text-red-600 hover:text-red-700 border-red-100 hover:bg-red-50">
                    <Trash2 className="h-3 w-3" />
                    Remover
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Agendamento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-lg bg-white">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-teal-600" />
                {isEditing ? 'Editar Agendamento' : 'Agendar Férias'}
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
                <Input
                  label="Data de Início"
                  type="date"
                  required
                  value={form.data_inicio}
                  onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                />
                <Input
                  label="Data de Término"
                  type="date"
                  required
                  value={form.data_fim}
                  onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Status"
                  value={form.status}
                  onChange={(e: any) => setForm({ ...form, status: e.target.value })}
                >
                  {statusOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>

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
                placeholder="Insira detalhes sobre as férias, substitutos ou observações administrativas..."
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 shrink-0">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {isEditing ? 'Salvar Alterações' : 'Confirmar Agendamento'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
