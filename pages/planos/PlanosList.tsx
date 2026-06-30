import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, ClipboardList, Eye, Edit2, ShoppingCart, Trash2, 
  Sparkles, ShieldAlert, CheckCircle, Info, Tag, MoreVertical
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { usePlanosStore } from '../../lib/PlanosStore';
import { useToast } from '../../lib/ToastStore';

export const PlanosList: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { planos, deletePlano, loading } = usePlanosStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('');
  
  // Selection state
  const [selectedPlanoId, setSelectedPlanoId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedPlano, setSelectedPlano] = useState<any | null>(null);

  const filteredPlanos = planos.filter((p) => {
    const matchSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    const matchCategoria = !categoriaFilter || p.categoria === categoriaFilter;
    return matchSearch && matchStatus && matchCategoria;
  });

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza de que deseja excluir o plano "${name}"?`)) {
      setDeletingId(id);
      try {
        const success = await deletePlano(id);
        if (success) {
          showToast(`Plano "${name}" excluído com sucesso.`, 'success');
          if (selectedPlanoId === id) setSelectedPlanoId(null);
        } else {
          showToast('Erro ao excluir o plano.', 'error');
        }
      } catch (err) {
        showToast('Ocorreu um erro ao excluir o plano.', 'error');
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div 
      className="space-y-6 select-none" 
      onClick={() => {
        setSelectedPlanoId(null);
        setOpenMenuId(null);
      }}
    >
      <PageHeader 
        title="Gerência de Planos" 
        subtitle="Gerencie os planos oferecidos pela empresa"
        actionButton={
          <Button onClick={() => navigate('/planos/novo')} className="bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1.5 shadow-sm transition-all">
            <Sparkles className="h-4 w-4" /> Novo Plano
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Buscar plano..." 
            className="pl-9 bg-slate-50/50 focus:bg-white transition-all border-slate-200" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border-slate-200 bg-slate-50/50">
            <option value="">Status: Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Select>
        </div>
        <div className="w-full md:w-48">
          <Select value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)} className="border-slate-200 bg-slate-50/50">
            <option value="">Categoria: Todas</option>
            <option value="individual">Individual</option>
            <option value="familiar">Familiar</option>
            <option value="empresarial">Empresarial</option>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-500 font-medium">Carregando planos...</p>
        </div>
      ) : filteredPlanos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlanos.map((plano) => {
            const isSelected = selectedPlanoId === plano.id;
            const valorMensal = plano.valor_mensal_centavos / 100;
            const valorAnual = plano.valor_anual_centavos ? plano.valor_anual_centavos / 100 : null;
            const clientesAtivos = plano.clientes_ativos_qtd || 0;

            return (
              <div 
                key={plano.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlanoId(plano.id);
                  setSelectedPlano(plano);
                  setOpenMenuId(plano.id);
                  setMenuPosition({ x: e.clientX, y: e.clientY });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  navigate(`/planos/${plano.id}`);
                }}
                className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col h-[340px] ${
                  isSelected 
                    ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/5 shadow-lg scale-[1.01]' 
                    : 'border-slate-150 bg-white hover:border-slate-300 hover:shadow-md hover:-translate-y-1'
                }`}
              >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-slate-50/50 to-white">
                  <div className="space-y-1 pr-4 flex-1">
                    <h3 className="font-bold text-lg text-slate-800 leading-tight group-hover:text-blue-600 transition-colors">
                      {plano.nome}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">
                        {plano.codigo}
                      </span>
                      {plano.tipo && (
                        <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Tag className="h-2.5 w-2.5" /> {plano.tipo}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <StatusBadge status={plano.status} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanoId(plano.id);
                        setSelectedPlano(plano);
                        setOpenMenuId(plano.id);
                        setMenuPosition({ x: e.clientX, y: e.clientY });
                      }}
                      className={`p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 ${
                        openMenuId === plano.id ? 'bg-slate-100 text-slate-600' : ''
                      }`}
                      title="Mais ações"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-baseline mb-3">
                      <span className="text-3xl font-extrabold text-blue-600 tracking-tight">
                        R$ {valorMensal.toFixed(2)}
                      </span>
                      <span className="text-sm text-slate-400 font-medium ml-1">/mês</span>
                      {valorAnual && (
                        <span className="text-xs text-emerald-600 font-medium ml-3 bg-emerald-50 px-2 py-0.5 rounded-full">
                          ou R$ {valorAnual.toFixed(2)}/ano
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-slate-500 line-clamp-3 leading-relaxed mb-4">
                      {plano.descricao || 'Sem descrição cadastrada.'}
                    </p>
                  </div>
                  
                  {/* Footer Metrics */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-50 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Clientes Ativos</p>
                        <p className="font-bold text-slate-700 leading-tight">{clientesAtivos}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-50 rounded-lg">
                        <Info className="h-4 w-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Categoria</p>
                        <p className="font-bold text-slate-700 leading-tight capitalize">{plano.categoria_nome || plano.categoria}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm" onClick={(e) => e.stopPropagation()}>
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <ClipboardList className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Nenhum plano encontrado</h3>
          <p className="text-slate-400 mt-1 max-w-sm mx-auto text-sm leading-relaxed">
            Não encontramos planos com os filtros selecionados. Tente limpar os filtros ou cadastrar um novo plano.
          </p>
          <Button className="mt-6 border-slate-200 hover:bg-slate-50 text-slate-600 font-medium" variant="outline" onClick={() => {
            setSearchTerm('');
            setStatusFilter('');
            setCategoriaFilter('');
          }}>
            Limpar Filtros
          </Button>
        </div>
      )}
      
      {/* Mini menu de ações (overlay fixo) */}
      {openMenuId && selectedPlano && menuPosition && (
        <DropdownMenuContent
          isOpen={true}
          onClose={() => {
            setOpenMenuId(null);
            setSelectedPlanoId(null);
          }}
          position={menuPosition}
        >
          <div className="px-3 py-2 border-b mb-1">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ações do Plano</p>
            <p className="text-[11px] text-gray-400 truncate font-mono">{selectedPlano.nome}</p>
          </div>

          <DropdownMenuItem
            onClick={() => {
              navigate(`/planos/${selectedPlano.id}?modo=visualizar`);
              setOpenMenuId(null);
              setSelectedPlanoId(null);
            }}
          >
            <Eye className="h-4 w-4 mr-2 text-slate-500" />
            Visualizar Detalhes
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              navigate(`/planos/${selectedPlano.id}`);
              setOpenMenuId(null);
              setSelectedPlanoId(null);
            }}
          >
            <Edit2 className="h-4 w-4 mr-2 text-blue-500" />
            Editar Plano
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              navigate(`/clientes/novo?planoId=${selectedPlano.id}`);
              setOpenMenuId(null);
              setSelectedPlanoId(null);
            }}
          >
            <ShoppingCart className="h-4 w-4 mr-2 text-emerald-500" />
            Vender Plano
          </DropdownMenuItem>

          <DropdownMenuItem
            variant="danger"
            disabled={deletingId === selectedPlano.id}
            onClick={() => {
              const id = selectedPlano.id;
              const nome = selectedPlano.nome;
              setOpenMenuId(null);
              setSelectedPlanoId(null);
              void handleDelete(id, nome);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2 text-red-500" />
            Excluir Plano
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}

      {/* Selection Help Badge */}
      {filteredPlanos.length > 0 && (
        <div className="flex justify-center">
          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            Clique <strong>uma vez</strong> para abrir o menu de ações ou <strong>duas vezes</strong> para editar diretamente.
          </p>
        </div>
      )}
    </div>
  );
};