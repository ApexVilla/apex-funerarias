import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Card, Button, Input, Select, Textarea } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { usePlanosStore } from '../../lib/PlanosStore';
import {
  carregarProdutosGrupo,
  sugerirItensKitDoPlano,
  type ProdutoKitRef,
} from '../../lib/kitPlanoService';

export const EstoqueKitForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const planoIdUrl = searchParams.get('plano_id') || '';
  const { showToast } = useToast();
  const {
    empresaIdOperacao,
    empresaIdsFiltro,
    empresasDoGrupo,
    dataRevisionEmpresa,
  } = useEmpresaIdsOperacao();
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [produtos, setProdutos] = useState<ProdutoKitRef[]>([]);
  const [sugestaoAplicada, setSugestaoAplicada] = useState(false);
  
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    plano_id: ''
  });

  const [itens, setItens] = useState<{ id?: string; produto_id: string; quantidade: number }[]>([]);

  const { planos: planosFromStore, loadPlanos } = usePlanosStore();
  
  useEffect(() => {
    if (empresaIdOperacao) {
      loadPlanos(empresaIdOperacao);
    }
  }, [loadPlanos, empresaIdOperacao]);

  useEffect(() => {
    const loadDependencies = async () => {
      try {
        const idsGrupo = empresasDoGrupo.map((e) => e.id).filter(Boolean);
        const empresaIdsProdutos = idsGrupo.length > 0 ? idsGrupo : empresaIdsFiltro;
        const resProdutos = await carregarProdutosGrupo(empresaIdsProdutos);
        setProdutos(resProdutos);

        if (id) {
          const [kitRes, itensRes] = await Promise.all([
            supabase.from('estoque_kits').select('*').eq('id', id).single(),
            supabase.from('estoque_kit_itens').select('*').eq('kit_id', id)
          ]);
          if (kitRes.data) {
            setForm({
              nome: kitRes.data.nome,
              descricao: kitRes.data.descricao || '',
              plano_id: kitRes.data.plano_id || ''
            });
          }
          if (itensRes.data) {
            setItens(itensRes.data.map((i: any) => ({
              id: i.id,
              produto_id: i.produto_id,
              quantidade: i.quantidade
            })));
          }
        }
      } catch (err) {
        console.error(err);
        showToast('Erro ao carregar dados do kit.', 'error');
      } finally {
        setLoading(false);
      }
    };
    if (empresaIdOperacao) loadDependencies();
  }, [empresaIdOperacao, empresaIdsFiltro, empresasDoGrupo, dataRevisionEmpresa, id, showToast]);

  useEffect(() => {
    if (!id && planoIdUrl) {
      setForm((prev) => ({ ...prev, plano_id: planoIdUrl }));
    }
  }, [id, planoIdUrl]);

  useEffect(() => {
    if (id || !planoIdUrl || sugestaoAplicada || produtos.length === 0) return;

    const plano = planosFromStore.find((p) => p.id === planoIdUrl);
    if (!plano) return;

    setForm((prev) => ({
      ...prev,
      plano_id: planoIdUrl,
      nome: prev.nome || `Kit ${plano.nome}`,
      descricao: prev.descricao || `Produtos padrão do ${plano.nome} para lançamento no atendimento.`,
    }));

    const sugeridos = sugerirItensKitDoPlano(plano.beneficios, produtos);
    if (sugeridos.length > 0) {
      setItens(sugeridos.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })));
      showToast(
        `${sugeridos.length} produto(s) sugerido(s) com base nos benefícios do plano. Revise e salve.`,
        'success',
      );
    } else {
      showToast(
        'Plano vinculado. Adicione os produtos manualmente — nenhum item foi encontrado automaticamente no estoque.',
        'warning',
      );
    }
    setSugestaoAplicada(true);
  }, [id, planoIdUrl, planosFromStore, produtos, sugestaoAplicada, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome) { showToast('Nome é obrigatório.', 'error'); return; }
    if (itens.length === 0) { showToast('Adicione pelo menos um produto ao kit.', 'error'); return; }
    if (!empresaIdOperacao) {
      showToast('Empresa não identificada. Faça login novamente.', 'error');
      return;
    }
    
    const planoVinculado = form.plano_id
      ? planosFromStore.find((p) => p.id === form.plano_id)
      : null;
    const empresaKit = planoVinculado?.empresa_id || empresaIdOperacao;

    setSaving(true);
    try {
      const kitData = id
            ? {
            nome: form.nome,
            descricao: form.descricao,
            plano_id: form.plano_id || null,
            updated_at: new Date().toISOString(),
          }
        : {
            empresa_id: empresaKit,
            nome: form.nome,
            descricao: form.descricao,
            plano_id: form.plano_id || null,
            updated_at: new Date().toISOString(),
          };

      let kitId = id;
      if (id) {
        const { error: updateErr } = await supabase.from('estoque_kits').update(kitData).eq('id', id);
        if (updateErr) throw updateErr;
        const { error: deleteErr } = await supabase.from('estoque_kit_itens').delete().eq('kit_id', id);
        if (deleteErr) throw deleteErr;
      } else {
        const { data, error } = await supabase.from('estoque_kits').insert(kitData).select().single();
        if (error) throw error;
        kitId = data.id;
      }

      if (kitId) {
        const itensToInsert = itens.map(i => ({
          kit_id: kitId,
          produto_id: i.produto_id,
          quantidade: i.quantidade
        }));
        const { error: itensErr } = await supabase.from('estoque_kit_itens').insert(itensToInsert);
        if (itensErr) throw itensErr;
      }

      showToast(id ? 'Kit atualizado com sucesso!' : 'Kit criado com sucesso!', 'success');
      navigate('/estoque/kits');
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar kit.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    setItens([...itens, { produto_id: '', quantidade: 1 }]);
  };

  const removeItem = (index: number) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItens = [...itens];
    newItens[index] = { ...newItens[index], [field]: value };
    setItens(newItens);
  };

  if (loading) return <div className="p-12 text-center text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={id ? 'Editar Kit' : 'Novo Kit'}
        subtitle="Agrupe produtos que compõem um plano ou pacote padrão."
        actionButton={
          <Button variant="outline" onClick={() => navigate('/estoque/kits')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-16">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-gray-900 border-b pb-2">Informações do Kit</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome do Kit *"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
                placeholder="Ex: Kit Luxo, Kit Essencial..."
              />
              <Select
                label="Associar ao Plano"
                value={form.plano_id}
                onChange={(e) => setForm({ ...form, plano_id: e.target.value })}
                disabled={loading}
              >
                <option value="">Sem plano associado (Kit Avulso)</option>
                {planosFromStore.length === 0 && <option disabled>Carregando planos...</option>}
                {planosFromStore.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            </div>
            <Textarea
              label="Descrição / Observações"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              rows={2}
            />
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Itens do Kit</h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Produto
              </Button>
            </div>

            <div className="space-y-3">
              {itens.map((item, index) => (
                <div key={index} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1">
                    <Select
                      value={item.produto_id}
                      onChange={(e) => updateItem(index, 'produto_id', e.target.value)}
                      required
                    >
                      <option value="">Selecione um produto...</option>
                      {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="1"
                      required
                      value={item.quantidade}
                      onChange={(e) => updateItem(index, 'quantidade', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <button type="button" onClick={() => removeItem(index)} className="p-2 text-gray-400 hover:text-red-500 rounded">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}
              {itens.length === 0 && (
                <div className="text-center p-6 border-2 border-dashed rounded-lg text-gray-400">
                  Nenhum produto adicionado ao kit ainda.
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-24">
            <h3 className="font-bold text-gray-900 border-b pb-2 mb-4">Resumo</h3>
            <div className="text-sm text-gray-600 space-y-2 mb-6">
              <p>Total de itens: <span className="font-bold text-gray-900">{itens.length}</span></p>
            </div>
            <div className="space-y-3">
              <Button type="submit" className="w-full" loading={saving}>
                <Save className="h-4 w-4 mr-2" /> Salvar Kit
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/estoque/kits')}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
};
