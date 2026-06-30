import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, PackagePlus, Edit2, Trash2, Box, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Card, Button, Input } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';

export const EstoqueKitsList: React.FC = () => {
  const navigate = useNavigate();
  const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
  const { showToast } = useToast();
  
  const [kits, setKits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const loadKits = useCallback(async () => {
    if (!empresaIdOperacao) return;
    setLoading(true);
    try {
      const empresaIds = empresaIdsFiltro;
      const { data, error } = await supabase
        .from('estoque_kits')
        .select('*, planos:plano_id ( nome )')
        .in('empresa_id', empresaIds)
        .order('nome');
      if (error) throw error;
      setKits(data || []);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar kits.', 'error');
    } finally {
      setLoading(false);
    }
  }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, showToast]);

  useEffect(() => {
    if (empresaIdOperacao) {
      void loadKits();
    }
  }, [empresaIdOperacao, loadKits]);

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este kit? Todos os itens associados serão removidos.')) return;
    try {
      const { error } = await supabase.from('estoque_kits').delete().eq('id', id);
      if (error) throw error;
      setKits(kits.filter(k => k.id !== id));
      showToast('Kit excluído com sucesso.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erro ao excluir kit.', 'error');
    }
  };

  const filteredKits = kits.filter(k => 
    k.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (k.planos?.nome || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredKits.length / PAGE_SIZE);
  const paginatedKits = filteredKits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
      setPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Kits"
        subtitle="Agrupe produtos e relacione-os a planos de atendimento."
        actionButton={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/estoque')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Button>
            <Button onClick={() => navigate('/estoque/kits/novo')}>
              <Plus className="h-4 w-4 mr-2" /> Novo Kit
            </Button>
          </div>
        }
      />

      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                placeholder="Buscar kit por nome ou plano..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-gray-500">
            Carregando kits...
          </div>
        ) : filteredKits.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
            <PackagePlus className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Nenhum kit encontrado</h3>
            <p className="text-gray-500 mt-1">Crie um kit para facilitar a inclusão de itens no atendimento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedKits.map(kit => (
              <div key={kit.id} className="border rounded-xl p-5 hover:border-blue-300 transition-colors bg-white shadow-sm flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div className="bg-pink-100 p-2 rounded-lg">
                    <PackagePlus className="h-6 w-6 text-pink-600" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => navigate(`/estoque/kits/${kit.id}/editar`)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(kit.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <h4 className="font-bold text-gray-900 text-lg mb-1">{kit.nome}</h4>
                {kit.planos?.nome && (
                  <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded mb-3 border border-purple-200">
                    Plano: {kit.planos.nome}
                  </span>
                )}
                <p className="text-sm text-gray-600 flex-1">{kit.descricao || 'Sem descrição.'}</p>
              </div>
            ))}
          </div>
        )}
        
        {/* Paginação */}
        {!loading && totalPages > 1 && (
            <div className="mt-6 pt-4 border-t flex items-center justify-between">
                <span className="text-xs text-gray-500">
                    Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, filteredKits.length)} de {filteredKits.length} resultados
                </span>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <span className="text-sm font-medium text-gray-700 px-2">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                        Próximo <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </div>
        )}
      </Card>
    </div>
  );
};
