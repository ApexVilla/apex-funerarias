import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DollarSign, Save, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';
import {
  carregarCobrancasPendentes,
  registrarRecebimentoCampo,
  type CobrancaPendenteDto,
} from '../../lib/cobrancaPendentesSupabase';
import {
  atualizarRecebimentoCampo,
  buscarRecebimentoCampo,
  listarCobradoresSelect,
} from '../../lib/cobRecebimentosSupabase';
import {
  normalizarFormaPagamentoCobradorCampo,
  type FormaPagamentoCobradorCampo,
} from '../../lib/cobradorFormaPagamento';
import { mensagemErroSupabase } from '../../lib/supabaseErrorMessage';
import { supabase } from '../../lib/supabase';

interface RecebimentoFormData {
  conta_receber_id?: string;
  cobranca_pendente_id?: string;
  cliente_id: string;
  cobrador_id: string;
  data: string;
  valor: number;
  forma_pagamento: FormaPagamentoCobradorCampo;
  status: 'confirmado' | 'pendente_conferencia';
  observacao: string;
}

const initialData: RecebimentoFormData = {
  conta_receber_id: '',
  cobranca_pendente_id: '',
  cliente_id: '',
  cobrador_id: '',
  data: new Date().toISOString().slice(0, 10),
  valor: 0,
  forma_pagamento: 'dinheiro',
  status: 'pendente_conferencia',
  observacao: '',
};

export const RecebimentoForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
  const empresaId = empresaIdOperacao;
  const { showToast } = useToast();
  const [formData, setFormData] = useState<RecebimentoFormData>(initialData);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cobradores, setCobradores] = useState<{ id: string; nome: string }[]>([]);
  const [parcelas, setParcelas] = useState<CobrancaPendenteDto[]>([]);
  const [parcelaSelecionada, setParcelaSelecionada] = useState('');

  const isEditing = !!id;

  useEffect(() => {
    const loadData = async () => {
      if (empresaIdsFiltro.length === 0) return;
      setLoading(true);
      try {
        const [cobs, pends] = await Promise.all([
          listarCobradoresSelect(empresaIdsFiltro),
          carregarCobrancasPendentes(empresaIdsFiltro, { sincronizarTitulos: true }),
        ]);
        setCobradores(cobs);
        setParcelas(pends.filter((p) => p.status !== 'cobrado'));

        if (isEditing && id) {
          const rec = await buscarRecebimentoCampo(id, empresaIdsFiltro);
          if (rec) {
            setFormData({
              conta_receber_id: rec.conta_receber_id || '',
              cobranca_pendente_id: rec.cobranca_pendente_id || '',
              cliente_id: rec.cliente_id,
              cobrador_id: rec.cobrador_id,
              data: rec.data,
              valor: rec.valor_centavos / 100,
              forma_pagamento: normalizarFormaPagamentoCobradorCampo(rec.forma_pagamento),
              status: rec.status,
              observacao: rec.observacao || '',
            });
            if (rec.cobranca_pendente_id) setParcelaSelecionada(rec.cobranca_pendente_id);
          }
        }
      } catch (error) {
        showToast(mensagemErroSupabase(error, 'Erro ao carregar dados'), 'error');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [id, isEditing, showToast, empresaIdsFiltro.join(','), dataRevisionEmpresa]);

  useEffect(() => {
    if (isEditing) return;
    const parcelaId = searchParams.get('parcela_id');
    if (!parcelaId) return;
    setParcelaSelecionada(parcelaId);
  }, [isEditing, searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === 'valor' ? Number(value) : value }));
  };

  const parcelasDisponiveis = useMemo(
    () => parcelas.filter((p) => p.status !== 'cobrado'),
    [parcelas],
  );

  useEffect(() => {
    if (!parcelaSelecionada) return;
    const parcela = parcelasDisponiveis.find((p) => String(p.id) === parcelaSelecionada);
    if (!parcela) return;
    setFormData((prev) => ({
      ...prev,
      cobranca_pendente_id: parcela.id,
      conta_receber_id: String(parcela.conta_receber_id || ''),
      cliente_id: String(parcela.cliente_id || ''),
      cobrador_id: prev.cobrador_id || String(parcela.cobrador_id || ''),
      valor: Number(parcela.valor_centavos || 0) / 100,
    }));
  }, [parcelaSelecionada, parcelasDisponiveis]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaId) {
      showToast('Selecione a unidade no topo da tela.', 'warning');
      return;
    }
    if (!formData.cliente_id || !formData.cobrador_id) {
      showToast('Informe cliente e cobrador.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const valorCentavos = Math.round(formData.valor * 100);

      if (isEditing && id) {
        await atualizarRecebimentoCampo(id, empresaId, {
          cliente_id: formData.cliente_id,
          cobrador_id: formData.cobrador_id,
          data: formData.data,
          valor_centavos: valorCentavos,
          forma_pagamento: formData.forma_pagamento,
          status: formData.status,
          observacao: formData.observacao,
        });
        showToast('Recebimento atualizado com sucesso!', 'success');
      } else if (formData.cobranca_pendente_id) {
        await registrarRecebimentoCampo({
          empresa_id: empresaId,
          cobranca_pendente_id: formData.cobranca_pendente_id,
          conta_receber_id: formData.conta_receber_id,
          cliente_id: formData.cliente_id,
          cobrador_id: formData.cobrador_id,
          valor_centavos: valorCentavos,
          forma_pagamento: formData.forma_pagamento,
          observacao: formData.observacao,
          created_by: user?.id || null,
        });
        showToast('Recebimento registrado e parcela baixada.', 'success');
      } else {
        const { error } = await supabase.from('cob_recebimentos_campo').insert({
          empresa_id: empresaId,
          cliente_id: formData.cliente_id,
          cobrador_id: formData.cobrador_id,
          data: formData.data,
          valor_centavos: valorCentavos,
          forma_pagamento: formData.forma_pagamento,
          status: formData.status,
          observacao: formData.observacao.trim() || null,
          created_by: user?.id || null,
        });
        if (error) throw error;
        showToast('Recebimento registrado com sucesso!', 'success');
      }
      navigate('/cobradores/recebimentos');
    } catch (error) {
      showToast(mensagemErroSupabase(error, 'Erro ao salvar recebimento'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <PageHeader
        title={isEditing ? 'Detalhes do Recebimento' : 'Novo Recebimento'}
        subtitle="Registro de valores recebidos por cobradores em campo"
        actionButton={
          <Button variant="outline" size="sm" onClick={() => navigate('/cobradores/recebimentos')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2 border-b pb-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Dados do Recebimento</h3>
          </div>

          {loading && (
            <p className="text-sm text-gray-500">Carregando...</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Parcela para Receber"
              value={parcelaSelecionada}
              onChange={(e) => setParcelaSelecionada(e.target.value)}
              disabled={isEditing}
            >
              <option value="">Recebimento avulso</option>
              {parcelasDisponiveis.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {p.cliente_nome || 'Cliente'} - {p.parcela_codigo || 'Parcela'} - R${' '}
                  {(Number(p.valor_centavos || 0) / 100).toFixed(2)}
                </option>
              ))}
            </Select>
            <Input
              label="Cliente (ID) *"
              name="cliente_id"
              value={formData.cliente_id}
              onChange={handleChange}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Cobrador *" name="cobrador_id" value={formData.cobrador_id} onChange={handleChange} required>
              <option value="">Selecione o cobrador</option>
              {cobradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Input
              label="Data do Recebimento *"
              name="data"
              type="date"
              value={formData.data}
              onChange={handleChange}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Valor (R$) *"
              name="valor"
              type="number"
              step="0.01"
              value={formData.valor}
              onChange={handleChange}
              required
            />
            <Select
              label="Forma de Pagamento *"
              name="forma_pagamento"
              value={formData.forma_pagamento}
              onChange={handleChange}
              required
            >
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <optgroup label="Cartão (maquininha)">
                <option value="cartao_credito">Cartão de crédito</option>
                <option value="cartao_debito">Cartão de débito</option>
              </optgroup>
            </Select>
          </div>

          <Select label="Status da Conferência *" name="status" value={formData.status} onChange={handleChange} required>
            <option value="pendente_conferencia">Pendente de Conferência</option>
            <option value="confirmado">Confirmado / Conferido</option>
          </Select>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              name="observacao"
              value={formData.observacao}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[100px]"
              placeholder="Alguma observação relevante sobre o recebimento..."
            />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => navigate('/cobradores/recebimentos')}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {isEditing ? 'Salvar Alterações' : 'Registrar Recebimento'}
          </Button>
        </div>
      </form>
    </div>
  );
};
