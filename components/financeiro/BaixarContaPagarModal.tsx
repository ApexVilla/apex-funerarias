import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, RefreshCw, AlertTriangle, Printer, CheckCircle2 } from 'lucide-react';
import { Button, Input, Select, Label } from '../../components/ui/Components';
import { useFinanceiro, ContaPagar, formatCentavos } from '../../lib/FinanceiroStore';
import { useAuth } from '../../lib/AuthContext';
import { dataHojeIsoLocal } from '../../lib/contratoDatas';
import { contaExigeSessaoCaixa, ensureContasDestinoBaixa } from '../../lib/finCaixaAutoAbertura';
import { imprimirReciboContaPagar } from '../../lib/ReciboService';

interface BaixarContaPagarModalProps {
    conta: ContaPagar;
    onClose: () => void;
    onSuccess: () => void;
}

export const BaixarContaPagarModal: React.FC<BaixarContaPagarModalProps> = ({ conta, onClose, onSuccess }) => {
    const { baixarContaPagar, contasBancarias, formasPagamento, loadContasBancarias, loadFormasPagamento } = useFinanceiro();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        valor_pago_centavos: conta.valor_aberto_centavos,
        data_pagamento: dataHojeIsoLocal(),
        conta_bancaria_id: '',
        forma_pagamento_id: '',
        valor_desconto_centavos: 0,
        valor_juros_centavos: 0,
        valor_multa_centavos: 0,
        observacoes: ''
    });

    const [valorInput, setValorInput] = useState((conta.valor_aberto_centavos / 100).toFixed(2));
    const [descontoInput, setDescontoInput] = useState('0.00');
    const [jurosInput, setJurosInput] = useState('0.00');
    const [multaInput, setMultaInput] = useState('0.00');

    const selectedForma = formasPagamento.find((fp) => fp.id === formData.forma_pagamento_id);
    const selectedConta = contasBancarias.find((c) => c.id === formData.conta_bancaria_id);

    useEffect(() => {
        loadContasBancarias();
        loadFormasPagamento();
    }, [loadContasBancarias, loadFormasPagamento]);

    const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const centavos = parseInt(rawValue) || 0;
        setValorInput((centavos / 100).toFixed(2));
        setFormData(prev => ({ ...prev, valor_pago_centavos: centavos }));
    };

    const handleDescontoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const centavos = parseInt(rawValue) || 0;
        setDescontoInput((centavos / 100).toFixed(2));
        setFormData(prev => ({ ...prev, valor_desconto_centavos: centavos }));
    };

    const handleJurosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const centavos = parseInt(rawValue) || 0;
        setJurosInput((centavos / 100).toFixed(2));
        setFormData(prev => ({ ...prev, valor_juros_centavos: centavos }));
    };

    const handleMultaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const centavos = parseInt(rawValue) || 0;
        setMultaInput((centavos / 100).toFixed(2));
        setFormData(prev => ({ ...prev, valor_multa_centavos: centavos }));
    };

    const prepararSessaoCaixaSeNecessario = async (): Promise<{ ok: true } | { ok: false; errorMsg: string }> => {
        const contaSelecionada = contasBancarias.find((c) => c.id === formData.conta_bancaria_id);
        if (!contaSelecionada || !contaExigeSessaoCaixa(contaSelecionada.tipo)) {
            return { ok: true };
        }

        return ensureContasDestinoBaixa({
            contas: [{ id: contaSelecionada.id, nome: contaSelecionada.nome, tipo: contaSelecionada.tipo }],
            dataPagamento: formData.data_pagamento,
            usuarioId: user?.id,
            observacaoPrefixo: `Sessão retroativa — baixa conta a pagar (${conta.codigo})`,
        });
    };

    const executarBaixa = async () => {
        setLoading(true);
        setError(null);
        try {
            await baixarContaPagar({
                conta_pagar_id: conta.id,
                valor_pago_centavos: formData.valor_pago_centavos,
                conta_bancaria_id: formData.conta_bancaria_id,
                forma_pagamento_id: formData.forma_pagamento_id,
                valor_desconto_centavos: formData.valor_desconto_centavos,
                valor_juros_centavos: formData.valor_juros_centavos,
                valor_multa_centavos: formData.valor_multa_centavos,
                observacoes: formData.observacoes,
                data_pagamento: formData.data_pagamento,
            });
            setSuccess(true);
        } catch (err) {
            setError('Erro ao baixar conta');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleImprimirRecibo = async () => {
        const selectedForma = formasPagamento.find(fp => fp.id === formData.forma_pagamento_id);
        const selectedConta = contasBancarias.find(cb => cb.id === formData.conta_bancaria_id);
        await imprimirReciboContaPagar({
            codigo: conta.codigo,
            descricao: conta.descricao,
            tipo_documento: conta.tipo_documento,
            fornecedor_nome: conta.fornecedor_nome,
            numero_nota_fiscal: conta.numero_nota_fiscal,
            data_vencimento: conta.data_vencimento,
            valor_pago_centavos: formData.valor_pago_centavos,
            data_pagamento: formData.data_pagamento,
            situacao: 'quitado',
            forma_pagamento: selectedForma?.nome,
            conta_bancaria: selectedConta?.nome,
        });
    };

    const handleFecharSucesso = () => {
        onSuccess();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.valor_pago_centavos || !formData.data_pagamento || !formData.conta_bancaria_id || !formData.forma_pagamento_id) {
            setError('Preencha os campos obrigatórios (Valor, Data, Conta Bancária, Forma de Pagamento)');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const caixa = await prepararSessaoCaixaSeNecessario();
            if (caixa.ok === false) {
                setError(caixa.errorMsg);
                return;
            }
            await executarBaixa();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao processar baixa');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        const quitacaoTotal = formData.valor_pago_centavos >= conta.valor_aberto_centavos;
        return (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-md shadow-2xl border border-slate-200 max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-200">
                    <div className="w-14 h-14 bg-emerald-50 rounded-md border border-emerald-200 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-4 uppercase tracking-wider">Pagamento Registrado!</h3>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-6 text-left space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">Título:</span>
                            <span className="font-mono text-slate-800 font-bold">{conta.codigo}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">Descrição:</span>
                            <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={conta.fornecedor_nome || conta.descricao}>{conta.fornecedor_nome || conta.descricao}</span>
                        </div>
                        <div className="border-t border-slate-200 my-1"></div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">Valor Pago:</span>
                            <span className="font-bold text-slate-900">{formatCentavos(formData.valor_pago_centavos)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">Via:</span>
                            <span className="font-semibold text-slate-800">{selectedForma?.nome || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">Saída:</span>
                            <span className="font-semibold text-slate-800">{selectedConta?.nome || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded uppercase self-start w-fit">
                            {quitacaoTotal ? 'Quitação Total' : 'Quitação Parcial'}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="flex-1 h-10 px-4 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md text-sm transition outline-none cursor-pointer"
                            onClick={handleFecharSucesso}
                        >
                            Fechar
                        </button>
                        <button
                            type="button"
                            className="flex-1 h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md text-sm transition flex items-center justify-center gap-2 outline-none cursor-pointer"
                            onClick={handleImprimirRecibo}
                        >
                            <Printer className="h-4 w-4" />
                            Imprimir Recibo
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-md shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0 border-l-4 border-slate-800 pl-3">
                        <div className="min-w-0">
                            <h2 className="text-base font-bold uppercase tracking-wider text-slate-900">Registrar Baixa</h2>
                            <p className="text-xs text-slate-500 mt-0.5">{conta.codigo} — {conta.descricao}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-200 rounded-md transition text-slate-500 hover:text-slate-800"
                        aria-label="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md flex items-center gap-2 text-xs font-semibold">
                                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                                {error}
                            </div>
                        )}
                        {formData.data_pagamento && formData.data_pagamento !== dataHojeIsoLocal() && (
                            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-md flex items-start gap-2 text-xs font-semibold">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                                <span>
                                    Atenção: este pagamento será lançado no caixa do dia {formData.data_pagamento.split('-').reverse().join('/')}.
                                </span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Valor a Pagar (R$) *</label>
                                <input
                                    type="text"
                                    value={valorInput}
                                    onChange={handleValorChange}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm font-semibold text-slate-900 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                    required
                                />
                                <p className="text-[10px] text-slate-500 font-semibold">
                                    Valor em aberto: {formatCentavos(conta.valor_aberto_centavos)}
                                </p>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Data do Pagamento *</label>
                                <input
                                    type="date"
                                    value={formData.data_pagamento}
                                    onChange={e => setFormData({ ...formData, data_pagamento: e.target.value })}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm font-semibold text-slate-900 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 border border-slate-200 rounded-md">
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Juros (R$)</label>
                                <input
                                    type="text"
                                    value={jurosInput}
                                    onChange={handleJurosChange}
                                    className="w-full h-9 px-2 border border-slate-200 rounded-md text-xs placeholder:text-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-100 outline-none transition bg-white"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Multa (R$)</label>
                                <input
                                    type="text"
                                    value={multaInput}
                                    onChange={handleMultaChange}
                                    className="w-full h-9 px-2 border border-slate-200 rounded-md text-xs placeholder:text-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-100 outline-none transition bg-white"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Desconto (R$)</label>
                                <input
                                    type="text"
                                    value={descontoInput}
                                    onChange={handleDescontoChange}
                                    className="w-full h-9 px-2 border border-slate-200 rounded-md text-xs placeholder:text-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-100 outline-none transition bg-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Conta Bancária (Saída) *</label>
                                <select
                                    value={formData.conta_bancaria_id}
                                    onChange={e => setFormData({ ...formData, conta_bancaria_id: e.target.value })}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md bg-white text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
                                    required
                                >
                                    <option value="">Selecione...</option>
                                    {contasBancarias
                                        .filter(c => c.ativo)
                                        .map(bank => (
                                            <option key={bank.id} value={bank.id}>
                                                {bank.nome} ({formatCentavos(bank.saldo_atual_centavos)})
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Forma de Pagamento *</label>
                                <select
                                    value={formData.forma_pagamento_id}
                                    onChange={e => setFormData({ ...formData, forma_pagamento_id: e.target.value })}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md bg-white text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
                                    required
                                >
                                    <option value="">Selecione...</option>
                                    {formasPagamento
                                        .filter(fp => fp.ativo)
                                        .map(fp => (
                                            <option key={fp.id} value={fp.id}>
                                                {fp.nome}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Observações</label>
                            <input
                                type="text"
                                value={formData.observacoes}
                                onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                                className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                placeholder="Detalhes ou observações sobre a quitação do título"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="h-10 px-4 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md text-sm transition outline-none cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md text-sm transition flex items-center gap-2 outline-none disabled:opacity-50 cursor-pointer"
                        >
                            {loading ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle className="h-4 w-4" />
                            )}
                            Confirmar Pagamento
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
