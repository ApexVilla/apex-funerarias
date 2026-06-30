import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Save, X, Search, FileDown, ChevronDown, ChevronRight, Route, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Textarea } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { buildServicosCatalogoPdfBlob, imprimirServicosCatalogoPdf } from '../../lib/ServicosCatalogoPdf';
import { reservarJanelaImpressaoPdf, abrirPdfNaJanelaReservada } from '../../lib/printPdfBlob';
import {
  agruparServicosPorCategoria,
  badgeClasseCategoriaServico,
  CATEGORIAS_SERVICO_ORDEM,
  formatarPrecoServico,
  labelCategoriaServico,
  resumoCategoriaServico,
  servicoCobrancaPorKm,
  sugerirDescricaoServico,
} from '../../lib/servicosFunerariosCatalogo';
import {
  usuarioPodeAlterarStatusServicoFunerario,
  usuarioPodeEditarServicoFunerario,
  usuarioPodeExcluirServicoFunerario,
  usuarioPodeIncluirServicoFunerario,
} from '../../lib/servicosFunerariosPermissoes';

type ServicoRow = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao?: string | null;
  preco_base_centavos: number;
  categoria?: string | null;
  ativo: boolean;
  created_at: string;
};

/** Aceita "1500", "1500.50", "1.500,00", "150,50" etc. */
const toCentavos = (valor: string) => {
  const raw = (valor || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

export const ServicosFunerariosList: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { empresaIdEfetivo, empresaIdsParaFiltro, dataRevisionEmpresa } = useEmpresaContextoAtivo();
  const formRef = useRef<HTMLDivElement>(null);

  const permissoes = user?.permissoes as Record<string, unknown> | undefined;
  const podeIncluir = usuarioPodeIncluirServicoFunerario(user?.role, permissoes);
  const podeEditar = usuarioPodeEditarServicoFunerario(user?.role, permissoes);
  const podeExcluir = usuarioPodeExcluirServicoFunerario(user?.role, permissoes);
  const podeAlterarStatus = usuarioPodeAlterarStatusServicoFunerario(user?.role, permissoes);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('');
  const [servicos, setServicos] = useState<ServicoRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    categoria: 'geral',
    preco: '',
    ativo: true,
  });

  const empresaIdsConsulta = useMemo(() => {
    const ids = [...(empresaIdsParaFiltro || [])].map((id) => id.trim()).filter(Boolean);
    if (ids.length) return ids;
    const efetivo = (empresaIdEfetivo || '').trim();
    return efetivo ? [efetivo] : [];
  }, [empresaIdsParaFiltro, empresaIdEfetivo]);

  const loadServicos = useCallback(async () => {
    if (!empresaIdsConsulta.length) {
      setServicos([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ser_servicos')
        .select('*')
        .in('empresa_id', empresaIdsConsulta)
        .order('nome', { ascending: true });
      if (error) throw error;
      setServicos((data || []) as ServicoRow[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar serviços.';
      showToast(msg, 'error');
      setServicos([]);
    } finally {
      setLoading(false);
    }
  }, [empresaIdsConsulta, showToast]);

  useEffect(() => {
    void loadServicos();
  }, [loadServicos, dataRevisionEmpresa]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return servicos.filter((s) => {
      const matchSearch = !q || s.nome.toLowerCase().includes(q) || (s.descricao || '').toLowerCase().includes(q);
      const matchCategoria = !categoriaFilter || (s.categoria || 'geral') === categoriaFilter;
      return matchSearch && matchCategoria;
    });
  }, [servicos, search, categoriaFilter]);

  const grupos = useMemo(() => agruparServicosPorCategoria(filtered), [filtered]);

  const podeUsarFormulario = podeIncluir || (!!editingId && podeEditar);

  const resumoGeral = useMemo(() => {
    const ativos = filtered.filter((s) => s.ativo).length;
    return { total: filtered.length, ativos, categorias: grupos.length };
  }, [filtered, grupos.length]);

  useEffect(() => {
    setGruposAbertos((prev) => {
      const next = { ...prev };
      for (const g of grupos) {
        if (next[g.categoria] === undefined) next[g.categoria] = true;
      }
      return next;
    });
  }, [grupos]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ nome: '', descricao: '', categoria: 'geral', preco: '', ativo: true });
  };

  const onEdit = (s: ServicoRow) => {
    if (!podeEditar) {
      showToast('Sem permissão para editar serviços.', 'warning');
      return;
    }
    setEditingId(s.id);
    setForm({
      nome: s.nome,
      descricao: s.descricao || '',
      categoria: s.categoria || 'geral',
      preco: String((s.preco_base_centavos / 100).toFixed(2)),
      ativo: !!s.ativo,
    });
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const atualizarForm = (patch: Partial<typeof form>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (patch.categoria !== undefined || patch.nome !== undefined) {
        const sugestao = sugerirDescricaoServico(next.categoria, next.nome);
        if (sugestao && (!next.descricao.trim() || next.descricao === sugerirDescricaoServico(prev.categoria, prev.nome))) {
          next.descricao = sugestao;
        }
      }
      return next;
    });
  };

  const onSave = async () => {
    if (!form.nome.trim()) {
      showToast('Informe o nome do serviço.', 'warning');
      return;
    }
    if (editingId && !podeEditar) {
      showToast('Sem permissão para editar serviços.', 'warning');
      return;
    }
    if (!editingId && !podeIncluir) {
      showToast('Sem permissão para incluir serviços.', 'warning');
      return;
    }
    const precoCentavos = toCentavos(form.preco);
    if (precoCentavos <= 0) {
      showToast('Informe o valor do serviço (maior que zero).', 'warning');
      return;
    }
    const empresaId = (empresaIdEfetivo || '').trim();
    if (!empresaId) {
      showToast('Empresa não identificada. Selecione a unidade operacional.', 'error');
      return;
    }

    setSaving(true);
    try {
      const campos = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        categoria: form.categoria || 'geral',
        preco_base_centavos: precoCentavos,
        ativo: !!form.ativo,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from('ser_servicos').update(campos).eq('id', editingId);
        if (error) throw error;
        showToast('Serviço atualizado com sucesso.', 'success');
      } else {
        const { error } = await supabase.from('ser_servicos').insert({
          ...campos,
          empresa_id: empresaId,
        });
        if (error) throw error;
        showToast('Serviço cadastrado com sucesso.', 'success');
      }
      await loadServicos();
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar serviço.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAtivo = async (s: ServicoRow) => {
    if (!podeAlterarStatus) {
      showToast('Sem permissão para ativar ou desativar serviços.', 'warning');
      return;
    }
    setTogglingId(s.id);
    try {
      const { error } = await supabase
        .from('ser_servicos')
        .update({ ativo: !s.ativo, updated_at: new Date().toISOString() })
        .eq('id', s.id);
      if (error) throw error;
      showToast(s.ativo ? 'Serviço desativado.' : 'Serviço ativado.', 'success');
      await loadServicos();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar status do serviço.';
      showToast(msg, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const onExcluir = async (s: ServicoRow) => {
    if (!podeExcluir) {
      showToast('Sem permissão para excluir serviços.', 'warning');
      return;
    }
    const ok = window.confirm(
      `Excluir o serviço "${s.nome}"?\n\nEsta ação não pode ser desfeita. Se o serviço já foi usado em atendimentos, use Desativar em vez de excluir.`,
    );
    if (!ok) return;

    setDeletingId(s.id);
    try {
      const { count, error: usoErr } = await supabase
        .from('ser_atendimento_servicos')
        .select('id', { count: 'exact', head: true })
        .eq('servico_id', s.id);
      if (usoErr) throw usoErr;
      if ((count || 0) > 0) {
        showToast(
          'Este serviço já foi usado em atendimentos. Desative-o em vez de excluir.',
          'warning',
        );
        return;
      }

      const { error } = await supabase.from('ser_servicos').delete().eq('id', s.id);
      if (error) throw error;
      if (editingId === s.id) resetForm();
      showToast('Serviço excluído.', 'success');
      await loadServicos();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir serviço.';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const onImprimirCatalogo = async () => {
    const ativos = servicos.filter((s) => s.ativo);
    if (!ativos.length) {
      showToast('Nenhum serviço ativo para imprimir no catálogo.', 'warning');
      return;
    }
    const empresaId = (empresaIdEfetivo || '').trim();
    const janela = reservarJanelaImpressaoPdf();
    setPrintingPdf(true);
    try {
      const { blob, filename } = await buildServicosCatalogoPdfBlob(ativos, empresaId || null);
      const ok = await abrirPdfNaJanelaReservada(janela, blob);
      if (!ok) {
        await imprimirServicosCatalogoPdf(ativos, empresaId || null);
      }
      if (ok) showToast(`Catálogo aberto (${filename}).`, 'success');
    } catch (err) {
      if (janela && !janela.closed) janela.close();
      const msg = err instanceof Error ? err.message : 'Erro ao gerar PDF do catálogo.';
      showToast(msg, 'error');
    } finally {
      setPrintingPdf(false);
    }
  };

  const toggleGrupo = (categoria: string) => {
    setGruposAbertos((prev) => ({ ...prev, [categoria]: !prev[categoria] }));
  };

  const cobrancaPorKm = servicoCobrancaPorKm(form);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Serviços Funerários"
        subtitle="Catálogo organizado por categoria — valores fixos ou por quilômetro (translado)"
        actionButton={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void onImprimirCatalogo()} loading={printingPdf} className="border-slate-300">
              <FileDown className="h-4 w-4 mr-2" /> Imprimir catálogo PDF
            </Button>
            {podeIncluir && (
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" /> Novo Serviço
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Serviços</p>
          <p className="text-2xl font-black text-slate-800">{resumoGeral.total}</p>
        </Card>
        <Card className="p-4 border border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ativos</p>
          <p className="text-2xl font-black text-emerald-700">{resumoGeral.ativos}</p>
        </Card>
        <Card className="p-4 border border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Categorias</p>
          <p className="text-2xl font-black text-slate-800">{resumoGeral.categorias}</p>
        </Card>
        <Card className="p-4 border border-blue-100 bg-blue-50/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Por km</p>
          <p className="text-xs text-blue-800 mt-1 leading-snug">
            Translado: informe o valor <strong>por quilômetro</strong> na descrição.
          </p>
        </Card>
      </div>

      <div ref={formRef}>
        {podeUsarFormulario ? (
        <Card className="p-6 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            {editingId ? 'Editar Cadastro de Serviço' : 'Novo Serviço Funerário'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nome do serviço *"
              placeholder="Ex: Translado particular, Tanatopraxia..."
              value={form.nome}
              onChange={(e) => atualizarForm({ nome: e.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria *</label>
              <select
                value={form.categoria}
                onChange={(e) => atualizarForm({ categoria: e.target.value })}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {CATEGORIAS_SERVICO_ORDEM.map((c) => (
                  <option key={c} value={c}>{labelCategoriaServico(c)}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 ml-1">{resumoCategoriaServico(form.categoria)}</p>
            </div>
            <Input
              label={cobrancaPorKm ? 'Valor por km (R$) *' : 'Valor (R$) *'}
              type="text"
              inputMode="decimal"
              placeholder={cobrancaPorKm ? 'Ex: 3,80' : '0,00'}
              value={form.preco}
              onChange={(e) => setForm((p) => ({ ...p, preco: e.target.value }))}
            />
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                  checked={form.ativo}
                  onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                />
                <span className="font-bold text-xs uppercase text-slate-500 tracking-wider">Serviço ativo</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <Textarea
                label="Descrição breve"
                placeholder={
                  form.categoria === 'traslado'
                    ? 'Ex: Valor por quilômetro — particular'
                    : 'Resumo do que inclui o serviço (aparece no catálogo e no PDF)'
                }
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              />
              {form.categoria === 'traslado' && (
                <p className="text-[11px] text-blue-700 ml-1 mt-1 flex items-center gap-1">
                  <Route className="h-3.5 w-3.5 shrink-0" />
                  Para cobrança por km, use na descrição: &quot;Valor por quilômetro&quot; — o sistema exibirá R$ X / km.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => void onSave()} loading={saving} className="h-10">
              <Save className="h-4 w-4 mr-2" /> {editingId ? 'Salvar Alterações' : 'Cadastrar Serviço'}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm} className="h-10 border-slate-300">
                <X className="h-4 w-4 mr-1 text-slate-500" /> Cancelar
              </Button>
            )}
          </div>
        </Card>
        ) : (
          <Card className="p-4 border border-slate-200 bg-slate-50 text-sm text-slate-600">
            Você pode consultar o catálogo e imprimir o PDF. Inclusão e edição dependem da permissão
            <strong> Serviços Funerários</strong> em Configurações → Permissões.
          </Card>
        )}
      </div>

      <Card className="p-4 border border-slate-200 bg-slate-50/50 space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute top-3.5 left-3.5" />
          <Input
            className="pl-10"
            placeholder="Buscar por nome ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoriaFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              !categoriaFilter
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            Todas
          </button>
          {CATEGORIAS_SERVICO_ORDEM.map((c) => {
            const qtd = servicos.filter((s) => (s.categoria || 'geral') === c).length;
            if (!qtd) return null;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoriaFilter(categoriaFilter === c ? '' : c)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  categoriaFilter === c
                    ? 'bg-slate-800 text-white border-slate-800'
                    : `${badgeClasseCategoriaServico(c)} hover:opacity-90`
                }`}
              >
                {labelCategoriaServico(c)} ({qtd})
              </button>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 text-center text-slate-400 border border-slate-200">Carregando catálogo de serviços...</Card>
      ) : grupos.length === 0 ? (
        <Card className="p-12 text-center text-slate-400 border border-slate-200">Nenhum serviço encontrado.</Card>
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => {
            const aberto = gruposAbertos[grupo.categoria] !== false;
            const ativosGrupo = grupo.itens.filter((s) => s.ativo).length;
            return (
              <Card key={grupo.categoria} className="overflow-hidden border border-slate-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleGrupo(grupo.categoria)}
                  className="w-full flex items-start gap-3 px-5 py-4 bg-slate-50/80 border-b border-slate-100 text-left hover:bg-slate-100/80 transition-colors"
                >
                  {aberto ? (
                    <ChevronDown className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClasseCategoriaServico(grupo.categoria)}`}>
                        {grupo.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        {grupo.itens.length} serviço(s) · {ativosGrupo} ativo(s)
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{grupo.resumo}</p>
                  </div>
                </button>

                {aberto && (
                  <div className="divide-y divide-slate-100">
                    {grupo.itens.map((s) => {
                      const porKm = servicoCobrancaPorKm(s);
                      return (
                        <div
                          key={s.id}
                          className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3 hover:bg-slate-50/60 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-slate-800 text-sm">{s.nome}</p>
                              {porKm && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                  <Route className="h-3 w-3" /> por km
                                </span>
                              )}
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[9px] uppercase font-bold border ${
                                  s.ativo
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : 'bg-slate-100 border-slate-200 text-slate-600'
                                }`}
                              >
                                {s.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {s.descricao || 'Sem descrição — edite para incluir um resumo no catálogo.'}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <p className="text-base font-black text-slate-800 tabular-nums min-w-[7rem] text-right">
                              {formatarPrecoServico(s)}
                            </p>
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              {podeEditar && (
                                <Button size="sm" variant="outline" onClick={() => onEdit(s)} className="h-8 border-slate-200">
                                  <Pencil className="h-3.5 w-3.5 mr-1 text-slate-500" /> Editar
                                </Button>
                              )}
                              {podeAlterarStatus && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void toggleAtivo(s)}
                                  loading={togglingId === s.id}
                                  className={`h-8 border-slate-200 ${s.ativo ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-emerald-50 hover:text-emerald-600'}`}
                                >
                                  {s.ativo ? 'Desativar' : 'Ativar'}
                                </Button>
                              )}
                              {podeExcluir && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void onExcluir(s)}
                                  loading={deletingId === s.id}
                                  className="h-8 border-red-200 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
