import React, { useMemo, useState, useEffect } from 'react';
import { CreditCard, Download, Printer, Users, Check, Plus, Trash2, Loader2, Lock } from 'lucide-react';
import type { AssinaturaSB, BeneficiarioSB, ClienteSB } from '../../lib/ClienteStore';
import { Button, Card, Select } from '../ui/Components';
import { ContratoResumoHeader } from './ContratoResumoHeader';
import { resolvePlanoContratoAssinatura } from '../../lib/ContratoAssinaturaService';
import {
  buildCarteirinhasPdfBlob,
  imprimirCarteirinhasPdf,
  montarLinhasCarteirinha,
  obterTipoPlano,
} from '../../lib/CarteirinhaPdfService';
import { downloadPdfBlob } from '../../lib/printPdfBlob';
import { formatarDataIsoPtBr } from '../../lib/contratoDatas';
import { supabase } from '../../lib/supabase';
import { useFinanceiro } from '../../lib/FinanceiroStore';
import { useToast } from '../../lib/ToastStore';
import { SolicitarCarteirinhaModal, type SolicitarCarteirinhaPessoa } from './SolicitarCarteirinhaModal';
import { labelParentescoDependente } from '../../lib/parentescoDependente';
import { resolverAssinaturaSelecionada } from '../../lib/clienteContratoFormLoad';

type Props = {
  cliente: ClienteSB;
  assinaturas: AssinaturaSB[];
  assinaturaId: string;
  onAssinaturaIdChange: (id: string) => void;
  beneficiarios: BeneficiarioSB[];
  empresaNome?: string;
};

interface CarteirinhaSolicitacao {
  id: string;
  empresa_id: string;
  assinatura_id: string;
  cliente_id: string;
  pessoa_tipo: 'titular' | 'beneficiario';
  pessoa_id: string;
  pessoa_nome: string;
  conta_receber_id: string | null;
  created_at: string;
  updated_at: string;
  printed_at: string | null;
  fin_contas_receber?: {
    status: string;
    data_pagamento: string | null;
    valor_original_centavos: number;
    forma_pagamento_id: string | null;
    conta_bancaria_id: string | null;
  } | null;
}

function mascararCpf(cpf?: string | null): string {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return '—';
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

export const ContratoCarteirinhaView: React.FC<Props> = ({
  cliente,
  assinaturas,
  assinaturaId,
  onAssinaturaIdChange,
  beneficiarios,
  empresaNome,
}) => {
  const { showToast } = useToast();
  const [gerando, setGerando] = useState(false);
  const [operandoSolicitacao, setOperandoSolicitacao] = useState<string | null>(null);
  const [modalSolicitacao, setModalSolicitacao] = useState<SolicitarCarteirinhaPessoa[] | null>(null);
  const [layout, setLayout] = useState<'pre_impresso' | 'completo'>('pre_impresso');
  const [formato, setFormato] = useState<'pvc' | 'a4'>('pvc');
  const [cobradorNome, setCobradorNome] = useState<string>('—');

  // Controle de seleção individual de carteirinhas
  const [selecionadas, setSelecionadas] = useState<Record<string, boolean>>({});

  // Financeiro Store
  const { excluirContaReceber } = useFinanceiro();

  // Card requests state
  const [solicitacoes, setSolicitacoes] = useState<CarteirinhaSolicitacao[]>([]);
  const [loadingSolicitacoes, setLoadingSolicitacoes] = useState(true);

  // Carrega nome do cobrador associado ao cliente
  useEffect(() => {
    let active = true;
    async function carregarCobrador() {
      try {
        const { data, error } = await supabase
          .from('cobradores')
          .select('nome')
          .eq('id', cliente.cobrador_id)
          .maybeSingle();
        if (error) throw error;
        if (active && data?.nome) {
          setCobradorNome(data.nome);
        }
      } catch (err) {
        console.error('[ContratoCarteirinhaView] Erro cobrador:', err);
      }
    }

    if (cliente.cobrador_id) {
      carregarCobrador();
    } else {
      setCobradorNome('—');
    }
    return () => {
      active = false;
    };
  }, [cliente.cobrador_id]);

  const assinatura = useMemo(
    () => resolverAssinaturaSelecionada(assinaturaId, assinaturas),
    [assinaturaId, assinaturas],
  );

  useEffect(() => {
    if (!assinatura) return;
    if (assinaturaId !== 'todos' && assinaturaId !== assinatura.id) {
      onAssinaturaIdChange(assinatura.id);
    }
  }, [assinatura, assinaturaId, onAssinaturaIdChange]);

  // Carrega solicitações de carteirinhas
  const carregarSolicitacoes = async () => {
    const targetAssinaturaId = assinatura?.id;
    if (!targetAssinaturaId) {
      setSolicitacoes([]);
      setLoadingSolicitacoes(false);
      return;
    }
    setLoadingSolicitacoes(true);
    try {
      const { data, error } = await supabase
        .from('carteirinha_solicitacoes')
        .select(`
          *,
          fin_contas_receber (
            status,
            data_pagamento,
            valor_original_centavos,
            forma_pagamento_id,
            conta_bancaria_id
          )
        `)
        .eq('assinatura_id', targetAssinaturaId);
      if (error) throw error;
      setSolicitacoes(data || []);
    } catch (err) {
      console.error('[ContratoCarteirinhaView] Erro ao carregar solicitações:', err);
    } finally {
      setLoadingSolicitacoes(false);
    }
  };

  useEffect(() => {
    void carregarSolicitacoes();
  }, [assinatura?.id]);

  // Estrutura das pessoas elegíveis do contrato
  const pessoasContrato = useMemo(() => {
    const lista: Array<{
      id: string;
      nome: string;
      tipo: 'titular' | 'beneficiario';
      parentesco: string;
      cpf?: string | null;
      cpfMascarado: string;
    }> = [
      {
        id: cliente.id,
        nome: cliente.nome,
        tipo: 'titular',
        parentesco: 'TITULAR',
        cpf: cliente.cpf,
        cpfMascarado: mascararCpf(cliente.cpf),
      },
    ];

    const targetAssinaturaId = assinatura?.id;

    const deps = targetAssinaturaId
      ? beneficiarios.filter((b) => !b.assinatura_id || b.assinatura_id === targetAssinaturaId)
      : beneficiarios;

    deps.forEach((b) => {
      lista.push({
        id: b.id,
        nome: b.nome,
        tipo: 'beneficiario',
        parentesco: labelParentescoDependente(b.parentesco, 'completo', b.sexo, b.nome) || 'Dependente',
        cpf: b.cpf,
        cpfMascarado: mascararCpf(b.cpf),
      });
    });

    return lista;
  }, [cliente, beneficiarios, assinatura]);

  // Gera todas as linhas possíveis do PDF
  const linhasTotais = useMemo(
    () => montarLinhasCarteirinha(cliente, assinatura, beneficiarios, cobradorNome),
    [cliente, assinatura, beneficiarios, cobradorNome],
  );

  // Mesma ordem de montarLinhasCarteirinha (titular + dependentes) — evita liberar todas ao solicitar uma
  const linhasStatus = useMemo(() => {
    return pessoasContrato.map((pessoa, idx) => {
      const linha = linhasTotais[idx];
      if (!linha) return null;

      const sol = solicitacoes.find(
        (s) => s.pessoa_id === pessoa.id && s.pessoa_tipo === pessoa.tipo,
      );

      return {
        ...linha,
        pessoaId: pessoa.id,
        pessoaTipo: pessoa.tipo,
        solicitacao: sol || null,
        isLiberada: !!sol,
      };
    }).filter((l): l is NonNullable<typeof l> => l !== null);
  }, [linhasTotais, pessoasContrato, solicitacoes]);

  const pessoasPendentes = useMemo(
    () =>
      linhasStatus
        .filter((l) => !l.isLiberada)
        .map((l) => ({
          id: l.pessoaId,
          nome: l.nome,
          tipo: l.pessoaTipo,
          parentesco: l.parentesco || (l.pessoaTipo === 'titular' ? 'TITULAR' : 'Dependente'),
        })),
    [linhasStatus],
  );

  // Linhas liberadas para impressão (que têm solicitação ativa)
  const linhasFiltradas = useMemo(() => {
    return linhasStatus.filter((l) => l.isLiberada);
  }, [linhasStatus]);

  // Inicializa a seleção quando as linhas filtradas mudarem
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    linhasFiltradas.forEach((linha) => {
      initial[linha.codigo] = true;
    });
    setSelecionadas(initial);
  }, [linhasFiltradas]);

  const toggleSelecionada = (codigo: string) => {
    setSelecionadas((prev) => ({
      ...prev,
      [codigo]: !prev[codigo],
    }));
  };

  const toggleTodas = (checked: boolean) => {
    const updated: Record<string, boolean> = {};
    linhasFiltradas.forEach((linha) => {
      updated[linha.codigo] = checked;
    });
    setSelecionadas(updated);
  };

  const todasSelecionadas = linhasFiltradas.length > 0 && linhasFiltradas.every((l) => selecionadas[l.codigo]);
  const linhasFiltradasParaEmitir = useMemo(
    () => linhasFiltradas.filter((l) => selecionadas[l.codigo]),
    [linhasFiltradas, selecionadas],
  );

  const plano = assinatura ? resolvePlanoContratoAssinatura(assinatura) : null;

  // Ação de Impressão
  const emitirPdf = async (imprimir: boolean) => {
    if (linhasFiltradasParaEmitir.length === 0) {
      alert('Selecione pelo menos uma carteirinha para gerar a impressão.');
      return;
    }

    setGerando(true);
    try {
      const blob = buildCarteirinhasPdfBlob(empresaNome || 'Fênix Funerária', linhasFiltradasParaEmitir, {
        layout,
        formato,
      });
      if (imprimir) {
        imprimirCarteirinhasPdf(blob);
      } else {
        const nomeArquivo = formato === 'pvc' ? 'carteirinha-pvc' : 'carteirinhas-a4';
        downloadPdfBlob(blob, `${nomeArquivo}-${cliente.codigo || cliente.id.slice(0, 8)}.pdf`);
      }

      // Atualiza a data de impressão para as solicitações correspondentes
      const codigosEmitidos = linhasFiltradasParaEmitir.map((l) => l.codigo);
      const reqsToUpdate = solicitacoes.filter((s) => {
        if (s.pessoa_tipo === 'titular') {
          const titularCodigo = cliente.codigo || cliente.id.slice(0, 8).toUpperCase();
          return codigosEmitidos.includes(titularCodigo);
        } else {
          const b = beneficiarios.find((x) => x.id === s.pessoa_id);
          if (!b) return false;
          const depCodigo = `${cliente.codigo || 'CLI'}-D${(b.id || b.nome).slice(0, 4).toUpperCase()}`;
          return codigosEmitidos.includes(depCodigo);
        }
      });

      if (reqsToUpdate.length > 0) {
        const ids = reqsToUpdate.map((r) => r.id);
        const { error } = await supabase
          .from('carteirinha_solicitacoes')
          .update({ printed_at: new Date().toISOString() })
          .in('id', ids);

        if (error) console.error('Erro ao atualizar impressao:', error);
        await carregarSolicitacoes();
      }
    } finally {
      setGerando(false);
    }
  };

  const avisarSemContrato = () => {
    if (assinaturas.length === 0) {
      showToast('Este cliente não possui contrato cadastrado.', 'error');
      return;
    }
    showToast('Selecione um contrato válido no campo acima.', 'error');
  };

  const abrirModalSolicitacao = (
    pessoaId: string,
    pessoaNome: string,
    pessoaTipo: 'titular' | 'beneficiario',
    parentesco: string,
  ) => {
    if (!assinatura) {
      avisarSemContrato();
      return;
    }
    setModalSolicitacao([
      {
        id: pessoaId,
        nome: pessoaNome,
        tipo: pessoaTipo,
        parentesco,
      },
    ]);
  };

  const abrirModalSolicitarTodas = () => {
    if (!assinatura) {
      avisarSemContrato();
      return;
    }
    if (pessoasPendentes.length === 0) {
      showToast('Não há carteirinhas pendentes para solicitar.', 'info');
      return;
    }
    setModalSolicitacao(pessoasPendentes);
  };

  // Cancelar solicitação rápida
  const handleCancelarSolicitacao = async (sol: any) => {
    if (!window.confirm(`Deseja realmente cancelar a solicitação de carteirinha de ${sol.pessoa_nome}?`)) {
      return;
    }

    setOperandoSolicitacao(sol.pessoa_id);
    try {
      const contaReceberId = sol.conta_receber_id as string | null | undefined;

      const { error } = await supabase
        .from('carteirinha_solicitacoes')
        .delete()
        .eq('id', sol.id);

      if (error) throw error;

      if (contaReceberId && sol.fin_contas_receber?.status === 'aberto') {
        const { count } = await supabase
          .from('carteirinha_solicitacoes')
          .select('id', { count: 'exact', head: true })
          .eq('conta_receber_id', contaReceberId);

        if (!count) {
          const ok = await excluirContaReceber(contaReceberId);
          if (!ok) {
            console.warn('Não foi possível excluir o título a receber associado.');
          }
        }
      }

      // Registrar timeline
      await supabase.from('timeline_clientes').insert({
        empresa_id: cliente.empresa_id,
        cliente_id: cliente.id,
        tipo_evento: 'AUDITORIA',
        categoria: 'contrato',
        titulo: 'Solicitação de carteirinha cancelada',
        descricao: `Solicitação para ${sol.pessoa_nome} cancelada. Título pendente excluído.`,
        referencia_tipo: 'carteirinha_solicitacao',
        data_evento: new Date().toISOString(),
      });

      showToast('Solicitação cancelada e cobrança removida.', 'success');
      await carregarSolicitacoes();
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Erro ao excluir solicitação.', 'error');
    } finally {
      setOperandoSolicitacao(null);
    }
  };

  return (
    <div className="space-y-6">
      {assinaturas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase text-slate-500">Contrato</label>
          <Select
            value={assinaturaId}
            onChange={(e) => onAssinaturaIdChange(e.target.value)}
            className="h-9 w-full max-w-md text-xs font-semibold"
          >
            <option value="todos">Contrato ativo / principal</option>
            {assinaturas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo || a.id.slice(0, 8)} — {a.plano_nome || 'Plano'}
              </option>
            ))}
          </Select>
        </div>
      )}

      <ContratoResumoHeader cliente={cliente} assinatura={assinatura} />

      {/* Seção das Configurações de Impressão */}
      <Card className="p-4 border-slate-200 bg-slate-50/70 shadow-sm space-y-3">
        <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
          <Printer className="h-4 w-4 text-indigo-600" />
          Configurações da Impressora & Layout
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-500">Mídia de Destino (Cartão)</label>
            <Select
              value={layout}
              onChange={(e) => setLayout(e.target.value as 'pre_impresso' | 'completo')}
              className="h-9 w-full text-xs font-semibold bg-white"
            >
              <option value="pre_impresso">Cartão Pré-Impresso (Imprimir apenas dados / texto)</option>
              <option value="completo">Cartão em Branco (Imprimir fundo e arte inteira)</option>
            </Select>
            <p className="text-[10px] text-slate-500">
              {layout === 'pre_impresso'
                ? 'Recomendado: Imprime apenas o texto nos espaços exatos dos cartões físicos pré-impressos.'
                : 'Imprime o design colorido completo e os logos. Ideal para cartões de PVC totalmente brancos.'}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-500">Tamanho da Página (Impressão)</label>
            <Select
              value={formato}
              onChange={(e) => setFormato(e.target.value as 'pvc' | 'a4')}
              className="h-9 w-full text-xs font-semibold bg-white"
            >
              <option value="pvc">Impressora de PVC (Horizontal: 85.6mm x 54mm)</option>
              <option value="a4">Folha de Papel A4 (Horizontal: Grade de 8 cartões por página)</option>
            </Select>
            <p className="text-[10px] text-slate-500">
              {formato === 'pvc'
                ? 'Recomendado para IDP SMART-51. Gera páginas horizontais de 85.6x54mm. No diálogo do navegador, selecione a orientação "Paisagem" (Landscape).'
                : 'Gera uma folha A4 com grade de 2x4 cartões horizontal/landscape com marcas para corte.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Painel do Lote para impressão se houver carteirinhas liberadas */}
      {linhasFiltradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 p-3 rounded-lg border border-slate-200">
          <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={todasSelecionadas}
              onChange={(e) => toggleTodas(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            <span>Selecionar Todas as Liberadas ({linhasFiltradas.length})</span>
          </label>
          <div className="flex items-center gap-3">
            <div className="text-xs font-black text-slate-600 uppercase tracking-wider">
              {linhasFiltradasParaEmitir.length} de {linhasFiltradas.length} selecionadas
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={gerando || linhasFiltradasParaEmitir.length === 0}
                onClick={() => void emitirPdf(true)}
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Imprimir ({linhasFiltradasParaEmitir.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={gerando || linhasFiltradasParaEmitir.length === 0}
                onClick={() => void emitirPdf(false)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Baixar PDF
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Grid de Mockups Horizontais */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            Carteirinhas do Contrato
          </h3>
          {!loadingSolicitacoes && pessoasPendentes.length > 1 && (
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={operandoSolicitacao !== null}
              onClick={abrirModalSolicitarTodas}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Solicitar todas ({pessoasPendentes.length}) —{' '}
              {((pessoasPendentes.length * 3).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}
            </Button>
          )}
        </div>

        {loadingSolicitacoes ? (
          <div className="flex justify-center items-center py-12 text-slate-500 text-sm gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            Carregando status das carteirinhas...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-2">
            {linhasStatus.map((linha) => {
              const tipoPlano = obterTipoPlano(linha.plano);
              const isCompleto = layout === 'completo';
              const isSelecionada = selecionadas[linha.codigo] ?? false;

              let cardBorderClass = 'border-slate-200';
              let bodyBgClass = 'bg-white';
              let parentescoColorClass = 'text-slate-600';
              let planName = plano?.label || linha.plano;

              if (tipoPlano === 'onix') {
                cardBorderClass = isCompleto ? 'border-amber-400 shadow-amber-50/50' : 'border-zinc-300';
                bodyBgClass = isCompleto ? 'bg-amber-50/10' : 'bg-white';
                parentescoColorClass = 'text-amber-700';
                planName = 'Plano Ônix';
              } else if (tipoPlano === 'fenix') {
                cardBorderClass = isCompleto ? 'border-blue-400 shadow-blue-50/50' : 'border-blue-100';
                bodyBgClass = isCompleto ? 'bg-blue-50/10' : 'bg-white';
                parentescoColorClass = 'text-blue-700';
                planName = 'Plano Fênix';
              }

              const headerHeightClass = tipoPlano === 'onix' ? 'h-[75px]' : 'h-[90px]';
              const bodyHeightClass = tipoPlano === 'onix' ? 'h-[148px]' : 'h-[133px]';

              const validade = new Date();
              validade.setFullYear(validade.getFullYear() + 2);
              const validadeStr = validade.toLocaleDateString('pt-BR');

              return (
                <div key={`${linha.codigo}-${linha.nome}`} className="flex flex-col items-center">
                  {/* Moldura do Cartão */}
                  <div
                    onClick={() => linha.isLiberada && toggleSelecionada(linha.codigo)}
                    className={`w-[360px] h-[227px] rounded-xl overflow-hidden border-2 shadow-lg transition-all duration-200 flex flex-col justify-between relative select-none ${cardBorderClass} ${
                      linha.isLiberada
                        ? isSelecionada
                          ? 'ring-4 ring-indigo-500 ring-offset-2 cursor-pointer opacity-100'
                          : 'opacity-90 hover:opacity-100 cursor-pointer'
                        : 'opacity-60'
                    }`}
                  >
                    {/* Indicador de Seleção se liberado */}
                    {linha.isLiberada && (
                      <div className="absolute top-2 right-2 z-10">
                        <div
                          className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSelecionada ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-slate-300 text-transparent'
                          }`}
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      </div>
                    )}

                    {/* Overlay Bloqueado se não solicitado */}
                    {!linha.isLiberada && (
                      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1.5px] flex flex-col items-center justify-center p-4 text-center z-25 transition-all hover:bg-slate-900/40">
                        <span className="p-2 bg-white/95 rounded-full text-indigo-600 shadow-md mb-2">
                          <Lock className="h-4.5 w-4.5" />
                        </span>
                        <p className="text-xs font-black text-white uppercase tracking-wider mb-2.5 drop-shadow">
                          Não Solicitada
                        </p>
                        <button
                          type="button"
                          disabled={operandoSolicitacao !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirModalSolicitacao(linha.pessoaId, linha.nome, linha.pessoaTipo, linha.parentesco);
                          }}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider shadow transition outline-none disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {operandoSolicitacao === linha.pessoaId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Solicitar (R$ 3,00)
                        </button>
                      </div>
                    )}

                    {/* CABEÇALHO */}
                    {layout === 'pre_impresso' ? (
                      <div
                        className={`bg-slate-200 border-b border-dashed border-slate-400 text-slate-400 text-[9px] font-black uppercase flex flex-col items-center justify-center text-center shrink-0 ${headerHeightClass}`}
                      >
                        <Printer className="h-4 w-4 mb-0.5 opacity-40 text-slate-500" />
                        <span>Arte do Cabeçalho Físico</span>
                        <span className="text-[7px] bg-slate-300 px-1.5 py-0.5 rounded text-slate-600 font-extrabold">
                          NÃO SERÁ IMPRESSA
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`px-3 py-1.5 shrink-0 flex flex-col justify-between text-center border-b border-dashed border-slate-300 ${headerHeightClass} ${
                          tipoPlano === 'onix' ? 'bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 border-amber-600' : 'bg-gradient-to-b from-blue-700 via-blue-800 to-blue-900'
                        }`}
                      >
                        <div className="mt-0.5">
                          <p className={`text-[9px] font-black uppercase tracking-wider ${tipoPlano === 'onix' ? 'text-amber-400' : 'text-white'}`}>
                            {empresaNome || 'Fênix Funerária'}
                          </p>
                          <p className="text-[6px] opacity-75 text-white font-medium italic -mt-0.5">
                            O melhor Plano Funerário de Goiás
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-black tracking-tight uppercase text-white -mt-1">
                            {planName}
                          </h4>
                        </div>
                        <p className="text-[6.5px] text-white opacity-80 italic">
                          "A Sua Amiga Certa nas Horas Incertas!"
                        </p>
                      </div>
                    )}

                    {/* CORPO DO CARTÃO */}
                    <div className={`px-4 py-2 flex flex-col justify-between shrink-0 ${bodyBgClass} ${bodyHeightClass}`}>
                      <div className="space-y-1">
                        <div className="flex justify-between items-baseline text-[10px] font-bold text-gray-800">
                          <span className="truncate max-w-[55%]">
                            Nº{' '}
                            <span className="font-mono text-gray-900 font-black tracking-tight">
                              {linha.contratoCodigo && linha.contratoCodigo !== '—' ? linha.contratoCodigo : linha.codigo}
                            </span>
                          </span>
                          <span className="shrink-0">
                            VALIDADE:{' '}
                            <span className="font-mono text-gray-900 font-black">{validadeStr}</span>
                          </span>
                        </div>

                        <p className="font-black text-gray-900 uppercase text-[11.5px] leading-tight truncate">
                          {linha.nome}
                        </p>

                        <div className="flex justify-between text-[9px] font-bold text-slate-700">
                          <span>
                            PARENTESCO: <span className={`uppercase ${parentescoColorClass}`}>{linha.parentesco}</span>
                          </span>
                          <span>
                            CPF: <span className="text-gray-900">{linha.cpfMascarado}</span>
                          </span>
                        </div>

                        <div className="text-[9px] font-bold text-slate-700 truncate">
                          COBRADOR: <span className="text-gray-900 uppercase">{linha.cobradorNome}</span>
                        </div>

                        <div className="flex justify-between gap-2 text-[9px] font-bold text-slate-700">
                          <span className="truncate">
                            BAIRRO: <span className="text-gray-900 uppercase">{linha.bairro}</span>
                          </span>
                          <span className="shrink-0 text-right uppercase">
                            PLANO: <span className="text-gray-900">{linha.plano}</span>
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-1 flex justify-between items-center text-[7.5px] text-gray-500 font-medium">
                        <span>EMISSÃO: {new Date().toLocaleDateString('pt-BR')}</span>
                        <span className="font-mono text-[7px] text-slate-500">MAT. {linha.codigo}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Texto do Cartão */}
                  <div className="mt-2 text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <span>{linha.nome.split(' ')[0]}</span>
                    {linha.isLiberada ? (
                      isSelecionada ? (
                        <span className="text-indigo-600 font-bold text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded">
                          Selecionado
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                          Liberada
                        </span>
                      )
                    ) : (
                      <span className="text-slate-400 text-[10px] bg-slate-50 px-1.5 py-0.5 rounded">
                        Bloqueada
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista de Seleção Rápida em Tabela */}
      {!loadingSolicitacoes && (
        <Card className="p-0 overflow-hidden border-slate-200 shadow-sm mt-4 bg-white">
          <div className="px-4 py-2.5 bg-slate-700 text-white text-xs font-black uppercase flex justify-between items-center">
            <span>Controle Geral de Carteirinhas</span>
            <span className="text-[10px] opacity-90">{linhasFiltradas.length} liberadas</span>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-100 uppercase text-[10px] font-black text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left w-12 border-none">
                  <input
                    type="checkbox"
                    checked={todasSelecionadas}
                    onChange={(e) => toggleTodas(e.target.checked)}
                    disabled={linhasFiltradas.length === 0}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 disabled:opacity-50"
                  />
                </th>
                <th className="px-3 py-3 text-left">Nome</th>
                <th className="px-3 py-3 text-left">Parentesco</th>
                <th className="px-3 py-3 text-left">CPF</th>
                <th className="px-3 py-3 text-left">Status Liberação</th>
                <th className="px-3 py-3 text-left">Status Impressão</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhasStatus.map((l) => {
                const isSel = selecionadas[l.codigo] ?? false;
                const sol = l.solicitacao;
                const statusFin = sol?.fin_contas_receber?.status || 'aberto';
                const isPago = !sol?.conta_receber_id || statusFin === 'pago';
                const isImpresso = !!sol?.printed_at;

                return (
                  <tr
                    key={l.codigo}
                    className={`border-b border-slate-150 transition-colors ${
                      l.isLiberada
                        ? isSel
                          ? 'bg-indigo-50/20 hover:bg-indigo-50/45 cursor-pointer'
                          : 'bg-white hover:bg-slate-50 cursor-pointer'
                        : 'bg-slate-50/40 text-slate-400'
                    }`}
                    onClick={() => l.isLiberada && toggleSelecionada(l.codigo)}
                  >
                    <td className="px-4 py-2.5 text-left w-12 border-none" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={!l.isLiberada}
                        onChange={() => toggleSelecionada(l.codigo)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold">{l.nome}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          l.parentesco === 'TITULAR'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {l.parentesco}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{l.cpfMascarado || mascararCpf(null)}</td>
                    <td className="px-3 py-2.5">
                      {l.isLiberada ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Liberada {isPago ? '(Paga)' : '(Em aberto)'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                          Bloqueada (R$ 3,00)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isImpresso ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-150 text-slate-700 border border-slate-200">
                          Impressa ({formatarDataIsoPtBr(sol?.printed_at?.slice(0, 10))})
                        </span>
                      ) : l.isLiberada ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
                          Pendente Impressão
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium" onClick={(e) => e.stopPropagation()}>
                      {l.isLiberada ? (
                        statusFin === 'aberto' && (
                          <button
                            type="button"
                            disabled={operandoSolicitacao !== null}
                            onClick={() => void handleCancelarSolicitacao(sol)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition outline-none disabled:opacity-30"
                            title="Cancelar Solicitação (Estornar R$ 3,00)"
                          >
                            {operandoSolicitacao === l.pessoaId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={operandoSolicitacao !== null}
                          onClick={() => abrirModalSolicitacao(l.pessoaId, l.nome, l.pessoaTipo, l.parentesco)}
                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[9px] uppercase tracking-wider shadow transition outline-none disabled:opacity-50 flex items-center gap-1"
                        >
                          {operandoSolicitacao === l.pessoaId ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          Solicitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {modalSolicitacao && modalSolicitacao.length > 0 && assinatura && (
        <SolicitarCarteirinhaModal
          isOpen
          onClose={() => setModalSolicitacao(null)}
          onSuccess={() => void carregarSolicitacoes()}
          cliente={cliente}
          assinatura={assinatura}
          pessoas={modalSolicitacao}
        />
      )}
    </div>
  );
};
