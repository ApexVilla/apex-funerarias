import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2, User, Users } from 'lucide-react';
import type { AssinaturaSB, ClienteSB } from '../../lib/ClienteStore';
import { Modal } from '../ui/Modal';
import { Button, Label, Select } from '../ui/Components';
import { useFinanceiro } from '../../lib/FinanceiroStore';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { PixPagadorConfirmacao } from '../financeiro/PixPagadorConfirmacao';
import {
  formaEhPix,
  pixPagadorParaBaixa,
  pixPagadorStateInicial,
  validarPixPagador,
  type PixPagadorState,
} from '../../lib/pixPagadorBaixa';
import {
  filtrarContasOperaveis,
  resolverContaCaixaPadrao,
  usuarioPodeVerTodosCaixas,
} from '../../lib/finCaixaPermissoes';
import { useAuth } from '../../lib/AuthContext';

export const VALOR_CARTEIRINHA_CENTAVOS = 300;
/** tipo_documento aceito pelo CHECK fin_contas_receber_tipo_documento_check */
export const TIPO_DOCUMENTO_CARTEIRINHA = 'servico_avulso';

export type SolicitarCarteirinhaPessoa = {
  id: string;
  nome: string;
  tipo: 'titular' | 'beneficiario';
  parentesco: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cliente: ClienteSB;
  assinatura: AssinaturaSB;
  pessoas: SolicitarCarteirinhaPessoa[];
};

const hoje = () => new Date().toISOString().split('T')[0];

const formatarValor = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SolicitarCarteirinhaModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  cliente,
  assinatura,
  pessoas,
}) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const {
    criarContaReceber,
    baixarContaReceber,
    formasPagamento,
    contasBancarias,
    loadFormasPagamento,
    loadContasBancarias,
  } = useFinanceiro();

  const [loading, setLoading] = useState(false);
  const [formaPagamentoId, setFormaPagamentoId] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [receberAgora, setReceberAgora] = useState(true);
  const [pixPagador, setPixPagador] = useState<PixPagadorState>(pixPagadorStateInicial);
  const [erro, setErro] = useState<string | null>(null);

  const verTodosCaixas = usuarioPodeVerTodosCaixas(user?.role, user?.permissoes);
  const contasOperaveis = useMemo(
    () => filtrarContasOperaveis(contasBancarias, user?.id, verTodosCaixas),
    [contasBancarias, user?.id, verTodosCaixas],
  );

  const formaSelecionada = formasPagamento.find((f) => f.id === formaPagamentoId);
  const pagamentoPix = formaEhPix(formaSelecionada?.tipo || formaSelecionada?.nome);
  const quantidade = pessoas.length;
  const valorTotalCentavos = VALOR_CARTEIRINHA_CENTAVOS * quantidade;
  const loteUnico = quantidade > 1;

  useEffect(() => {
    if (!isOpen) return;
    setErro(null);
    setFormaPagamentoId('');
    setReceberAgora(true);
    setPixPagador(pixPagadorStateInicial());
    void loadFormasPagamento();
    void loadContasBancarias();
  }, [isOpen, loadFormasPagamento, loadContasBancarias]);

  useEffect(() => {
    if (!isOpen || contaBancariaId || contasOperaveis.length === 0) return;
    const padrao = resolverContaCaixaPadrao(contasOperaveis, user?.id);
    if (padrao?.id) setContaBancariaId(padrao.id);
  }, [isOpen, contasOperaveis, contaBancariaId, user?.id]);

  const handleConfirmar = async () => {
    setErro(null);

    if (quantidade === 0) {
      setErro('Nenhuma carteirinha selecionada.');
      return;
    }
    if (!formaPagamentoId) {
      setErro('Selecione a forma de pagamento.');
      return;
    }
    if (receberAgora && !contaBancariaId) {
      setErro('Selecione a conta/caixa para registrar o recebimento.');
      return;
    }
    if (receberAgora && pagamentoPix) {
      const erroPix = validarPixPagador(true, pixPagador);
      if (erroPix) {
        setErro(erroPix);
        return;
      }
    }

    setLoading(true);
    try {
      for (const pessoa of pessoas) {
        const { data: existente } = await supabase
          .from('carteirinha_solicitacoes')
          .select('id')
          .eq('assinatura_id', assinatura.id)
          .eq('pessoa_id', pessoa.id)
          .eq('pessoa_tipo', pessoa.tipo)
          .maybeSingle();

        if (existente?.id) {
          throw new Error(`${pessoa.nome} já possui solicitação de carteirinha neste contrato.`);
        }
      }

      await supabase.rpc('fin_garantir_natureza_carteirinha_cliente', { p_empresa_id: cliente.empresa_id });
      const { data: planoContas } = await supabase
        .from('fin_plano_contas')
        .select('id')
        .eq('empresa_id', cliente.empresa_id)
        .eq('codigo', 'REC-CART')
        .maybeSingle();

      const dataHoje = hoje();
      const nomesResumo = pessoas.map((p) => p.nome).join(', ');
      const descricao = loteUnico
        ? `Emissão de Carteirinhas (${quantidade}x) - ${nomesResumo}`
        : `Emissão de Carteirinha - ${pessoas[0].nome}`;

      const newReceitaId = await criarContaReceber({
        empresa_id: cliente.empresa_id,
        cliente_id: cliente.id,
        assinatura_id: assinatura.id,
        tipo_documento: TIPO_DOCUMENTO_CARTEIRINHA,
        descricao,
        numero_documento: `CART-${assinatura.codigo || assinatura.id.slice(0, 5).toUpperCase()}`,
        plano_conta_id: planoContas?.id || undefined,
        forma_pagamento_id: formaPagamentoId,
        conta_bancaria_id: receberAgora ? contaBancariaId : undefined,
        valor_original_centavos: valorTotalCentavos,
        data_emissao: dataHoje,
        data_vencimento: dataHoje,
        data_competencia: dataHoje,
        status: 'aberto',
        parcela_numero: 1,
        total_parcelas: 1,
      } as Parameters<typeof criarContaReceber>[0] & {
        numero_documento?: string;
        forma_pagamento_id?: string;
        conta_bancaria_id?: string;
      });

      if (!newReceitaId) {
        throw new Error(`Não foi possível gerar a conta a receber de ${formatarValor(valorTotalCentavos)}.`);
      }

      if (receberAgora) {
        const okBaixa = await baixarContaReceber({
          conta_receber_id: newReceitaId,
          valor_pago_centavos: valorTotalCentavos,
          forma_pagamento_id: formaPagamentoId,
          conta_bancaria_id: contaBancariaId,
          data_pagamento: dataHoje,
          observacoes: loteUnico ? `Carteirinhas (${quantidade}x)` : `Carteirinha - ${pessoas[0].nome}`,
          ...(pagamentoPix ? pixPagadorParaBaixa(true, pixPagador) : {}),
        });
        if (!okBaixa) {
          throw new Error('Título criado, mas falhou ao registrar o recebimento.');
        }
      }

      const { error: insError } = await supabase.from('carteirinha_solicitacoes').insert(
        pessoas.map((pessoa) => ({
          empresa_id: cliente.empresa_id,
          assinatura_id: assinatura.id,
          cliente_id: cliente.id,
          pessoa_tipo: pessoa.tipo,
          pessoa_id: pessoa.id,
          pessoa_nome: pessoa.nome,
          conta_receber_id: newReceitaId,
        })),
      );
      if (insError) throw insError;

      await supabase.from('timeline_clientes').insert({
        empresa_id: cliente.empresa_id,
        cliente_id: cliente.id,
        tipo_evento: 'AUDITORIA',
        categoria: 'contrato',
        titulo: loteUnico ? 'Solicitação em lote de carteirinhas' : 'Solicitação de carteirinha gerada',
        descricao: loteUnico
          ? `${quantidade} carteirinhas solicitadas (${nomesResumo}). Título único de ${formatarValor(valorTotalCentavos)} ${receberAgora ? 'recebido' : 'gerado em aberto'}.`
          : `Carteirinha solicitada para ${pessoas[0].nome}. Título de ${formatarValor(valorTotalCentavos)} ${receberAgora ? 'recebido' : 'gerado em aberto'}.`,
        referencia_tipo: 'carteirinha_solicitacao',
        data_evento: new Date().toISOString(),
      });

      showToast(
        loteUnico
          ? `${quantidade} carteirinhas liberadas! Título de ${formatarValor(valorTotalCentavos)} ${receberAgora ? 'recebido' : 'gerado'}.`
          : `Carteirinha de ${pessoas[0].nome} liberada! Pagamento de ${formatarValor(valorTotalCentavos)} ${receberAgora ? 'registrado' : 'gerado'}.`,
        'success',
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Erro ao processar solicitação.';
      setErro(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const tituloModal = loteUnico ? `Solicitar ${quantidade} Carteirinhas` : 'Solicitar Carteirinha';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tituloModal} size="md">
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          {loteUnico
            ? 'Será gerada uma única conta a receber para todas as carteirinhas pendentes selecionadas.'
            : 'Confirme os dados e a forma de pagamento. O cliente já está vinculado automaticamente.'}
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Cliente</p>
              <p className="font-bold text-slate-900">{cliente.nome}</p>
              <p className="text-xs text-slate-500">{cliente.codigo || cliente.cpf || '—'}</p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">
              {loteUnico ? 'Carteirinhas neste lote' : 'Beneficiário'}
            </p>
            {loteUnico ? (
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {pessoas.map((p) => (
                  <li key={`${p.tipo}-${p.id}`} className="flex items-center gap-2 text-xs">
                    <Users className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-800">{p.nome}</span>
                    <span className="text-slate-500">({p.parentesco})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="font-semibold text-slate-900">{pessoas[0]?.nome}</p>
                <p className="text-xs text-slate-500">{pessoas[0]?.parentesco}</p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Contrato</p>
              <p className="font-semibold text-slate-900">{assinatura.codigo || assinatura.id.slice(0, 8)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-slate-500">Valor total</p>
              <p className="text-lg font-black text-emerald-700">{formatarValor(valorTotalCentavos)}</p>
              {loteUnico && (
                <p className="text-[10px] text-slate-500">
                  {quantidade} × {formatarValor(VALOR_CARTEIRINHA_CENTAVOS)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-slate-600">
              {loteUnico ? '1 conta a receber para todo o lote' : '1 conta a receber por carteirinha'}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-slate-600">Forma de pagamento *</Label>
          <Select
            value={formaPagamentoId}
            onChange={(e) => setFormaPagamentoId(e.target.value)}
            className="h-10 text-sm"
          >
            <option value="">Selecione...</option>
            {formasPagamento
              .filter((f) => f.ativo !== false)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={receberAgora}
            onChange={(e) => setReceberAgora(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Registrar recebimento agora (baixa no caixa)
        </label>

        {receberAgora && (
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-600">Conta / caixa *</Label>
            <Select
              value={contaBancariaId}
              onChange={(e) => setContaBancariaId(e.target.value)}
              className="h-10 text-sm"
            >
              <option value="">Selecione...</option>
              {contasOperaveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
        )}

        {receberAgora && pagamentoPix && (
          <PixPagadorConfirmacao
            visivel
            titularNome={cliente.nome}
            state={pixPagador}
            onChange={setPixPagador}
            idPrefix="carteirinha-pix"
          />
        )}

        {erro && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleConfirmar()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              'Confirmar solicitação'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
