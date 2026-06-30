import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  DollarSign, AlertTriangle, Users, ArrowUpRight, TrendingUp, TrendingDown,
  CreditCard, CheckCircle2, Target, Activity, Landmark, Clock,
  Calendar, Percent, ArrowDown, ArrowUp,
  Package, Boxes, PackageX, PackageMinus, FileText, Building2, BarChart3,
} from 'lucide-react';
import { Card } from '../components/ui/Components';
import { Skeleton } from '../components/ui/Skeletons';
import { useClienteStore } from '../lib/ClienteStore';
import { useFinanceiro, formatCentavos } from '../lib/FinanceiroStore';
import { usePlanosStore } from '../lib/PlanosStore';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useFilial } from '../lib/FilialContext';
import { useEmpresaContextoAtivo } from '../lib/EmpresaContextoAtivo';
import { filialAccentClasses } from '../lib/filialAccent';
import { movimentoImpactaSaldoFisicoCaixa } from '../lib/caixaFormaPagamento';
import type { AssinaturaSB } from '../lib/ClienteStore';

interface ProdutoDashboard {
  id: string;
  codigo: string;
  nome: string;
  categoria: string | null;
  estoque_atual: number;
  estoque_minimo: number;
  preco_centavos: number;
  filial_id?: string | null;
}

function isAssinaturaDoDia(a: AssinaturaSB, todayIso: string): boolean {
  const dc = (a.data_contratacao || '').slice(0, 10);
  const cr = (a.created_at || '').slice(0, 10);
  return dc === todayIso || cr === todayIso;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { empresaIdEfetivo, dataRevisionEmpresa } = useEmpresaContextoAtivo();
  const {
    filiais,
    filialId,
    filialNome,
    isTodasFiliais,
    dataRevision,
  } = useFilial();
  const { dashboard, loadDashboard, loading: loadingFin } = useFinanceiro();

  const [produtosEstoque, setProdutosEstoque] = useState<ProdutoDashboard[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(true);
  const [caixaLiquidoHojeCentavos, setCaixaLiquidoHojeCentavos] = useState<number | null>(null);
  const [loadingCaixaHoje, setLoadingCaixaHoje] = useState(false);

  const [localStats, setLocalStats] = useState<{
    clientesAtivos: number;
    inadimplentes: number;
    planosAtivos: number;
    contratosHojeBase: any[];
    contasReceberHoje: any[];
    contasAbertasReceber: number;
    contasHoje: number;
    contasHojeList: any[];
    contasRecebidasHoje: number;
    contasVencidas: number;
    proximosReceber: any[];
    proximosPagar: any[];
    contasAbertasPagar: number;
    contasPagarVencidas: number;
    contasPagasHoje: number;
    totalAbertoCentavos: number;
    totalHojeCentavos: number;
    totalRecebidoHojeCentavos: number;
    totalVencidoCentavos: number;
    taxaInadimplencia: number;
    percentualMetaDia: number;
    ticketMedioHoje: number;
    totalPagarAbertoCentavos: number;
    totalPagarVencidoCentavos: number;
    totalPagoHojeCentavos: number;
    totalProximosReceber: number;
    totalProximosPagar: number;
    totalRecebidoHojeCentavos_minus_pago: number;
  } | null>(null);

  const [loadingLocalStats, setLoadingLocalStats] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, dataRevision, dataRevisionEmpresa]);

  useEffect(() => {
    const empresaId = empresaIdEfetivo;
    if (!empresaId) return;
    let cancelled = false;

    (async () => {
      setLoadingLocalStats(true);
      try {
        const todayIso = new Date().toISOString().slice(0, 10);
        const em7dias = new Date();
        em7dias.setDate(em7dias.getDate() + 7);
        const limiteStr = em7dias.toISOString().slice(0, 10);

        const [ativosRes, inadimplentesRes, planosRes] = await Promise.all([
          supabase.from('view_clientes_completo')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ativo')
            .eq('empresa_id', empresaId),
          supabase.from('view_clientes_completo')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'inadimplente')
            .eq('empresa_id', empresaId),
          supabase.from('planos')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ativo')
            .eq('empresa_id', empresaId)
        ]);

        const clientesAtivos = ativosRes.count || 0;
        const inadimplentes = inadimplentesRes.count || 0;
        const planosAtivos = planosRes.count || 0;

        let qAssinaturas = supabase
          .from('assinaturas')
          .select('id, filial_id, created_at, data_contratacao')
          .is('deleted_at', null)
          .eq('empresa_id', empresaId)
          .or(`data_contratacao.eq.${todayIso},created_at.gte.${todayIso}T00:00:00`);

        if (!isTodasFiliais && filialId) {
          qAssinaturas = qAssinaturas.eq('filial_id', filialId);
        }
        const { data: assinaturasData } = await qAssinaturas;
        const contratosHojeBase = assinaturasData || [];

        let qReceber = supabase
          .from('fin_contas_receber')
          .select('id, codigo, descricao, valor_aberto_centavos, valor_pago_centavos, data_vencimento, data_pagamento, status, filial_id')
          .is('deleted_at', null)
          .eq('empresa_id', empresaId)
          .or(`status.in.("(aberto,vencido,pago_parcial)"),data_vencimento.eq.${todayIso},data_pagamento.eq.${todayIso}`);

        if (!isTodasFiliais && filialId) {
          qReceber = qReceber.eq('filial_id', filialId);
        }
        const { data: receberData } = await qReceber;
        const localContasReceber = receberData || [];

        let qPagar = supabase
          .from('fin_contas_pagar')
          .select('id, codigo, descricao, valor_aberto_centavos, valor_pago_centavos, data_vencimento, data_pagamento, status, filial_id')
          .is('deleted_at', null)
          .eq('empresa_id', empresaId)
          .or(`status.in.("(aberto,vencido,parcial)"),data_vencimento.eq.${todayIso},data_pagamento.eq.${todayIso}`);

        if (!isTodasFiliais && filialId) {
          qPagar = qPagar.eq('filial_id', filialId);
        }
        const { data: pagarData } = await qPagar;
        const localContasPagar = pagarData || [];

        const toDate = (v?: string | null) => v?.slice(0, 10) || '';

        const contasAbertasReceber = localContasReceber.filter(cr =>
          ['aberto', 'vencido', 'pago_parcial'].includes(cr.status)
        );
        const totalAbertoCentavos = contasAbertasReceber.reduce((s, cr) => s + (cr.valor_aberto_centavos || 0), 0);

        const contasHoje = contasAbertasReceber.filter(cr => toDate(cr.data_vencimento) === todayIso);
        const totalHojeCentavos = contasHoje.reduce((s, cr) => s + (cr.valor_aberto_centavos || 0), 0);

        const contasRecebidasHoje = localContasReceber.filter(cr => toDate(cr.data_pagamento) === todayIso);
        const totalRecebidoHojeCentavos = contasRecebidasHoje.reduce((s, cr) => s + (cr.valor_pago_centavos || 0), 0);

        const contasVencidas = localContasReceber.filter(cr =>
          cr.status === 'vencido' || (cr.status === 'aberto' && toDate(cr.data_vencimento) < todayIso)
        );
        const totalVencidoCentavos = contasVencidas.reduce((s, cr) => s + (cr.valor_aberto_centavos || 0), 0);

        const taxaInadimplencia = totalAbertoCentavos > 0
          ? (totalVencidoCentavos / totalAbertoCentavos) * 100 : 0;

        const percentualMetaDia = totalHojeCentavos > 0
          ? Math.min((totalRecebidoHojeCentavos / totalHojeCentavos) * 100, 100) : 0;

        const ticketMedioHoje = contasRecebidasHoje.length > 0
          ? totalRecebidoHojeCentavos / contasRecebidasHoje.length : 0;

        const contasAbertasPagar = localContasPagar.filter(cp =>
          ['aberto', 'vencido', 'parcial'].includes(cp.status)
        );
        const totalPagarAbertoCentavos = contasAbertasPagar.reduce((s, cp) => s + (cp.valor_aberto_centavos || 0), 0);

        const contasPagarVencidas = localContasPagar.filter(cp =>
          cp.status === 'vencido' || (cp.status === 'aberto' && toDate(cp.data_vencimento) < todayIso)
        );
        const totalPagarVencidoCentavos = contasPagarVencidas.reduce((s, cp) => s + (cp.valor_aberto_centavos || 0), 0);

        const contasPagasHoje = localContasPagar.filter(cp => toDate(cp.data_pagamento) === todayIso);
        const totalPagoHojeCentavos = contasPagasHoje.reduce((s, cp) => s + (cp.valor_pago_centavos || 0), 0);

        const proximosReceber = contasAbertasReceber
          .filter(cr => toDate(cr.data_vencimento) >= todayIso && toDate(cr.data_vencimento) <= limiteStr)
          .sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));

        const proximosPagar = contasAbertasPagar
          .filter(cp => toDate(cp.data_vencimento) >= todayIso && toDate(cp.data_vencimento) <= limiteStr)
          .sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));

        const totalProximosReceber = proximosReceber.reduce((s, cr) => s + (cr.valor_aberto_centavos || 0), 0);
        const totalProximosPagar = proximosPagar.reduce((s, cp) => s + (cp.valor_aberto_centavos || 0), 0);

        if (!cancelled) {
          setLocalStats({
            clientesAtivos,
            inadimplentes,
            planosAtivos,
            contratosHojeBase,
            contasReceberHoje: contasHoje,
            contasAbertasReceber: contasAbertasReceber.length,
            contasHoje: contasHoje.length,
            contasHojeList: contasHoje.slice(0, 6),
            contasRecebidasHoje: contasRecebidasHoje.length,
            contasVencidas: contasVencidas.length,
            proximosReceber,
            proximosPagar,
            contasAbertasPagar: contasAbertasPagar.length,
            contasPagarVencidas: contasPagarVencidas.length,
            contasPagasHoje: contasPagasHoje.length,
            totalAbertoCentavos,
            totalHojeCentavos,
            totalRecebidoHojeCentavos,
            totalVencidoCentavos,
            taxaInadimplencia,
            percentualMetaDia,
            ticketMedioHoje,
            totalPagarAbertoCentavos,
            totalPagarVencidoCentavos,
            totalPagoHojeCentavos,
            totalProximosReceber,
            totalProximosPagar,
            totalRecebidoHojeCentavos_minus_pago: totalRecebidoHojeCentavos - totalPagoHojeCentavos,
          });
          setLoadingLocalStats(false);
        }
      } catch (err) {
        console.error('[DashboardStats]', err);
        if (!cancelled) setLoadingLocalStats(false);
      }
    })();

    return () => { cancelled = true; };
  }, [empresaIdEfetivo, filialId, isTodasFiliais, dataRevision, dataRevisionEmpresa]);

  useEffect(() => {
    const empresaId = empresaIdEfetivo;
    if (!empresaId) return;
    let cancelled = false;
    (async () => {
      setLoadingEstoque(true);
      const { data, error } = await supabase
        .from('ser_produtos')
        .select('id, codigo, nome, categoria, estoque_atual, estoque_minimo, preco_centavos, filial_id')
        .eq('empresa_id', empresaId)
        .eq('ativo', true);
      if (!cancelled) {
        if (!error && data) {
          setProdutosEstoque(data as (ProdutoDashboard & { filial_id?: string | null })[]);
        }
        setLoadingEstoque(false);
      }
    })();
    return () => { cancelled = true; };
  }, [empresaIdEfetivo, dataRevision, dataRevisionEmpresa]);

  useEffect(() => {
    const empresaId = empresaIdEfetivo;
    if (!empresaId) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    let cancelled = false;
    (async () => {
      setLoadingCaixaHoje(true);
      try {
        const { data: sessoes, error: e1 } = await supabase
          .from('fin_caixa_sessoes')
          .select('id')
          .eq('empresa_id', empresaId);
        if (e1) throw e1;
        const sIds = (sessoes || []).map((s: { id: string }) => s.id);
        if (sIds.length === 0) {
          if (!cancelled) setCaixaLiquidoHojeCentavos(0);
          return;
        }
        const start = `${todayIso}T00:00:00`;
        const end = `${todayIso}T23:59:59`;
        const { data: movs, error: e2 } = await supabase
          .from('fin_caixa_movimentos')
          .select('tipo, valor_centavos, forma_pagamento')
          .in('sessao_id', sIds)
          .gte('created_at', start)
          .lte('created_at', end);
        if (e2) throw e2;
        const totals = (movs || []).reduce(
          (acc, m: { tipo: string; valor_centavos: number; forma_pagamento?: string | null }) => {
            const impacta = movimentoImpactaSaldoFisicoCaixa(m);
            switch (m.tipo) {
              case 'entrada':
                if (impacta) acc.entradas += Number(m.valor_centavos) || 0;
                break;
              case 'saida':
                if (impacta) acc.saidas += Number(m.valor_centavos) || 0;
                break;
              case 'sangria':
                acc.sangrias += Number(m.valor_centavos) || 0;
                break;
              case 'suprimento':
                acc.suprimentos += Number(m.valor_centavos) || 0;
                break;
              default:
                break;
            }
            return acc;
          },
          { entradas: 0, saidas: 0, sangrias: 0, suprimentos: 0 },
        );
        const liquido = totals.entradas + totals.suprimentos - totals.saidas - totals.sangrias;
        if (!cancelled) setCaixaLiquidoHojeCentavos(liquido);
      } catch {
        if (!cancelled) setCaixaLiquidoHojeCentavos(null);
      } finally {
        if (!cancelled) setLoadingCaixaHoje(false);
      }
    })();
    return () => { cancelled = true; };
  }, [empresaIdEfetivo, dataRevision, dataRevisionEmpresa]);

  const loading = loadingFin || loadingLocalStats;

  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const stats = localStats || {
    clientesAtivos: 0, inadimplentes: 0, planosAtivos: 0,
    contratosHojeBase: [], contasReceberHoje: [],
    contasAbertasReceber: 0, contasHoje: 0, contasHojeList: [],
    contasRecebidasHoje: 0, contasVencidas: 0,
    proximosReceber: [], proximosPagar: [],
    contasAbertasPagar: 0, contasPagarVencidas: 0, contasPagasHoje: 0,
    totalAbertoCentavos: 0, totalHojeCentavos: 0,
    totalRecebidoHojeCentavos: 0, totalVencidoCentavos: 0,
    taxaInadimplencia: 0, percentualMetaDia: 0, ticketMedioHoje: 0,
    totalPagarAbertoCentavos: 0, totalPagarVencidoCentavos: 0,
    totalPagoHojeCentavos: 0, totalProximosReceber: 0, totalProximosPagar: 0,
    totalRecebidoHojeCentavos_minus_pago: 0,
  };

  const filialResumoHoje = useMemo(() => {
    const contratosHojeBase = stats.contratosHojeBase;

    const estoqueBaixoCount = (filialAlvoId: string | null, modo: 'coluna' | 'visao') =>
      produtosEstoque.filter((p) => {
        const atual = Number(p.estoque_atual) || 0;
        const minimo = Number(p.estoque_minimo) || 0;
        if (!(minimo > 0 && atual <= minimo)) return false;
        const pid = p.filial_id || null;
        if (modo === 'coluna' && filialAlvoId) return pid === filialAlvoId;
        if (!filialAlvoId || isTodasFiliais) return true;
        return pid === filialAlvoId || pid === null;
      }).length;

    const contratosCount = (filialAlvoId: string | null, modo: 'coluna' | 'visao') =>
      contratosHojeBase.filter((a: any) => {
        if (isTodasFiliais && modo === 'coluna' && filialAlvoId) {
          return !!a.filial_id && a.filial_id === filialAlvoId;
        }
        if (!isTodasFiliais && filialAlvoId) {
          return !a.filial_id || a.filial_id === filialAlvoId;
        }
        return true;
      }).length;

    return { contratosHojeBase, estoqueBaixoCount, contratosCount };
  }, [stats.contratosHojeBase, produtosEstoque, isTodasFiliais, filialId]);

  const estoqueStats = useMemo(() => {
    const totalProdutos = produtosEstoque.length;
    const totalItens = produtosEstoque.reduce((s, p) => s + (Number(p.estoque_atual) || 0), 0);
    const valorEstoqueCentavos = produtosEstoque.reduce(
      (s, p) => s + (Number(p.estoque_atual) || 0) * (Number(p.preco_centavos) || 0), 0,
    );
    const zerados = produtosEstoque.filter((p) => (Number(p.estoque_atual) || 0) <= 0);
    const baixos = produtosEstoque.filter((p) => {
      const atual = Number(p.estoque_atual) || 0;
      const minimo = Number(p.estoque_minimo) || 0;
      return atual > 0 && minimo > 0 && atual <= minimo;
    });
    const criticos = [...zerados, ...baixos]
      .sort((a, b) => {
        const da = Number(a.estoque_atual) - Number(a.estoque_minimo);
        const db = Number(b.estoque_atual) - Number(b.estoque_minimo);
        return da - db;
      })
      .slice(0, 8);
    return { totalProdutos, totalItens, valorEstoqueCentavos, zerados: zerados.length, baixos: baixos.length, criticos };
  }, [produtosEstoque]);

  const dash = dashboard || {
    saldo_total_centavos: 0, contas_bancarias: 0,
    receitas_mes_centavos: 0, receitas_previstas_mes_centavos: 0,
    despesas_mes_centavos: 0, despesas_previstas_mes_centavos: 0,
    total_vencido_receber_centavos: 0, total_vencido_pagar_centavos: 0,
    titulos_receber_abertos: 0, titulos_pagar_abertos: 0,
    aprovacoes_pendentes: 0, conciliacoes_pendentes: 0,
  };

  const resultadoMes = dash.receitas_mes_centavos - dash.despesas_mes_centavos;

  const metaColor = stats.percentualMetaDia >= 80
    ? { bar: 'bg-emerald-500', barHex: '#10b981', text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-500/30', label: 'Saudável' }
    : stats.percentualMetaDia >= 40
      ? { bar: 'bg-amber-500', barHex: '#f59e0b', text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-500/30', label: 'Atenção' }
      : { bar: 'bg-red-500', barHex: '#ef4444', text: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-500/30', label: 'Crítico' };

  const SkeletonBlock = ({ h = 'h-20' }: { h?: string }) => (
    <Skeleton className={`${h} w-full rounded-xl`} />
  );

  const saudacao = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  const SectionHeader = ({
    icon: Icon, title, desc, badge,
  }: {
    icon: React.ElementType;
    title: string;
    desc?: string;
    badge?: React.ReactNode;
  }) => (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-5 w-1 rounded-full bg-blue-600 shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest">{title}</h2>
          </div>
          {desc && <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      {badge}
    </div>
  );

  return (
    <div className="space-y-8 pb-8">

      {/* ═══ CABEÇALHO EXECUTIVO ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
            <h1 className="text-2xl font-bold text-white">
              {saudacao},{' '}
              <span className="text-blue-300">{user?.nome?.split(' ')[0] || 'Gestor'}</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">Painel Gerencial · {mesAtual}</p>
          </div>

          {!loading && (
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 ring-1 ${metaColor.ring} text-white`}>
                <Target className="h-3.5 w-3.5" style={{ color: metaColor.barHex }} />
                Meta do dia: {stats.percentualMetaDia.toFixed(0)}% — {metaColor.label}
              </span>
              {stats.contasVencidas > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/20 text-red-300 ring-1 ring-red-500/30">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {stats.contasVencidas} título(s) vencido(s)
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                resultadoMes >= 0
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                  : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
              }`}>
                <Activity className="h-3.5 w-3.5" />
                {resultadoMes >= 0 ? 'Superávit' : 'Déficit'} {formatCentavos(Math.abs(resultadoMes))}
              </span>
            </div>
          )}
        </div>
        {/* Decoração */}
        <div className="absolute top-0 right-0 h-full w-56 opacity-[0.05] pointer-events-none">
          <div className="h-40 w-40 rounded-full bg-white absolute -top-10 -right-10" />
          <div className="h-24 w-24 rounded-full bg-white absolute bottom-2 right-16" />
          <div className="h-14 w-14 rounded-full bg-white absolute top-1/2 right-2" />
        </div>
      </div>

      {/* ═══ LOADING ═══ */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SkeletonBlock /><SkeletonBlock /><SkeletonBlock /><SkeletonBlock />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SkeletonBlock h="h-56" /><SkeletonBlock h="h-56" /><SkeletonBlock h="h-56" />
          </div>
        </div>
      ) : (
        <>
          {/* ═══ INDICADORES POR UNIDADE ═══ */}
          {filiais.length > 0 && filialId && (
            <section className="space-y-4">
              <SectionHeader
                icon={Building2}
                title="Indicadores por Unidade — Hoje"
                desc={isTodasFiliais && filiais.length > 1
                  ? 'Comparativo por filial. Caixa físico é consolidado por empresa.'
                  : `Filial: ${filialNome} · Contratos sem filial vinculada entram nesta visão.`}
              />

              {isTodasFiliais && filiais.length > 1 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filiais.map((fil) => {
                    const ac = filialAccentClasses(fil.nome);
                    const nContr = filialResumoHoje.contratosCount(fil.id, 'coluna');
                    const nEst = filialResumoHoje.estoqueBaixoCount(fil.id, 'coluna');
                    return (
                      <div key={fil.id} className={`rounded-2xl border bg-white p-5 shadow-sm border-l-4 ${ac.border}`}>
                        <p className={`text-sm font-bold ${ac.text} mb-3`}>{fil.nome}</p>
                        <dl className="space-y-2.5">
                          <div className="flex justify-between items-center p-3 rounded-xl bg-gray-50">
                            <dt className="text-xs text-gray-500 flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5 text-blue-500" /> Contratos hoje
                            </dt>
                            <dd className="text-xl font-black text-gray-900 tabular-nums">{nContr}</dd>
                          </div>
                          <div className={`flex justify-between items-center p-3 rounded-xl ${nEst > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                            <dt className="text-xs text-gray-500 flex items-center gap-1.5">
                              <PackageMinus className="h-3.5 w-3.5 text-amber-500" /> Estoque ≤ mínimo
                            </dt>
                            <dd className={`text-xl font-black tabular-nums ${nEst > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{nEst}</dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm md:col-span-2 xl:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                          <Landmark className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">Caixa Físico (Espécie) — Hoje</p>
                          <p className="text-[11px] text-gray-500">Líquido: entradas + suprimentos − saídas − sangrias</p>
                        </div>
                      </div>
                      {loadingCaixaHoje ? (
                        <Skeleton className="h-8 w-32 rounded-lg" />
                      ) : (
                        <span className="text-2xl font-black text-blue-700 tabular-nums">
                          {caixaLiquidoHojeCentavos === null ? '—' : formatCentavos(caixaLiquidoHojeCentavos)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {(() => {
                    const ac = filialAccentClasses(filialNome);
                    const nContr = filialResumoHoje.contratosCount(filialId, 'visao');
                    const nEst = filialResumoHoje.estoqueBaixoCount(filialId, 'visao');
                    return (
                      <>
                        <Link to="/clientes/contratos" className={`rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition border-l-4 ${ac.border} group`}>
                          <div className="flex items-center gap-2 text-gray-500 mb-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-xs font-semibold uppercase tracking-wide">Contratos do dia</span>
                          </div>
                          <p className={`text-4xl font-black tabular-nums ${ac.text}`}>{nContr}</p>
                          <p className="text-[11px] text-gray-400 mt-1">Cadastrados ou com início hoje</p>
                          <p className="text-[11px] text-blue-500 mt-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            Ver contratos <ArrowUpRight className="h-3 w-3" />
                          </p>
                        </Link>
                        <div className={`rounded-2xl border bg-white p-5 shadow-sm border-l-4 ${ac.border}`}>
                          <div className="flex items-center gap-2 text-gray-500 mb-2">
                            <Landmark className="h-4 w-4" />
                            <span className="text-xs font-semibold uppercase tracking-wide">Caixa físico (hoje)</span>
                          </div>
                          {loadingCaixaHoje ? (
                            <Skeleton className="h-10 w-32 rounded-md mt-1" />
                          ) : (
                            <p className={`text-3xl font-black tabular-nums ${ac.text}`}>
                              {caixaLiquidoHojeCentavos === null ? '—' : formatCentavos(caixaLiquidoHojeCentavos)}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1">Espécie · mesmo critério da tesouraria</p>
                        </div>
                        <Link to="/estoque/produtos" className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition border-l-4 group ${nEst > 0 ? 'border-l-amber-400 bg-amber-50/50' : `${ac.border} bg-white`}`}>
                          <div className="flex items-center gap-2 text-gray-500 mb-2">
                            <PackageMinus className="h-4 w-4" />
                            <span className="text-xs font-semibold uppercase tracking-wide">Estoque ≤ mínimo</span>
                          </div>
                          <p className={`text-4xl font-black tabular-nums ${nEst > 0 ? 'text-amber-700' : ac.text}`}>{nEst}</p>
                          <p className="text-[11px] text-gray-400 mt-1">Produtos abaixo do estoque mínimo</p>
                          <p className="text-[11px] text-blue-500 mt-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            Ver estoque <ArrowUpRight className="h-3 w-3" />
                          </p>
                        </Link>
                      </>
                    );
                  })()}
                </div>
              )}
            </section>
          )}

          {/* ═══ RESULTADO FINANCEIRO DO MÊS ═══ */}
          <section className="space-y-4">
            <SectionHeader
              icon={BarChart3}
              title="Resultado Financeiro"
              desc={`Visão consolidada de ${mesAtual} — receitas realizadas, despesas e saldo bancário`}
              badge={
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                  resultadoMes >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                  {resultadoMes >= 0
                    ? <TrendingUp className="h-3.5 w-3.5" />
                    : <TrendingDown className="h-3.5 w-3.5" />}
                  {resultadoMes >= 0 ? 'Superávit' : 'Déficit'} {formatCentavos(Math.abs(resultadoMes))}
                </span>
              }
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Saldo em Caixa */}
              <div className="col-span-2 lg:col-span-1 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <Landmark className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-xs font-semibold opacity-80 uppercase tracking-wide">Saldo em Caixa</span>
                  </div>
                  <p className="text-2xl font-black tracking-tight">{formatCentavos(dash.saldo_total_centavos)}</p>
                  <p className="text-[11px] opacity-60 mt-2 flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-white/20 text-[9px] font-bold">
                      {dash.contas_bancarias}
                    </span>
                    conta(s) bancária(s) ativa(s)
                  </p>
                </div>
                <div className="absolute bottom-0 right-0 h-24 w-24 opacity-10 rounded-tl-full bg-white pointer-events-none" />
              </div>

              {/* Receitas */}
              <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Receitas</span>
                </div>
                <p className="text-xl font-black text-emerald-600">{formatCentavos(dash.receitas_mes_centavos)}</p>
                {dash.receitas_previstas_mes_centavos > 0 && (
                  <div className="mt-2.5">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
                      <span>Previsto: {formatCentavos(dash.receitas_previstas_mes_centavos)}</span>
                      <span className="font-bold text-emerald-500">
                        {((dash.receitas_mes_centavos / dash.receitas_previstas_mes_centavos) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${Math.min((dash.receitas_mes_centavos / dash.receitas_previstas_mes_centavos) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {dash.receitas_previstas_mes_centavos === 0 && (
                  <p className="text-[11px] text-gray-400 mt-2">Previsto: {formatCentavos(dash.receitas_previstas_mes_centavos)}</p>
                )}
              </div>

              {/* Despesas */}
              <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Despesas</span>
                </div>
                <p className="text-xl font-black text-red-600">{formatCentavos(dash.despesas_mes_centavos)}</p>
                {dash.despesas_previstas_mes_centavos > 0 && (
                  <div className="mt-2.5">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
                      <span>Previsto: {formatCentavos(dash.despesas_previstas_mes_centavos)}</span>
                      <span className="font-bold text-red-500">
                        {((dash.despesas_mes_centavos / dash.despesas_previstas_mes_centavos) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-red-500 transition-all duration-700"
                        style={{ width: `${Math.min((dash.despesas_mes_centavos / dash.despesas_previstas_mes_centavos) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {dash.despesas_previstas_mes_centavos === 0 && (
                  <p className="text-[11px] text-gray-400 mt-2">Previsto: {formatCentavos(dash.despesas_previstas_mes_centavos)}</p>
                )}
              </div>

              {/* Resultado */}
              <div className={`rounded-2xl border p-5 shadow-sm ${
                resultadoMes >= 0
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
                  : 'border-red-200 bg-gradient-to-br from-red-50 to-white'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${resultadoMes >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <Activity className={`h-4 w-4 ${resultadoMes >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resultado</span>
                </div>
                <p className={`text-xl font-black ${resultadoMes >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCentavos(resultadoMes)}
                </p>
                <p className="text-[11px] text-gray-400 mt-2">Receitas realizadas − Despesas</p>
                <span className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  resultadoMes >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                  {resultadoMes >= 0 ? 'Superávit' : 'Déficit'}
                </span>
              </div>
            </div>
          </section>

          {/* ═══ VISÃO GRÁFICA ═══ */}
          <section className="space-y-4">
            <SectionHeader
              icon={BarChart3}
              title="Visão Gráfica"
              desc="Receitas vs despesas, composição da carteira e estoque"
            />

            {/* Linha 1: Barras receita/despesa + Donut recebíveis */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Receitas vs Despesas */}
              <Card className="p-5 lg:col-span-2">
                <h3 className="text-sm font-bold text-gray-900">Receitas vs Despesas — {mesAtual}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-5">Realizado vs previsto do mês atual</p>
                {(dash.receitas_mes_centavos > 0 || dash.despesas_mes_centavos > 0) ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={[
                        {
                          name: 'Receitas',
                          Realizado: dash.receitas_mes_centavos / 100,
                          Previsto: dash.receitas_previstas_mes_centavos / 100,
                        },
                        {
                          name: 'Despesas',
                          Realizado: dash.despesas_mes_centavos / 100,
                          Previsto: dash.despesas_previstas_mes_centavos / 100,
                        },
                        {
                          name: 'Resultado',
                          Realizado: (dash.receitas_mes_centavos - dash.despesas_mes_centavos) / 100,
                          Previsto: (dash.receitas_previstas_mes_centavos - dash.despesas_previstas_mes_centavos) / 100,
                        },
                      ]}
                      barCategoryGap="30%"
                      barGap={4}
                      margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                        width={48}
                      />
                      <RechartsTooltip
                        formatter={(value: number, name: string) => [
                          formatCentavos(Math.round(value * 100)),
                          name,
                        ]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Realizado" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="Previsto" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                    Sem movimentação financeira no mês
                  </div>
                )}
              </Card>

              {/* Donut — Carteira de Recebíveis */}
              <Card className="p-5">
                <h3 className="text-sm font-bold text-gray-900">Carteira a Receber</h3>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-3">Composição atual dos recebíveis</p>
                {(() => {
                  const emDia = Math.max(0, stats.totalAbertoCentavos - stats.totalVencidoCentavos);
                  const vencido = stats.totalVencidoCentavos;
                  const recebidoHoje = stats.totalRecebidoHojeCentavos;
                  const total = emDia + vencido + recebidoHoje;
                  if (total === 0) return (
                    <div className="h-44 flex items-center justify-center text-sm text-gray-400">Sem dados</div>
                  );
                  const pieData = [
                    { name: 'Em Dia', value: emDia, color: '#10b981' },
                    { name: 'Vencido', value: vencido, color: '#ef4444' },
                    { name: 'Recebido hoje', value: recebidoHoje, color: '#3b82f6' },
                  ].filter(d => d.value > 0);
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={66} dataKey="value" paddingAngle={2}>
                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <RechartsTooltip
                            formatter={(v: number) => formatCentavos(v)}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1.5">
                        {pieData.map(d => (
                          <div key={d.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                              <span className="text-gray-500">{d.name}</span>
                            </div>
                            <span className="font-semibold text-gray-800 tabular-nums">{formatCentavos(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </Card>
            </div>

            {/* Linha 2: Donut contas a pagar + Barras estoque */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Donut — Contas a Pagar */}
              <Card className="p-5">
                <h3 className="text-sm font-bold text-gray-900">Contas a Pagar</h3>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-3">Composição das obrigações abertas</p>
                {(() => {
                  const emDia = Math.max(0, stats.totalPagarAbertoCentavos - stats.totalPagarVencidoCentavos);
                  const vencido = stats.totalPagarVencidoCentavos;
                  const pagoHoje = stats.totalPagoHojeCentavos;
                  const total = emDia + vencido + pagoHoje;
                  if (total === 0) return (
                    <div className="h-44 flex items-center justify-center text-sm text-gray-400">Sem dados</div>
                  );
                  const pieData = [
                    { name: 'Em Dia', value: emDia, color: '#f59e0b' },
                    { name: 'Vencido', value: vencido, color: '#ef4444' },
                    { name: 'Pago hoje', value: pagoHoje, color: '#10b981' },
                  ].filter(d => d.value > 0);
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={66} dataKey="value" paddingAngle={2}>
                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <RechartsTooltip
                            formatter={(v: number) => formatCentavos(v)}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1.5">
                        {pieData.map(d => (
                          <div key={d.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                              <span className="text-gray-500">{d.name}</span>
                            </div>
                            <span className="font-semibold text-gray-800 tabular-nums">{formatCentavos(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </Card>

              {/* Barras — Status do Estoque */}
              <Card className="p-5 lg:col-span-2">
                <h3 className="text-sm font-bold text-gray-900">Status do Estoque</h3>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-5">Distribuição de produtos por status de quantidade</p>
                {!loadingEstoque && estoqueStats.totalProdutos > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart
                      data={[
                        {
                          name: 'Normal',
                          Produtos: Math.max(0, estoqueStats.totalProdutos - estoqueStats.baixos - estoqueStats.zerados),
                        },
                        { name: 'Abaixo mín.', Produtos: estoqueStats.baixos },
                        { name: 'Zerado', Produtos: estoqueStats.zerados },
                      ]}
                      margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                      <RechartsTooltip
                        formatter={(v: number) => [`${v} produto(s)`, '']}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Bar dataKey="Produtos" radius={[6, 6, 0, 0]} maxBarSize={60}>
                        {[
                          { fill: '#10b981' },
                          { fill: '#f59e0b' },
                          { fill: '#ef4444' },
                        ].map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : loadingEstoque ? (
                  <div className="h-44 flex items-center justify-center text-sm text-gray-400">Carregando...</div>
                ) : (
                  <div className="h-44 flex items-center justify-center text-sm text-gray-400">Sem produtos cadastrados</div>
                )}
                {!loadingEstoque && (
                  <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                    {[
                      { label: 'Normal', value: Math.max(0, estoqueStats.totalProdutos - estoqueStats.baixos - estoqueStats.zerados), color: 'text-emerald-600' },
                      { label: 'Abaixo mín.', value: estoqueStats.baixos, color: 'text-amber-600' },
                      { label: 'Zerado', value: estoqueStats.zerados, color: 'text-red-600' },
                    ].map(item => (
                      <div key={item.label} className="text-center">
                        <p className={`text-lg font-black tabular-nums ${item.color}`}>{item.value}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </section>

          {/* ═══ DESEMPENHO DE HOJE ═══ */}
          <section className="space-y-4">
            <SectionHeader
              icon={Target}
              title="Desempenho de Hoje"
              desc="Meta de cobrança diária, movimentação financeira e alertas ativos"
              badge={
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${metaColor.bg} ${metaColor.text}`}>
                  <span className={`h-2 w-2 rounded-full ${metaColor.bar} shrink-0`} />
                  {metaColor.label}
                </span>
              }
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Meta do Dia */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-bold text-gray-900">Meta do Dia</span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${metaColor.bg} ${metaColor.text}`}>
                    {metaColor.label}
                  </span>
                </div>

                <div className="text-center mb-4">
                  <p className="text-5xl font-black text-gray-900 tracking-tight leading-none">
                    {stats.percentualMetaDia.toFixed(0)}<span className="text-2xl font-bold text-gray-400">%</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">atingido da meta</p>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
                    <span>0%</span>
                    <span>Meta: {formatCentavos(stats.totalHojeCentavos)}</span>
                    <span>100%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-4 rounded-full transition-all duration-700 ${metaColor.bar} relative flex items-center justify-end pr-1.5`}
                      style={{ width: `${Math.min(stats.percentualMetaDia, 100)}%`, minWidth: stats.percentualMetaDia > 0 ? '1rem' : '0' }}
                    >
                      {stats.percentualMetaDia >= 20 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-bold px-1 truncate">
                          {formatCentavos(stats.totalRecebidoHojeCentavos)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className={`rounded-xl p-3 ${metaColor.bg}`}>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Recebido</p>
                    <p className={`text-sm font-black mt-0.5 ${metaColor.text}`}>{formatCentavos(stats.totalRecebidoHojeCentavos)}</p>
                    <p className="text-[10px] text-gray-400">{stats.contasRecebidasHoje} parcela(s)</p>
                  </div>
                  <div className="rounded-xl p-3 bg-blue-50">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">A Receber</p>
                    <p className="text-sm font-black mt-0.5 text-blue-600">{formatCentavos(stats.totalHojeCentavos)}</p>
                    <p className="text-[10px] text-gray-400">{stats.contasHoje} parcela(s)</p>
                  </div>
                </div>
              </div>

              {/* Movimentação do Dia */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-bold text-gray-900">Movimentação de Hoje</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm shrink-0">
                        <ArrowDown className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">Entradas</p>
                        <p className="text-[10px] text-gray-400">{stats.contasRecebidasHoje} recebimento(s)</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-600 tabular-nums">{formatCentavos(stats.totalRecebidoHojeCentavos)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-red-50 border border-red-100">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-red-500 flex items-center justify-center shadow-sm shrink-0">
                        <ArrowUp className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">Saídas</p>
                        <p className="text-[10px] text-gray-400">{stats.contasPagasHoje} pagamento(s)</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-red-600 tabular-nums">{formatCentavos(stats.totalPagoHojeCentavos)}</span>
                  </div>
                  <div className={`flex items-center justify-between p-3.5 rounded-xl border ${
                    stats.totalRecebidoHojeCentavos_minus_pago >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${
                        stats.totalRecebidoHojeCentavos_minus_pago >= 0 ? 'bg-blue-600' : 'bg-amber-500'
                      }`}>
                        <Activity className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">Saldo do Dia</p>
                        <p className="text-[10px] text-gray-400">Entradas − Saídas</p>
                      </div>
                    </div>
                    <span className={`text-sm font-black tabular-nums ${
                      stats.totalRecebidoHojeCentavos_minus_pago >= 0 ? 'text-blue-600' : 'text-amber-600'
                    }`}>
                      {formatCentavos(stats.totalRecebidoHojeCentavos_minus_pago)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-[11px]">
                  <span className="text-gray-400">Ticket médio hoje</span>
                  <span className="font-bold text-gray-600">{formatCentavos(stats.ticketMedioHoje)}</span>
                </div>
              </div>

              {/* Alertas */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-bold text-gray-900">Alertas e Pendências</span>
                  </div>
                  {(stats.contasVencidas > 0 || stats.contasPagarVencidas > 0 || stats.inadimplentes > 0) && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-sm">
                      {[stats.contasVencidas > 0, stats.contasPagarVencidas > 0, stats.inadimplentes > 0].filter(Boolean).length}
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {stats.contasVencidas > 0 && (
                    <Link to="/financeiro/contas-receber" className="flex items-center justify-between p-3.5 rounded-xl bg-red-50 border border-red-100 hover:border-red-300 hover:shadow-sm transition">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-red-500 flex items-center justify-center shrink-0 shadow-sm">
                          <CreditCard className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-red-800">{stats.contasVencidas} título(s) vencido(s)</p>
                          <p className="text-[10px] text-red-500">A receber · clique para ver</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end">
                        <p className="text-sm font-black text-red-700">{formatCentavos(stats.totalVencidoCentavos)}</p>
                        <ArrowUpRight className="h-3.5 w-3.5 text-red-400 mt-0.5" />
                      </div>
                    </Link>
                  )}
                  {stats.contasPagarVencidas > 0 && (
                    <Link to="/financeiro/contas-pagar" className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50 border border-amber-100 hover:border-amber-300 hover:shadow-sm transition">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-sm">
                          <ArrowUp className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-amber-800">{stats.contasPagarVencidas} conta(s) a pagar vencida(s)</p>
                          <p className="text-[10px] text-amber-500">Contas a pagar · clique para ver</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end">
                        <p className="text-sm font-black text-amber-700">{formatCentavos(stats.totalPagarVencidoCentavos)}</p>
                        <ArrowUpRight className="h-3.5 w-3.5 text-amber-400 mt-0.5" />
                      </div>
                    </Link>
                  )}
                  {stats.inadimplentes > 0 && (
                    <Link to="/clientes/lista" className="flex items-center justify-between p-3.5 rounded-xl bg-orange-50 border border-orange-100 hover:border-orange-300 hover:shadow-sm transition">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                          <Users className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-orange-800">{stats.inadimplentes} cliente(s) inadimplente(s)</p>
                          <p className="text-[10px] text-orange-500">{stats.taxaInadimplencia.toFixed(1)}% da carteira total</p>
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-orange-400 shrink-0" />
                    </Link>
                  )}
                  {stats.contasVencidas === 0 && stats.contasPagarVencidas === 0 && stats.inadimplentes === 0 && (
                    <div className="text-center py-8">
                      <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                      </div>
                      <p className="text-sm font-bold text-gray-700">Sem alertas</p>
                      <p className="text-xs text-gray-400 mt-1">Nenhuma pendência crítica no momento</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ═══ BASE DE CLIENTES E CARTEIRA ═══ */}
          <section className="space-y-4">
            <SectionHeader
              icon={Users}
              title="Base de Clientes e Carteira"
              desc="Posição atual de clientes ativos, inadimplência, recebíveis e planos"
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Clientes<br/>Ativos</p>
                </div>
                <p className="text-3xl font-black text-gray-900 tracking-tight">{stats.clientesAtivos}</p>
                {stats.inadimplentes > 0 && (
                  <span className="mt-2 inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold">
                    {stats.inadimplentes} inadimplente(s)
                  </span>
                )}
              </div>

              <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Carteira<br/>a Receber</p>
                </div>
                <p className="text-xl font-black text-gray-900 tracking-tight">{formatCentavos(stats.totalAbertoCentavos)}</p>
                <p className="text-[10px] text-gray-400 mt-1">{stats.contasAbertasReceber} título(s) em aberto</p>
              </div>

              <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-rose-600 flex items-center justify-center shadow-sm">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Contas<br/>a Pagar</p>
                </div>
                <p className="text-xl font-black text-gray-900 tracking-tight">{formatCentavos(stats.totalPagarAbertoCentavos)}</p>
                <p className="text-[10px] text-gray-400 mt-1">{stats.contasAbertasPagar} conta(s) em aberto</p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
                    <Percent className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Planos<br/>Ativos</p>
                </div>
                <p className="text-3xl font-black text-gray-900 tracking-tight">{stats.planosAtivos}</p>
                <p className="text-[10px] text-gray-400 mt-1">planos vigentes</p>
              </div>
            </div>
          </section>

          {/* ═══ GESTÃO DE ESTOQUE ═══ */}
          <section className="space-y-4">
            <SectionHeader
              icon={Boxes}
              title="Gestão de Estoque"
              desc="Posição atual do inventário, alertas de reposição e valor estimado"
              badge={(estoqueStats.zerados > 0 || estoqueStats.baixos > 0) ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {estoqueStats.zerados + estoqueStats.baixos} alerta(s)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Estoque saudável
                </span>
              )}
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link to="/estoque/produtos" className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
                    <Boxes className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Total<br/>em Estoque</p>
                </div>
                {loadingEstoque ? <Skeleton className="h-9 w-24" /> : (
                  <p className="text-3xl font-black text-gray-900">{estoqueStats.totalItens.toLocaleString('pt-BR')}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">unidades</p>
              </Link>

              <Link to="/estoque/produtos" className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-sky-600 flex items-center justify-center shadow-sm">
                    <Package className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Produtos<br/>Cadastrados</p>
                </div>
                {loadingEstoque ? <Skeleton className="h-9 w-16" /> : (
                  <p className="text-3xl font-black text-gray-900">{estoqueStats.totalProdutos}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">SKUs ativos</p>
              </Link>

              <Link to="/estoque/produtos" className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition ${
                estoqueStats.baixos > 0 ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-white' : 'border-gray-200 bg-gradient-to-br from-gray-50 to-white'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center shadow-sm ${estoqueStats.baixos > 0 ? 'bg-amber-500' : 'bg-gray-400'}`}>
                    <PackageMinus className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Abaixo<br/>do Mínimo</p>
                </div>
                {loadingEstoque ? <Skeleton className="h-9 w-16" /> : (
                  <p className={`text-3xl font-black ${estoqueStats.baixos > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                    {estoqueStats.baixos}
                  </p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">precisam de reposição</p>
              </Link>

              <Link to="/estoque/produtos" className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition ${
                estoqueStats.zerados > 0 ? 'border-red-200 bg-gradient-to-br from-red-50 to-white' : 'border-gray-200 bg-gradient-to-br from-gray-50 to-white'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center shadow-sm ${estoqueStats.zerados > 0 ? 'bg-red-500' : 'bg-gray-400'}`}>
                    <PackageX className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 font-semibold leading-tight">Produtos<br/>Zerados</p>
                </div>
                {loadingEstoque ? <Skeleton className="h-9 w-16" /> : (
                  <p className={`text-3xl font-black ${estoqueStats.zerados > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                    {estoqueStats.zerados}
                  </p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">sem estoque</p>
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-bold text-gray-900">Produtos com Estoque Crítico</span>
                  </div>
                  <Link to="/estoque/produtos" className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
                    Ver todos <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                {loadingEstoque ? (
                  <div className="space-y-2">
                    <SkeletonBlock h="h-14" /><SkeletonBlock h="h-14" /><SkeletonBlock h="h-14" />
                  </div>
                ) : estoqueStats.criticos.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold text-gray-700">Estoque saudável</p>
                    <p className="text-xs text-gray-400 mt-1">Todos os produtos estão acima do mínimo</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {estoqueStats.criticos.map((p) => {
                      const atual = Number(p.estoque_atual) || 0;
                      const minimo = Number(p.estoque_minimo) || 0;
                      const zerado = atual <= 0;
                      return (
                        <div
                          key={p.id}
                          onClick={() => navigate('/estoque/produtos')}
                          className={`flex items-center justify-between py-3 px-3.5 rounded-xl cursor-pointer border transition ${
                            zerado ? 'bg-red-50 border-red-100 hover:border-red-300' : 'bg-amber-50 border-amber-100 hover:border-amber-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${zerado ? 'bg-red-500' : 'bg-amber-500'}`}>
                              {zerado ? <PackageX className="h-4 w-4 text-white" /> : <PackageMinus className="h-4 w-4 text-white" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{p.nome}</p>
                              <p className="text-[11px] text-gray-400">
                                <span className="font-mono">{p.codigo}</span>
                                {p.categoria && <span> · {p.categoria}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-black ${zerado ? 'text-red-700' : 'text-amber-700'}`}>
                              {atual.toLocaleString('pt-BR')} un.
                            </p>
                            <p className="text-[11px] text-gray-400">mín: {minimo.toLocaleString('pt-BR')}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card className="p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-bold text-gray-900">Valor do Inventário</span>
                </div>
                {loadingEstoque ? (
                  <Skeleton className="h-10 w-40" />
                ) : (
                  <p className="text-3xl font-black text-emerald-700 tracking-tight">
                    {formatCentavos(estoqueStats.valorEstoqueCentavos)}
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-1 mb-5">
                  Estoque atual × preço unitário dos produtos ativos
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Unidades</p>
                    <p className="text-xl font-black text-indigo-700 mt-0.5 tabular-nums">
                      {loadingEstoque ? '—' : estoqueStats.totalItens.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-3 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">SKUs</p>
                    <p className="text-xl font-black text-sky-700 mt-0.5 tabular-nums">
                      {loadingEstoque ? '—' : estoqueStats.totalProdutos}
                    </p>
                  </div>
                </div>
                <Link
                  to="/estoque/produtos"
                  className="mt-auto flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold pt-3 border-t border-gray-100"
                >
                  Abrir gestão de estoque <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            </div>
          </section>

          {/* ═══ AGENDA DE VENCIMENTOS ═══ */}
          <section className="space-y-4">
            <SectionHeader
              icon={Calendar}
              title="Agenda de Vencimentos — Próximos 7 dias"
              desc="Títulos a receber e contas a pagar com vencimento em breve"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm">
                      <ArrowDown className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">A Receber</p>
                      <p className="text-[11px] text-gray-400">Próximos 7 dias · {stats.proximosReceber.length} título(s)</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-black rounded-xl tabular-nums">
                    {formatCentavos(stats.totalProximosReceber)}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {stats.proximosReceber.length > 0 ? stats.proximosReceber.slice(0, 8).map((cr) => (
                    <div
                      key={cr.id}
                      onClick={() => navigate('/financeiro/contas-receber')}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition cursor-pointer border border-transparent hover:border-gray-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                          <DollarSign className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{cr.codigo}</p>
                          <p className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(`${cr.data_vencimento}T00:00`).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-gray-900 shrink-0 tabular-nums">{formatCentavos(cr.valor_aberto_centavos)}</span>
                    </div>
                  )) : (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-10 w-10 text-emerald-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Nenhum vencimento nos próximos 7 dias</p>
                    </div>
                  )}
                </div>
                <Link to="/financeiro/contas-receber" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold pt-3 border-t border-gray-100">
                  Ver todas as contas a receber <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-red-500 flex items-center justify-center shadow-sm">
                      <ArrowUp className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">A Pagar</p>
                      <p className="text-[11px] text-gray-400">Próximos 7 dias · {stats.proximosPagar.length} conta(s)</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1.5 bg-red-50 border border-red-100 text-red-700 text-xs font-black rounded-xl tabular-nums">
                    {formatCentavos(stats.totalProximosPagar)}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {stats.proximosPagar.length > 0 ? stats.proximosPagar.slice(0, 8).map((cp) => (
                    <div
                      key={cp.id}
                      onClick={() => navigate('/financeiro/contas-pagar')}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition cursor-pointer border border-transparent hover:border-gray-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                          <CreditCard className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{cp.descricao || cp.codigo}</p>
                          <p className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(`${cp.data_vencimento}T00:00`).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-gray-900 shrink-0 tabular-nums">{formatCentavos(cp.valor_aberto_centavos)}</span>
                    </div>
                  )) : (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-10 w-10 text-red-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Nenhum pagamento nos próximos 7 dias</p>
                    </div>
                  )}
                </div>
                <Link to="/financeiro/contas-pagar" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold pt-3 border-t border-gray-100">
                  Ver todas as contas a pagar <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            </div>
          </section>

          {/* ═══ ACESSO RÁPIDO ═══ */}
          <section className="space-y-4">
            <SectionHeader
              icon={ArrowUpRight}
              title="Acesso Rápido"
              desc="Atalhos para os principais módulos do sistema"
            />
            <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {([
                { label: 'A Receber', path: '/financeiro/contas-receber', count: dash.titulos_receber_abertos, icon: ArrowDown, bg: 'bg-emerald-100', fg: 'text-emerald-600' },
                { label: 'A Pagar', path: '/financeiro/contas-pagar', count: dash.titulos_pagar_abertos, icon: ArrowUp, bg: 'bg-red-100', fg: 'text-red-600' },
                { label: 'Tesouraria', path: '/financeiro/tesouraria', icon: Landmark, bg: 'bg-blue-100', fg: 'text-blue-600' },
                { label: 'Clientes', path: '/clientes/lista', count: stats.clientesAtivos, icon: Users, bg: 'bg-violet-100', fg: 'text-violet-600' },
                { label: 'Estoque', path: '/estoque/produtos', count: estoqueStats.totalProdutos, icon: Boxes, bg: 'bg-indigo-100', fg: 'text-indigo-600' },
                { label: 'Relatórios', path: '/relatorios', icon: BarChart3, bg: 'bg-gray-100', fg: 'text-gray-600' },
              ] as const).map((link) => {
                const IconComp = link.icon as React.ElementType;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all text-center group"
                  >
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${link.bg} ${link.fg} group-hover:scale-110 transition-transform`}>
                      <IconComp className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 leading-tight">{link.label}</span>
                    {('count' in link && link.count != null) && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-full tabular-nums">
                        {link.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;
