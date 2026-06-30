import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Calendar, HandCoins, PackagePlus, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AssinaturaSB, ClienteSB } from '../../lib/ClienteStore';
import type { ContaReceberDetalhada } from '../../lib/FinanceiroStore';
import { Button, Card, Input, Select } from '../ui/Components';
import { useToast } from '../../lib/ToastStore';
import { formatarDataIsoPtBr, parcelaEstaVencida } from '../../lib/contratoDatas';

type Props = {
  cliente: ClienteSB;
  assinaturas: AssinaturaSB[];
  mensalidades: ContaReceberDetalhada[];
  onAtualizado: () => Promise<void>;
};

const STATUS_ABERTO = ['aberto', 'pendente', 'pago_parcial', 'vencido'];

function toCentavos(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function formatCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function addMeses(baseIso: string, meses: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function ajustarDiaVencimento(dataBaseIso: string, dia: number): string {
  const d = new Date(`${dataBaseIso}T12:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth();
  const ultimoDia = new Date(year, month + 1, 0).getDate();
  const alvoDia = Math.max(1, Math.min(dia || 1, ultimoDia));
  return new Date(year, month, alvoDia, 12, 0, 0).toISOString().slice(0, 10);
}

function novoCodigoCr(): string {
  const a = Date.now().toString(36).toUpperCase();
  const b = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CRV-${a}${b}`.slice(0, 30);
}

function limparDescricaoVenda(descricao?: string | null): string {
  const raw = String(descricao || '').trim();
  if (!raw) return 'Venda adicional';
  return raw
    .replace('[Venda adicional recorrente]', '')
    .replace('[Venda avulsa separada]', '')
    .replace(/\(\d+\/\d+\)\s*$/, '')
    .trim();
}

type LinhaVenda = {
  id: string;
  tipo: 'mensalidade' | 'adicional' | 'avulsa';
  descricao: string;
  data: string;
  situacao: string;
  mensalidadeCentavos: number;
  adicionalCentavos: number;
  avulsaCentavos: number;
};

export const ContratoVendaView: React.FC<Props> = ({ cliente, assinaturas, mensalidades, onAtualizado }) => {
  const { showToast } = useToast();
  const [acaoAberta, setAcaoAberta] = useState<'transferencia' | 'adicional' | 'avulsa' | 'reajuste' | null>(null);
  const [salvandoReajuste, setSalvandoReajuste] = useState(false);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [salvandoTransferencia, setSalvandoTransferencia] = useState(false);

  const assinaturaAtiva = useMemo(
    () => assinaturas.find((a) => (a.status || '').toLowerCase() === 'ativo') || assinaturas[0] || null,
    [assinaturas],
  );

  const [assinaturaId, setAssinaturaId] = useState<string>(assinaturaAtiva?.id || '');
  const [novoValorReajuste, setNovoValorReajuste] = useState<string>(
    assinaturaAtiva ? (assinaturaAtiva.valor_mensal_centavos / 100).toFixed(2).replace('.', ',') : '',
  );

  const [descricaoVenda, setDescricaoVenda] = useState('Venda adicional');
  const [valorVenda, setValorVenda] = useState('2,00');
  const [modoVenda, setModoVenda] = useState<'recorrente_junto' | 'avulsa_separada'>('recorrente_junto');
  const [quantidadeMeses, setQuantidadeMeses] = useState('12');
  const [vencimentoAvulso, setVencimentoAvulso] = useState(new Date().toISOString().slice(0, 10));

  const [cpfDestino, setCpfDestino] = useState('');
  const [incluirUltimaVencida, setIncluirUltimaVencida] = useState(true);

  const assinaturaSelecionada = useMemo(
    () => assinaturas.find((a) => a.id === assinaturaId) || assinaturaAtiva,
    [assinaturas, assinaturaId, assinaturaAtiva],
  );

  useEffect(() => {
    if (!assinaturaSelecionada) return;
    setNovoValorReajuste((assinaturaSelecionada.valor_mensal_centavos / 100).toFixed(2).replace('.', ','));
  }, [assinaturaSelecionada?.id, assinaturaSelecionada?.valor_mensal_centavos]);

  const resumoTransferencia = useMemo(() => {
    if (!assinaturaSelecionada) return { tempo: '—', ultimaVencida: null as ContaReceberDetalhada | null };
    const dataBase = assinaturaSelecionada.data_contratacao || assinaturaSelecionada.created_at;
    const inicio = new Date(`${String(dataBase).slice(0, 10)}T12:00:00`);
    let tempo = '—';
    if (!Number.isNaN(inicio.getTime())) {
      const hoje = new Date();
      let meses = (hoje.getFullYear() - inicio.getFullYear()) * 12 + (hoje.getMonth() - inicio.getMonth());
      if (hoje.getDate() < inicio.getDate()) meses -= 1;
      tempo = meses <= 0 ? '< 1 mês' : `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
    }
    const vencidas = mensalidades
      .filter((m) => m.assinatura_id === assinaturaSelecionada.id && parcelaEstaVencida(m.data_vencimento, m.status))
      .sort((a, b) => new Date(b.data_vencimento).getTime() - new Date(a.data_vencimento).getTime());
    return { tempo, ultimaVencida: vencidas[0] || null };
  }, [assinaturaSelecionada, mensalidades]);

  const linhasVenda = useMemo(() => {
    if (!assinaturaSelecionada) return [] as LinhaVenda[];
    const parcelasContrato = mensalidades.filter((m) => m.assinatura_id === assinaturaSelecionada.id);
    const adicionais = parcelasContrato.filter((m) => (m.tipo_documento || '').toLowerCase() === 'venda_adicional');
    const avulsas = parcelasContrato.filter((m) => (m.tipo_documento || '').toLowerCase() === 'venda_avulsa');

    const agrupados = new Map<
      string,
      { descricao: string; itens: ContaReceberDetalhada[] }
    >();
    for (const item of adicionais) {
      const key = limparDescricaoVenda(item.descricao).toLowerCase();
      const prev = agrupados.get(key);
      if (prev) prev.itens.push(item);
      else agrupados.set(key, { descricao: limparDescricaoVenda(item.descricao), itens: [item] });
    }

    const linhaBase: LinhaVenda = {
      id: `mensalidade-${assinaturaSelecionada.id}`,
      tipo: 'mensalidade',
      descricao: assinaturaSelecionada.plano_nome || 'Mensalidade do contrato',
      data: assinaturaSelecionada.data_contratacao || assinaturaSelecionada.created_at || '',
      situacao: 'Ativo',
      mensalidadeCentavos: assinaturaSelecionada.valor_mensal_centavos || 0,
      adicionalCentavos: 0,
      avulsaCentavos: 0,
    };

    const linhasAdicionais: LinhaVenda[] = Array.from(agrupados.entries()).map(([key, grupo]) => {
      const ordenados = [...grupo.itens].sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime());
      const abertos = grupo.itens.filter((x) => ['aberto', 'pendente', 'vencido', 'pago_parcial'].includes((x.status || '').toLowerCase()));
      const valorPrincipal = (abertos[0]?.valor_total_centavos ?? ordenados[0]?.valor_total_centavos ?? 0);
      return {
        id: `adicional-${key}`,
        tipo: 'adicional',
        descricao: grupo.descricao,
        data: ordenados[0]?.data_vencimento || '',
        situacao: abertos.length > 0 ? `Ativo (${abertos.length} parcelas)` : 'Finalizado',
        mensalidadeCentavos: 0,
        adicionalCentavos: valorPrincipal,
        avulsaCentavos: 0,
      };
    });

    const linhasAvulsas: LinhaVenda[] = avulsas
      .sort((a, b) => new Date(b.data_vencimento).getTime() - new Date(a.data_vencimento).getTime())
      .slice(0, 20)
      .map((item) => ({
        id: `avulsa-${item.id}`,
        tipo: 'avulsa',
        descricao: limparDescricaoVenda(item.descricao),
        data: item.data_vencimento || item.created_at || '',
        situacao: item.status || 'aberto',
        mensalidadeCentavos: 0,
        adicionalCentavos: 0,
        avulsaCentavos: item.valor_total_centavos || 0,
      }));

    return [linhaBase, ...linhasAdicionais, ...linhasAvulsas];
  }, [assinaturaSelecionada, mensalidades]);

  const totalAdicionalAtivoCentavos = useMemo(
    () => linhasVenda.filter((l) => l.tipo === 'adicional' && l.situacao.startsWith('Ativo')).reduce((acc, l) => acc + l.adicionalCentavos, 0),
    [linhasVenda],
  );

  const handleSalvarReajuste = async () => {
    if (!assinaturaSelecionada) {
      showToast('Selecione um contrato para reajuste.', 'warning');
      return;
    }
    const novoCentavos = toCentavos(novoValorReajuste);
    if (novoCentavos <= 0) {
      showToast('Informe um valor válido para o plano.', 'warning');
      return;
    }
    setSalvandoReajuste(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const { error: errAss } = await supabase
        .from('assinaturas')
        .update({ valor_mensal_centavos: novoCentavos, updated_at: new Date().toISOString() })
        .eq('id', assinaturaSelecionada.id);
      if (errAss) throw errAss;

      const { error: errParcelas } = await supabase
        .from('fin_contas_receber')
        .update({
          valor_original_centavos: novoCentavos,
          valor_total_centavos: novoCentavos,
          updated_at: new Date().toISOString(),
        })
        .eq('assinatura_id', assinaturaSelecionada.id)
        .eq('tipo_documento', 'mensalidade')
        .in('status', ['aberto', 'pendente', 'pago_parcial'])
        .gte('data_vencimento', hoje)
        .is('deleted_at', null);
      if (errParcelas) throw errParcelas;

      await onAtualizado();
      setAcaoAberta(null);
      showToast('Plano reajustado. Apenas parcelas futuras foram atualizadas.', 'success');
    } catch (error) {
      console.error('[ContratoVendaView][reajuste]', error);
      showToast('Não foi possível salvar o reajuste do plano.', 'error');
    } finally {
      setSalvandoReajuste(false);
    }
  };

  const handleCriarVenda = async () => {
    if (!assinaturaSelecionada) {
      showToast('Selecione um contrato para registrar a venda.', 'warning');
      return;
    }
    const valorCentavos = toCentavos(valorVenda);
    if (!descricaoVenda.trim() || valorCentavos <= 0) {
      showToast('Informe descrição e valor válidos.', 'warning');
      return;
    }
    setSalvandoVenda(true);
    try {
      if (modoVenda === 'recorrente_junto') {
        const meses = Math.max(1, Math.min(36, Number(quantidadeMeses) || 1));
        const inicioBase = new Date().toISOString().slice(0, 10);
        const registros = Array.from({ length: meses }).map((_, idx) => {
          const base = addMeses(inicioBase, idx);
          const vencimento = ajustarDiaVencimento(base, assinaturaSelecionada.dia_vencimento);
          return {
            empresa_id: assinaturaSelecionada.empresa_id || cliente.empresa_id,
            assinatura_id: assinaturaSelecionada.id,
            cliente_id: cliente.id,
            codigo: novoCodigoCr(),
            tipo_documento: 'venda_adicional',
            descricao: `[Venda adicional recorrente] ${descricaoVenda.trim()} (${idx + 1}/${meses})`,
            valor_original_centavos: valorCentavos,
            valor_juros_centavos: 0,
            valor_multa_centavos: 0,
            valor_desconto_centavos: 0,
            valor_total_centavos: valorCentavos,
            valor_pago_centavos: 0,
            valor_aberto_centavos: valorCentavos,
            data_emissao: new Date().toISOString().slice(0, 10),
            data_vencimento: vencimento,
            data_competencia: base,
            status: 'aberto',
            parcela_numero: idx + 1,
            total_parcelas: meses,
          };
        });
        const { error } = await supabase.from('fin_contas_receber').insert(registros);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fin_contas_receber').insert({
          empresa_id: assinaturaSelecionada.empresa_id || cliente.empresa_id,
          assinatura_id: assinaturaSelecionada.id,
          cliente_id: cliente.id,
          codigo: novoCodigoCr(),
          tipo_documento: 'venda_avulsa',
          descricao: `[Venda avulsa separada] ${descricaoVenda.trim()}`,
          valor_original_centavos: valorCentavos,
          valor_juros_centavos: 0,
          valor_multa_centavos: 0,
          valor_desconto_centavos: 0,
          valor_total_centavos: valorCentavos,
          valor_pago_centavos: 0,
          valor_aberto_centavos: valorCentavos,
          data_emissao: new Date().toISOString().slice(0, 10),
          data_vencimento: vencimentoAvulso,
          data_competencia: vencimentoAvulso,
          status: 'aberto',
          parcela_numero: 1,
          total_parcelas: 1,
        });
        if (error) throw error;
      }
      setAcaoAberta(null);
      await onAtualizado();
      showToast(
        modoVenda === 'recorrente_junto'
          ? 'Venda adicional recorrente criada e vinculada às próximas mensalidades.'
          : 'Venda avulsa criada separada da mensalidade.',
        'success',
      );
    } catch (error) {
      console.error('[ContratoVendaView][venda]', error);
      showToast('Erro ao salvar a venda adicional.', 'error');
    } finally {
      setSalvandoVenda(false);
    }
  };

  const handleTransferir = async () => {
    if (!assinaturaSelecionada) {
      showToast('Selecione um contrato para transferir.', 'warning');
      return;
    }
    const cpf = cpfDestino.replace(/\D/g, '');
    if (cpf.length !== 11) {
      showToast('Informe um CPF de destino válido.', 'warning');
      return;
    }
    setSalvandoTransferencia(true);
    try {
      const { data: destino, error: errDestino } = await supabase
        .from('clientes')
        .select('id, nome, empresa_id, cpf')
        .eq('cpf', cpf)
        .is('deleted_at', null)
        .maybeSingle();
      if (errDestino) throw errDestino;
      if (!destino?.id) {
        showToast('Cliente destino não encontrado com esse CPF.', 'warning');
        return;
      }
      if (destino.id === cliente.id) {
        showToast('O cliente de destino deve ser diferente do cliente atual.', 'warning');
        return;
      }

      const { error: errAssinatura } = await supabase
        .from('assinaturas')
        .update({
          cliente_id: destino.id,
          empresa_id: destino.empresa_id || assinaturaSelecionada.empresa_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assinaturaSelecionada.id);
      if (errAssinatura) throw errAssinatura;

      const { error: errBenef } = await supabase
        .from('beneficiarios')
        .update({
          cliente_id: destino.id,
          updated_at: new Date().toISOString(),
        })
        .eq('assinatura_id', assinaturaSelecionada.id)
        .is('deleted_at', null);
      if (errBenef) throw errBenef;

      const baseUpdate = supabase
        .from('fin_contas_receber')
        .update({
          cliente_id: destino.id,
          empresa_id: destino.empresa_id || assinaturaSelecionada.empresa_id,
          updated_at: new Date().toISOString(),
        })
        .eq('assinatura_id', assinaturaSelecionada.id)
        .in('status', STATUS_ABERTO)
        .is('deleted_at', null);

      if (incluirUltimaVencida) {
        const vencidas = mensalidades
          .filter((m) => m.assinatura_id === assinaturaSelecionada.id && parcelaEstaVencida(m.data_vencimento, m.status))
          .sort((a, b) => new Date(b.data_vencimento).getTime() - new Date(a.data_vencimento).getTime());
        const ultima = vencidas[0];
        if (ultima?.id) {
          const { error: errUltima } = await supabase
            .from('fin_contas_receber')
            .update({
              cliente_id: destino.id,
              empresa_id: destino.empresa_id || assinaturaSelecionada.empresa_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ultima.id);
          if (errUltima) throw errUltima;
        }
      }

      const { error: errParcelas } = await baseUpdate;
      if (errParcelas) throw errParcelas;

      await onAtualizado();
      setAcaoAberta(null);
      showToast('Transferência concluída: contrato, beneficiários e parcelas selecionadas foram movidos.', 'success');
    } catch (error) {
      console.error('[ContratoVendaView][transferencia]', error);
      showToast('Não foi possível concluir a transferência do contrato.', 'error');
    } finally {
      setSalvandoTransferencia(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">Contrato</p>
            <Select value={assinaturaId} onChange={(e) => setAssinaturaId(e.target.value)} className="h-9 text-xs">
              {assinaturas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo || a.id.slice(0, 8)} — {a.plano_nome || 'Plano'}
                </option>
              ))}
            </Select>
          </div>
          <div className="rounded-lg bg-gray-50 border px-3 py-2 text-xs">
            <p className="text-[10px] uppercase font-black text-gray-500">Mensalidade normal</p>
            <p className="font-black text-gray-900 text-base">{formatCentavos(assinaturaSelecionada?.valor_mensal_centavos || 0)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs">
            <p className="text-[10px] uppercase font-black text-blue-600">Mensalidade com adicionais</p>
            <p className="font-black text-blue-900 text-base">
              {formatCentavos((assinaturaSelecionada?.valor_mensal_centavos || 0) + totalAdicionalAtivoCentavos)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAcaoAberta((v) => (v === 'transferencia' ? null : 'transferencia'))}>
            <ArrowRightLeft className="h-4 w-4 mr-1.5" />
            Transferência
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setModoVenda('recorrente_junto'); setAcaoAberta((v) => (v === 'adicional' ? null : 'adicional')); }}>
            <PackagePlus className="h-4 w-4 mr-1.5" />
            Venda adicional
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setModoVenda('avulsa_separada'); setAcaoAberta((v) => (v === 'avulsa' ? null : 'avulsa')); }}>
            <Calendar className="h-4 w-4 mr-1.5" />
            Venda avulsa
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAcaoAberta((v) => (v === 'reajuste' ? null : 'reajuste'))}>
            <HandCoins className="h-4 w-4 mr-1.5" />
            Mês reajuste contrato
          </Button>
        </div>

        {acaoAberta === 'reajuste' && (
          <div className="mt-3 p-3 rounded-lg border bg-amber-50/50 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <Input label="Novo valor mensal (R$)" value={novoValorReajuste} onChange={(e) => setNovoValorReajuste(e.target.value)} />
            <div className="md:col-span-3 flex justify-end">
              <Button onClick={() => void handleSalvarReajuste()} loading={salvandoReajuste}>
                <Save className="h-4 w-4 mr-2" />
                Salvar reajuste
              </Button>
            </div>
          </div>
        )}

        {(acaoAberta === 'adicional' || acaoAberta === 'avulsa') && (
          <div className="mt-3 p-3 rounded-lg border bg-blue-50/40 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <Input label="Nome da venda" value={descricaoVenda} onChange={(e) => setDescricaoVenda(e.target.value)} />
            <Input label="Valor (R$)" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} />
            {modoVenda === 'recorrente_junto' ? (
              <Input label="Qtd meses" type="number" min={1} max={36} value={quantidadeMeses} onChange={(e) => setQuantidadeMeses(e.target.value)} />
            ) : (
              <Input label="Vencimento" type="date" value={vencimentoAvulso} onChange={(e) => setVencimentoAvulso(e.target.value)} />
            )}
            <div className="flex justify-end">
              <Button onClick={() => void handleCriarVenda()} loading={salvandoVenda} className="bg-blue-600 hover:bg-blue-700">
                Salvar venda
              </Button>
            </div>
          </div>
        )}

        {acaoAberta === 'transferencia' && (
          <div className="mt-3 p-3 rounded-lg border bg-emerald-50/40 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <Input label="CPF cliente destino" value={cpfDestino} onChange={(e) => setCpfDestino(e.target.value)} />
            <div className="md:col-span-2 text-xs text-emerald-900">
              <p><strong>Tempo de contrato:</strong> {resumoTransferencia.tempo}</p>
              <p>
                <strong>Ultima vencida:</strong>{' '}
                {resumoTransferencia.ultimaVencida
                  ? `${formatarDataIsoPtBr(resumoTransferencia.ultimaVencida.data_vencimento)} (${formatCentavos(
                      resumoTransferencia.ultimaVencida.valor_total_centavos || 0,
                    )})`
                  : 'nenhuma'}
              </p>
              <label className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={incluirUltimaVencida} onChange={(e) => setIncluirUltimaVencida(e.target.checked)} />
                Incluir ultima parcela vencida
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void handleTransferir()} loading={salvandoTransferencia}>
                Transferir
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-bold text-gray-900 uppercase tracking-tight text-sm">Vendas do contrato</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-white uppercase text-[10px] font-black tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Tipo venda</th>
                <th className="px-3 py-2 text-left">Data da venda</th>
                <th className="px-3 py-2 text-left">Situação</th>
                <th className="px-3 py-2 text-right">Mensalidade</th>
                <th className="px-3 py-2 text-right">Venda adicional</th>
                <th className="px-3 py-2 text-right">Venda avulsa</th>
              </tr>
            </thead>
            <tbody>
              {linhasVenda.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nenhum item de venda para este contrato.
                  </td>
                </tr>
              ) : (
                linhasVenda.map((linha, idx) => (
                  <tr key={linha.id} className={idx % 2 ? 'bg-gray-50 border-b' : 'bg-white border-b'}>
                    <td className="px-3 py-2 font-semibold text-gray-900">{linha.descricao}</td>
                    <td className="px-3 py-2 text-gray-700">{linha.data ? formatarDataIsoPtBr(linha.data) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold">
                        {linha.situacao}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{linha.mensalidadeCentavos ? formatCentavos(linha.mensalidadeCentavos) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{linha.adicionalCentavos ? formatCentavos(linha.adicionalCentavos) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{linha.avulsaCentavos ? formatCentavos(linha.avulsaCentavos) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
