import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Badge, Textarea } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao, filtrarQueryPorEmpresaIds } from '../../lib/useEmpresaIdsOperacao';
import { 
  AlertTriangle, Search, Plus, Edit2, User, Trash2, X, Star, ArrowUpCircle, ShieldAlert, Ban, Info, Clock
} from 'lucide-react';

interface Ocorrencia {
  id: string;
  usuario_id: string;
  tipo: 'advertencia' | 'suspensao' | 'elogio' | 'promocao' | 'afastamento' | 'outro';
  data: string;
  descricao: string;
  criado_por: string;
  empresa_id: string;
  
  // Join fields
  usuario_nome?: string;
  usuario_cargo?: string;
  criado_por_nome?: string;
  empresa_nome?: string;
}

interface ColaboradorSelect {
  id: string;
  nome: string;
  role: string;
}

const tipoOptions = [
  { value: 'advertencia', label: 'Advertência' },
  { value: 'suspensao', label: 'Suspensão' },
  { value: 'elogio', label: 'Elogio / Destaque' },
  { value: 'promocao', label: 'Promoção' },
  { value: 'afastamento', label: 'Afastamento / Licença' },
  { value: 'outro', label: 'Outra Ocorrência' }
];

export const OcorrenciasList: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { empresaIdsFiltro, empresasDoGrupo, empresaNomePorId, aguardandoContexto } = useEmpresaIdsOperacao();

  // Estados de Listagem
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorSelect[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');

  // Estados de Modais
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedOcorrencia, setSelectedOcorrencia] = useState<Ocorrencia | null>(null);

  // Formulário
  const [form, setForm] = useState({
    usuario_id: '',
    tipo: 'advertencia' as Ocorrencia['tipo'],
    data: '',
    descricao: '',
    empresa_id: ''
  });

  const loadData = async () => {
    if (aguardandoContexto) return;
    setLoading(true);
    try {
      // 1. Carrega todas as ocorrências com filtro de empresa
      let q = supabase
        .from('rh_ocorrencias')
        .select('*')
        .order('data', { ascending: false });

      q = filtrarQueryPorEmpresaIds(q, empresaIdsFiltro);
      const { data: ocorrenciasData, error: ocorrenciasErr } = await q;
      if (ocorrenciasErr) throw ocorrenciasErr;

      // 2. Carrega usuários correspondentes para fazer o join (tanto o colaborador quanto o criador) em memória
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

      const mergedOcorrencias: Ocorrencia[] = (ocorrenciasData || []).map(o => {
        const colab = usersMap.get(o.usuario_id);
        const criador = usersMap.get(o.criado_por);
        return {
          ...o,
          usuario_nome: colab?.nome || 'Colaborador não encontrado',
          usuario_cargo: colab?.role || '',
          criado_por_nome: criador?.nome || 'Gestor não encontrado',
          empresa_nome: empresaNomePorId[o.empresa_id] || 'Unidade Desconhecida'
        };
      });

      setOcorrencias(mergedOcorrencias);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar ocorrências.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [empresaIdsFiltro.join(','), aguardandoContexto]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedOcorrencia(null);
    setForm({
      usuario_id: colaboradores[0]?.id || '',
      tipo: 'advertencia',
      data: new Date().toISOString().substring(0, 10),
      descricao: '',
      empresa_id: empresaIdsFiltro[0] || empresasDoGrupo[0]?.id || ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (o: Ocorrencia) => {
    setIsEditing(true);
    setSelectedOcorrencia(o);
    setForm({
      usuario_id: o.usuario_id,
      tipo: o.tipo,
      data: o.data,
      descricao: o.descricao || '',
      empresa_id: o.empresa_id
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
        data: form.data,
        descricao: form.descricao,
        empresa_id: form.empresa_id,
        criado_por: user?.id || ''
      };

      if (!payload.criado_por) {
        throw new Error('Sua sessão expirou ou seu ID de usuário não foi localizado.');
      }

      if (!isEditing) {
        const { error } = await supabase.from('rh_ocorrencias').insert(payload);
        if (error) throw error;
        showToast('Ocorrência registrada com sucesso.', 'success');
      } else {
        if (!selectedOcorrencia?.id) throw new Error('ID da ocorrência inválido.');
        const { error } = await supabase
          .from('rh_ocorrencias')
          .update({
            usuario_id: form.usuario_id,
            tipo: form.tipo,
            data: form.data,
            descricao: form.descricao,
            empresa_id: form.empresa_id
          })
          .eq('id', selectedOcorrencia.id);
        if (error) throw error;
        showToast('Ocorrência atualizada com sucesso.', 'success');
      }

      setShowModal(false);
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao registrar ocorrência.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover esta ocorrência?')) return;
    try {
      const { error } = await supabase.from('rh_ocorrencias').delete().eq('id', id);
      if (error) throw error;
      showToast('Ocorrência excluída com sucesso.', 'success');
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir ocorrência.', 'error');
    }
  };

  const getTipoIcon = (tipo: Ocorrencia['tipo']) => {
    switch (tipo) {
      case 'advertencia': return <ShieldAlert className="h-5 w-5 text-amber-500" />;
      case 'suspensao': return <Ban className="h-5 w-5 text-red-500" />;
      case 'elogio': return <Star className="h-5 w-5 text-pink-500" />;
      case 'promocao': return <ArrowUpCircle className="h-5 w-5 text-emerald-500" />;
      case 'afastamento': return <Clock className="h-5 w-5 text-blue-500" />;
      default: return <Info className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTipoBadge = (tipo: Ocorrencia['tipo']) => {
    switch (tipo) {
      case 'advertencia': return <Badge variant="warning">Advertência</Badge>;
      case 'suspensao': return <Badge variant="danger">Suspensão</Badge>;
      case 'elogio': return <Badge variant="success">Elogio</Badge>;
      case 'promocao': return <Badge variant="success" className="bg-emerald-50 text-emerald-700 border-emerald-100">Promoção</Badge>;
      case 'afastamento': return <Badge variant="info">Afastamento</Badge>;
      default: return <Badge variant="secondary">Outro</Badge>;
    }
  };

  // Filtros aplicados em memória
  const filteredOcorrencias = ocorrencias.filter(o => {
    const matchesSearch = (o.usuario_nome || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipo = tipoFilter === 'todos' || o.tipo === tipoFilter;
    return matchesSearch && matchesTipo;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeader 
          title="Histórico de Ocorrências" 
          subtitle="Registro de elogios, promoções, advertências, suspensões e licenças dos funcionários"
        />
        <Button onClick={handleOpenCreate} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Registrar Ocorrência
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
              value={tipoFilter}
              onChange={(e: any) => setTipoFilter(e.target.value)}
            >
              <option value="todos">Todos os Tipos</option>
              {tipoOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Histórico/Timeline de Ocorrências */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando ocorrências...</div>
      ) : filteredOcorrencias.length === 0 ? (
        <Card className="p-12 text-center text-gray-500">
          <AlertTriangle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-base font-semibold text-gray-700">Nenhuma ocorrência registrada</p>
          <p className="text-sm text-gray-400 mt-1">Nenhum registro com os filtros atuais.</p>
        </Card>
      ) : (
        <div className="relative border-l-2 border-gray-200 ml-4 pl-8 space-y-6">
          {filteredOcorrencias.map(o => (
            <div key={o.id} className="relative">
              {/* Ícone no timeline */}
              <div className="absolute -left-[45px] top-1.5 bg-white border border-gray-200 rounded-full p-1.5 shadow-sm">
                {getTipoIcon(o.tipo)}
              </div>

              <Card className="hover:shadow-md transition-shadow duration-200 border border-gray-100 p-5 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      {o.usuario_nome}
                      {getTipoBadge(o.tipo)}
                    </h4>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      {o.usuario_cargo || 'Cargo indefinido'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 font-semibold">
                    {new Date(o.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </div>
                </div>

                <p className="text-sm text-gray-600 bg-gray-50/50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap">
                  {o.descricao}
                </p>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-gray-50 text-[11px] text-gray-500">
                  <div>
                    Registrado por: <strong>{o.criado_por_nome}</strong> | Unidade: <strong>{o.empresa_nome}</strong>
                  </div>
                  <div className="flex gap-2 self-end">
                    <Button size="sm" variant="outline" onClick={() => handleOpenEdit(o)} className="h-7 px-2">
                      <Edit2 className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(o.id)} className="h-7 px-2 text-red-600 hover:text-red-700 border-red-100 hover:bg-red-50">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Modal Ocorrência */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-lg bg-white">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-teal-600" />
                {isEditing ? 'Editar Ocorrência' : 'Registrar Ocorrência'}
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
                  label="Tipo de Ocorrência"
                  value={form.tipo}
                  onChange={(e: any) => setForm({ ...form, tipo: e.target.value })}
                >
                  {tipoOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>

                <Input
                  label="Data da Ocorrência"
                  type="date"
                  required
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                />
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

              <Textarea
                label="Descrição Detalhada"
                required
                rows={4}
                placeholder="Insira detalhes completos sobre o ocorrido, justificativas, advertências aplicadas ou justificativas de licença..."
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 shrink-0">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {isEditing ? 'Salvar Alterações' : 'Registrar Ocorrência'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
