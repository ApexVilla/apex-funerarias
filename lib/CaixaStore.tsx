import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { formatCentavos } from './FinanceiroStore';
import {
    calcularSistemaPorFormaFechamento,
    movimentoImpactaSaldoFisicoCaixa,
    normalizarFormaPagamento,
} from './caixaFormaPagamento';
import { usuarioEhGestorFinanceiro } from './contaBancariaPermissoes';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { dataHojeIsoLocal, normalizarDataIso } from './contratoDatas';
import { garantirCaixaAbertoParaData as garantirCaixaAbertoParaDataFn } from './finCaixaAutoAbertura';

const notificarCaixaAtualizado = () => {
    window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
};

// ==================== TYPES ====================
export interface CaixaSessao {
    id: string;
    empresa_id: string;
    conta_bancaria_id: string;
    usuario_abertura_id: string;
    usuario_fechamento_id?: string;
    saldo_abertura_centavos: number;
    saldo_sistema_centavos: number;
    saldo_informado_centavos?: number;
    diferenca_centavos?: number;
    status: 'aberto' | 'fechado' | 'cancelado';
    data_abertura: string;
    data_fechamento?: string;
    observacoes_abertura?: string;
    observacoes_fechamento?: string;
    created_at: string;
}

export interface CaixaMovimento {
    id: string;
    empresa_id: string;
    sessao_id: string;
    tipo: 'entrada' | 'saida' | 'sangria' | 'suprimento';
    descricao: string;
    valor_centavos: number;
    forma_pagamento?: string;
    referencia_id?: string;
    referencia_tipo?: string;
    /** Dia de referência da baixa (Tesouraria filtra por este campo). */
    data_movimentacao?: string;
    created_at: string;
    usuario_id?: string | null;
    usuario_nome?: string;
    /** Conferido manualmente na Tesouraria (extrato/comprovante). */
    conciliado?: boolean;
    conciliado_em?: string | null;
    conciliado_por?: string | null;
    conciliado_por_nome?: string;
}

// ==================== CONTEXT ====================
interface CaixaContextValue {
    loading: boolean;
    error: string | null;
    sessaoAtual: CaixaSessao | null;
    movimentos: CaixaMovimento[];
    sessoes: CaixaSessao[];
    loadSessaoAtual: (contaBancariaId: string) => Promise<void>;
    loadMovimentos: (sessaoId: string, dataRefIso?: string) => Promise<void>;
    loadSessoes: (contaBancariaId?: string) => Promise<void>;
    abrirCaixa: (contaBancariaId: string, saldoAberturaCentavos?: number, obs?: string, dataReferencia?: string) => Promise<boolean>;
    fecharCaixa: (sessaoId: string, saldoInformadoCentavos: number, obs?: string) => Promise<boolean>;
    registrarSangria: (sessaoId: string, valorCentavos: number, descricao: string, contaDestinoId: string) => Promise<string | null>;
    registrarSuprimento: (sessaoId: string, valorCentavos: number, descricao: string, contaOrigemId: string) => Promise<string | null>;
    registrarEntrada: (sessaoId: string, valorCentavos: number, descricao: string, formaPagamento?: string) => Promise<boolean>;
    registrarSaida: (sessaoId: string, valorCentavos: number, descricao: string, formaPagamento?: string) => Promise<boolean>;
    verificarStatusCaixa: (contaId: string) => Promise<string | null>;
    garantirCaixaAbertoParaData: (
        contaBancariaId: string,
        dataPagamento: string,
        observacao?: string,
    ) => Promise<string | null>;
    totaisDia: { entradas: number; saidas: number; sangrias: number; suprimentos: number };
}

const CaixaContext = createContext<CaixaContextValue | null>(null);

export function useCaixa() {
    const ctx = useContext(CaixaContext);
    if (!ctx) throw new Error('useCaixa deve ser usado dentro de CaixaProvider');
    return ctx;
}

// ==================== PROVIDER ====================
export const CaixaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { empresaIdEfetivo, dataRevisionEmpresa } = useEmpresaContextoAtivo();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [sessaoAtual, setSessaoAtual] = useState<CaixaSessao | null>(null);
    const [movimentos, setMovimentos] = useState<CaixaMovimento[]>([]);
    const [sessoes, setSessoes] = useState<CaixaSessao[]>([]);
    const [totaisDia, setTotaisDia] = useState({ entradas: 0, saidas: 0, sangrias: 0, suprimentos: 0 });

    const handleError = (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(message);
        console.error('[Caixa]', message);
    };

    const yyyyMmDd = (iso: string | null | undefined) => String(iso || '').slice(0, 10);

    const getSessionContext = useCallback(async () => {
        const localUser = (() => {
            try { return JSON.parse(sessionStorage.getItem('user') || '{}'); } catch { return {}; }
        })();
        const empresaDoContexto = (empresaIdEfetivo || '').trim();
        const localEmpresaId =
            empresaDoContexto ||
            localUser?.empresa_id ||
            sessionStorage.getItem('empresa_id') ||
            '';
        const localUserId = localUser?.id || sessionStorage.getItem('userId') || '';

        if (localEmpresaId && localUserId) return { empresaId: localEmpresaId, userId: localUserId };

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || localUserId;
        if (!userId) return { empresaId: '', userId: '' };

        const { data } = await supabase
            .from('users')
            .select('id, empresa_id')
            .eq('id', userId)
            .single();

        const empresaId = data?.empresa_id || localEmpresaId;

        if (empresaId) sessionStorage.setItem('empresa_id', empresaId);
        if (userId) sessionStorage.setItem('userId', userId);
        if (empresaId || userId) {
            try {
                sessionStorage.setItem('user', JSON.stringify({ ...localUser, id: userId, empresa_id: empresaId }));
            } catch { }
        }

        return { empresaId, userId };
    }, [empresaIdEfetivo, dataRevisionEmpresa]);

    const syncBaixasParaSessao = useCallback(async (sessaoId: string) => {
        try {
            await supabase.rpc('fin_sync_baixas_caixa_sessao', { p_sessao_id: sessaoId });
        } catch {
            // sync é best-effort; não bloqueia fluxo do caixa
        }
    }, []);

    const resolveEmpresaIdForConta = useCallback(async (contaBancariaId: string): Promise<string> => {
        if (contaBancariaId) {
            const { data: conta } = await supabase
                .from('fin_contas_bancarias')
                .select('empresa_id')
                .eq('id', contaBancariaId)
                .maybeSingle();
            if (conta?.empresa_id) return conta.empresa_id;
        }
        const { empresaId } = await getSessionContext();
        return empresaId;
    }, [getSessionContext]);

    const userPodeTransferirConta = useCallback(async (contaId: string): Promise<boolean> => {
        const { userId } = await getSessionContext();
        if (!userId) return false;

        const { data: userRow } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

        if (usuarioEhGestorFinanceiro(userRow?.role)) return true;

        const { data: conta } = await supabase
            .from('fin_contas_bancarias')
            .select('autorizados_transferencia')
            .eq('id', contaId)
            .maybeSingle();

        const allowed = (conta?.autorizados_transferencia || []) as string[];
        return allowed.length === 0 || allowed.includes(userId);
    }, [getSessionContext]);

    // Load current open session for a bank account
    const loadSessaoAtual = useCallback(async (contaBancariaId: string) => {
        setLoading(true);
        setError(null);
        try {
            const empresaId = await resolveEmpresaIdForConta(contaBancariaId);
            if (!empresaId) throw new Error('Empresa não identificada para carregar sessão de caixa.');
            const { data, error: queryError } = await supabase
                .from('fin_caixa_sessoes')
                .select('*')
                .eq('conta_bancaria_id', contaBancariaId)
                .eq('status', 'aberto')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (queryError) throw queryError;
            setSessaoAtual(data as CaixaSessao | null);

            if (data) {
                await syncBaixasParaSessao(data.id);
                await loadMovimentos(data.id);
            } else {
                setMovimentos([]);
                setTotaisDia({ entradas: 0, saidas: 0, sangrias: 0, suprimentos: 0 });
            }
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [resolveEmpresaIdForConta, syncBaixasParaSessao]);

    // Load movements for a session
    const loadMovimentos = useCallback(async (sessaoId: string, dataRefIso?: string) => {
        try {
            const { data, error: queryError } = await supabase
                .from('fin_caixa_movimentos')
                .select('*')
                .eq('sessao_id', sessaoId)
                .order('created_at', { ascending: false });

            if (queryError) throw queryError;
            const baseMovs = (data ?? []) as CaixaMovimento[];

            // Enriquece com nome do usuário responsável (lookup em paralelo)
            const userIds = Array.from(new Set(
                baseMovs.map(m => m.usuario_id).filter(Boolean)
            )) as string[];
            const userMap = new Map<string, string>();
            if (userIds.length > 0) {
                const { data: users } = await supabase
                    .from('users')
                    .select('id, nome')
                    .in('id', userIds);
                (users ?? []).forEach((u: any) => userMap.set(u.id, u.nome));
            }

            const movs: CaixaMovimento[] = baseMovs.map(m => ({
                ...m,
                usuario_nome: m.usuario_id ? userMap.get(m.usuario_id) || m.usuario_nome : m.usuario_nome,
            }));
            setMovimentos(movs);

            // Calculate daily totals
            const totals = movs.reduce((acc, m) => {
                const impactaSaldo = movimentoImpactaSaldoFisicoCaixa(m);
                switch (m.tipo) {
                    case 'entrada': if (impactaSaldo) acc.entradas += m.valor_centavos; break;
                    case 'saida': if (impactaSaldo) acc.saidas += m.valor_centavos; break;
                    case 'sangria': acc.sangrias += m.valor_centavos; break;
                    case 'suprimento': acc.suprimentos += m.valor_centavos; break;
                }
                return acc;
            }, { entradas: 0, saidas: 0, sangrias: 0, suprimentos: 0 });

            setTotaisDia(totals);
        } catch (err) {
            handleError(err);
        }
    }, []);

    const validarSessaoDoDia = useCallback(async (sessaoId: string): Promise<void> => {
        const { data: sessao, error } = await supabase
            .from('fin_caixa_sessoes')
            .select('status, data_abertura')
            .eq('id', sessaoId)
            .maybeSingle();
        if (error) throw error;
        if (!sessao) throw new Error('Sessão de caixa não encontrada.');
        if (sessao.status !== 'aberto') {
            throw new Error('O dia está encerrado nesta conta.');
        }
    }, []);

    const resolverContaBancariaDaSessao = useCallback(async (sessaoId: string): Promise<string> => {
        const { data, error } = await supabase
            .from('fin_caixa_sessoes')
            .select('conta_bancaria_id')
            .eq('id', sessaoId)
            .maybeSingle();
        if (error) throw error;
        const contaId = data?.conta_bancaria_id ? String(data.conta_bancaria_id) : '';
        if (!contaId) throw new Error('Sessão de caixa inválida para transferência.');
        return contaId;
    }, []);

    // Load session history
    const loadSessoes = useCallback(async (contaBancariaId?: string) => {
        setLoading(true);
        setError(null);
        try {
            const empresaId = contaBancariaId
                ? await resolveEmpresaIdForConta(contaBancariaId)
                : (await getSessionContext()).empresaId;
            if (!empresaId) throw new Error('Empresa não identificada para carregar sessões de caixa.');
            let query = supabase
                .from('fin_caixa_sessoes')
                .select('*')
                .eq('empresa_id', empresaId)
                .order('created_at', { ascending: false })
                .limit(30);

            if (contaBancariaId) query = query.eq('conta_bancaria_id', contaBancariaId);

            const { data, error: queryError } = await query;
            if (queryError) throw queryError;
            setSessoes((data ?? []) as CaixaSessao[]);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [getSessionContext, resolveEmpresaIdForConta]);

    // Open cash register
    const abrirCaixa = useCallback(async (contaBancariaId: string, saldoAberturaCentavos?: number, obs?: string, dataReferencia?: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { userId } = await getSessionContext();
            const empresaId = await resolveEmpresaIdForConta(contaBancariaId);
            if (!empresaId) throw new Error('Empresa não identificada para abrir caixa.');
            const diaAlvo = dataReferencia
                ? (normalizarDataIso(dataReferencia) || dataReferencia.slice(0, 10))
                : dataHojeIsoLocal();

            const { data: contaConfig } = await supabase
                .from('fin_contas_bancarias')
                .select('permite_abertura_com_outro_caixa_aberto')
                .eq('id', contaBancariaId)
                .maybeSingle();

            const permiteAbrirComOutroAberto = contaConfig?.permite_abertura_com_outro_caixa_aberto !== false;
            if (!permiteAbrirComOutroAberto) {
                const { data: outraSessaoAberta } = await supabase
                    .from('fin_caixa_sessoes')
                    .select('id')
                    .eq('empresa_id', empresaId)
                    .eq('status', 'aberto')
                    .neq('conta_bancaria_id', contaBancariaId)
                    .limit(1)
                    .maybeSingle();

                if (outraSessaoAberta) {
                    throw new Error('Esta conta não permite abrir novo caixa com outra sessão em aberto na empresa.');
                }
            }

            const { data: sessoesRecentes } = await supabase
                .from('fin_caixa_sessoes')
                .select('id, status, data_abertura')
                .eq('conta_bancaria_id', contaBancariaId)
                .order('data_abertura', { ascending: false })
                .limit(60);

            const sessaoDoDia = (sessoesRecentes ?? []).find(
                (s) => normalizarDataIso(s.data_abertura) === diaAlvo,
            );

            if (sessaoDoDia?.status === 'aberto') {
                await loadSessaoAtual(contaBancariaId);
                notificarCaixaAtualizado();
                return true;
            }

            if (sessaoDoDia?.status === 'fechado') {
                const { data: outraAbertaMesmaConta } = await supabase
                    .from('fin_caixa_sessoes')
                    .select('id, data_abertura')
                    .eq('empresa_id', empresaId)
                    .eq('conta_bancaria_id', contaBancariaId)
                    .eq('status', 'aberto')
                    .limit(1)
                    .maybeSingle();

                if (outraAbertaMesmaConta) {
                    const dataOutra = outraAbertaMesmaConta.data_abertura
                        ? new Date(outraAbertaMesmaConta.data_abertura).toLocaleDateString('pt-BR')
                        : 'outro dia';
                    throw new Error(
                        `Já existe outro dia aberto nesta conta (${dataOutra}). Feche-o antes de reabrir este dia.`,
                    );
                }

                const { data: reaberta, error: reopenErr } = await supabase
                    .from('fin_caixa_sessoes')
                    .update({
                        status: 'aberto',
                        data_fechamento: null,
                        usuario_fechamento_id: null,
                        observacoes_fechamento: null,
                        saldo_informado_centavos: null,
                        diferenca_centavos: null,
                    })
                    .eq('id', sessaoDoDia.id)
                    .select()
                    .single();

                if (reopenErr) throw reopenErr;

                const { data: saldoRecalc } = await supabase.rpc('fin_caixa_saldo_fisico_sessao', {
                    p_sessao_id: sessaoDoDia.id,
                });
                if (saldoRecalc != null) {
                    await supabase
                        .from('fin_caixa_sessoes')
                        .update({ saldo_sistema_centavos: saldoRecalc })
                        .eq('id', sessaoDoDia.id);
                    reaberta.saldo_sistema_centavos = saldoRecalc;
                }

                await loadSessaoAtual(contaBancariaId);
                notificarCaixaAtualizado();
                return true;
            }

            // Saldo inicial automático:
            // 1) último fechamento da própria conta (saldo final sistêmico da sessão)
            // 2) saldo atual da conta bancária
            // 3) valor manual informado (fallback final para compatibilidade)
            let saldoAberturaCalculado = 0;

            const { data: ultimaSessaoAberta } = await supabase
                .from('fin_caixa_sessoes')
                .select('saldo_sistema_centavos, saldo_informado_centavos')
                .eq('conta_bancaria_id', contaBancariaId)
                .eq('status', 'aberto')
                .order('data_abertura', { ascending: false })
                .limit(1)
                .maybeSingle();

            const { data: ultimaSessaoFechada } = await supabase
                .from('fin_caixa_sessoes')
                .select('id, saldo_sistema_centavos')
                .eq('empresa_id', empresaId)
                .eq('conta_bancaria_id', contaBancariaId)
                .eq('status', 'fechado')
                .order('data_fechamento', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (ultimaSessaoAberta?.saldo_sistema_centavos != null) {
                saldoAberturaCalculado = Number(ultimaSessaoAberta.saldo_sistema_centavos);
            } else if (ultimaSessaoFechada?.id) {
                const { data: saldoFisicoFechada } = await supabase.rpc('fin_caixa_saldo_fisico_sessao', {
                    p_sessao_id: ultimaSessaoFechada.id,
                });
                if (saldoFisicoFechada != null) {
                    saldoAberturaCalculado = Number(saldoFisicoFechada);
                } else if (ultimaSessaoFechada.saldo_sistema_centavos != null) {
                    saldoAberturaCalculado = Number(ultimaSessaoFechada.saldo_sistema_centavos);
                }
            } else {
                const { data: contaAtual } = await supabase
                    .from('fin_contas_bancarias')
                    .select('saldo_atual_centavos')
                    .eq('id', contaBancariaId)
                    .maybeSingle();

                if (contaAtual?.saldo_atual_centavos != null) {
                    saldoAberturaCalculado = Number(contaAtual.saldo_atual_centavos);
                } else {
                    saldoAberturaCalculado = Number(saldoAberturaCentavos || 0);
                }
            }

            const dataAberturaIso = dataReferencia
                ? `${diaAlvo}T12:00:00`
                : new Date().toISOString();

            const { data: sessoesAbertasAntigas } = await supabase
                .from('fin_caixa_sessoes')
                .select('id, data_abertura')
                .eq('conta_bancaria_id', contaBancariaId)
                .eq('status', 'aberto');

            const abertas = sessoesAbertasAntigas ?? [];

            if (abertas.some((s) => normalizarDataIso(s.data_abertura) === diaAlvo)) {
                await loadSessaoAtual(contaBancariaId);
                notificarCaixaAtualizado();
                return true;
            }

            const outroDiaAberto = abertas.find(
                (s) => normalizarDataIso(s.data_abertura) !== diaAlvo,
            );
            if (outroDiaAberto) {
                const diaAntigo = normalizarDataIso(outroDiaAberto.data_abertura);
                throw new Error(
                    `Já existe um dia aberto nesta conta (${diaAntigo}). Feche-o na Tesouraria antes de abrir ${diaAlvo}.`,
                );
            }

            const saldoAberturaInicial = saldoAberturaCalculado;

            const { data: novaSessao, error: insertError } = await supabase
                .from('fin_caixa_sessoes')
                .insert({
                    empresa_id: empresaId,
                    conta_bancaria_id: contaBancariaId,
                    usuario_abertura_id: userId || null,
                    saldo_abertura_centavos: saldoAberturaInicial,
                    saldo_sistema_centavos: saldoAberturaInicial,
                    status: 'aberto',
                    data_abertura: dataAberturaIso,
                    observacoes_abertura: obs || null,
                })
                .select('id')
                .single();

            if (insertError) throw insertError;

            await loadSessaoAtual(contaBancariaId);
            notificarCaixaAtualizado();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [getSessionContext, resolveEmpresaIdForConta, loadSessaoAtual]);

    // Close cash register (qualquer sessão aberta pelo id — não depende só de sessaoAtual)
    const fecharCaixa = useCallback(async (sessaoId: string, saldoInformadoCentavos: number, obs?: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { userId } = await getSessionContext();

            const { data: sessao, error: sessaoErr } = await supabase
                .from('fin_caixa_sessoes')
                .select('*')
                .eq('id', sessaoId)
                .maybeSingle();

            if (sessaoErr) throw sessaoErr;
            if (!sessao) throw new Error('Sessão de caixa não encontrada.');
            if (sessao.status !== 'aberto') {
                throw new Error('Esta sessão já está fechada.');
            }

            const contaBancariaId = sessao.conta_bancaria_id as string;

            const { data: contaConfig } = await supabase
                .from('fin_contas_bancarias')
                .select('permite_fechar_com_saldo_em_caixa, permite_saldo_negativo')
                .eq('id', contaBancariaId)
                .maybeSingle();

            const permiteFecharComSaldo = contaConfig?.permite_fechar_com_saldo_em_caixa !== false;
            const permiteSaldoNegativo = !!contaConfig?.permite_saldo_negativo;

            if (!permiteFecharComSaldo && saldoInformadoCentavos > 0) {
                throw new Error('Esta conta não permite fechamento com saldo em caixa. Informe saldo zerado para fechar.');
            }
            if (!permiteSaldoNegativo && saldoInformadoCentavos < 0) {
                throw new Error('Esta conta não permite saldo negativo.');
            }

            const { data: movs, error: movErr } = await supabase
                .from('fin_caixa_movimentos')
                .select('tipo, valor_centavos, forma_pagamento')
                .eq('sessao_id', sessaoId);

            if (movErr) throw movErr;

            const sistemaPorForma = calcularSistemaPorFormaFechamento(
                sessao.saldo_abertura_centavos,
                (movs ?? []) as CaixaMovimento[],
            );
            const saldoSistema = sistemaPorForma.especie;

            const { error: updateError } = await supabase
                .from('fin_caixa_sessoes')
                .update({
                    status: 'fechado',
                    saldo_sistema_centavos: saldoSistema,
                    saldo_informado_centavos: saldoInformadoCentavos,
                    diferenca_centavos: saldoInformadoCentavos - saldoSistema,
                    data_fechamento: new Date().toISOString(),
                    usuario_fechamento_id: userId || null,
                    observacoes_fechamento: obs || null,
                })
                .eq('id', sessaoId)
                .eq('status', 'aberto');

            if (updateError) throw updateError;

            if (sessaoAtual?.id === sessaoId) {
                setSessaoAtual(null);
                setMovimentos([]);
                setTotaisDia({ entradas: 0, saidas: 0, sangrias: 0, suprimentos: 0 });
            }

            try {
                window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
            } catch { /* ignore */ }

            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [sessaoAtual?.id, getSessionContext]);

    // Register sangria (cash withdrawal)
    const registrarSangria = useCallback(async (sessaoId: string, valorCentavos: number, descricao: string, contaDestinoId: string): Promise<string | null> => {
        setLoading(true);
        setError(null);
        try {
            await validarSessaoDoDia(sessaoId);
            const contaSessaoId = await resolverContaBancariaDaSessao(sessaoId);
            if (contaSessaoId === contaDestinoId) {
                throw new Error('Selecione uma conta de destino diferente da conta de origem.');
            }

            const podeTransferirOrigem = await userPodeTransferirConta(contaSessaoId);
            const podeTransferirDestino = await userPodeTransferirConta(contaDestinoId);
            if (!podeTransferirOrigem || !podeTransferirDestino) {
                throw new Error('Você não possui autorização para transferir entre as contas selecionadas.');
            }

            const { userId } = await getSessionContext();
            const { error: rpcError } = await supabase.rpc('fin_realizar_sangria', {
                p_sessao_id: sessaoId,
                p_conta_destino_id: contaDestinoId,
                p_valor_centavos: valorCentavos,
                p_descricao: descricao?.trim() || 'Sangria de caixa',
                p_usuario_id: userId || null,
            });

            if (rpcError) throw rpcError;
            await loadMovimentos(sessaoId, new Date().toISOString().slice(0, 10));
            try {
                window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
            } catch { /* ignore */ }
            return null;
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : typeof err === 'object' && err !== null && 'message' in err
                      ? String((err as { message: unknown }).message)
                      : 'Erro ao registrar sangria.';
            handleError(err);
            return message;
        } finally {
            setLoading(false);
        }
    }, [loadMovimentos, resolverContaBancariaDaSessao, userPodeTransferirConta, validarSessaoDoDia]);

    // Register suprimento (cash deposit)
    const registrarSuprimento = useCallback(async (sessaoId: string, valorCentavos: number, descricao: string, contaOrigemId: string): Promise<string | null> => {
        setLoading(true);
        setError(null);
        try {
            await validarSessaoDoDia(sessaoId);
            const contaSessaoId = await resolverContaBancariaDaSessao(sessaoId);
            if (contaSessaoId === contaOrigemId) {
                throw new Error('Selecione uma conta de origem diferente da conta de destino.');
            }

            const podeTransferirOrigem = await userPodeTransferirConta(contaOrigemId);
            const podeTransferirDestino = await userPodeTransferirConta(contaSessaoId);
            if (!podeTransferirOrigem || !podeTransferirDestino) {
                throw new Error('Você não possui autorização para transferir entre as contas selecionadas.');
            }

            const { userId } = await getSessionContext();
            const { error: rpcError } = await supabase.rpc('fin_realizar_suprimento', {
                p_sessao_id: sessaoId,
                p_conta_origem_id: contaOrigemId,
                p_valor_centavos: valorCentavos,
                p_descricao: descricao?.trim() || 'Suprimento de caixa',
                p_usuario_id: userId || null,
            });

            if (rpcError) throw rpcError;
            await loadMovimentos(sessaoId, new Date().toISOString().slice(0, 10));
            try {
                window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
            } catch { /* ignore */ }
            return null;
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : typeof err === 'object' && err !== null && 'message' in err
                      ? String((err as { message: unknown }).message)
                      : 'Erro ao registrar suprimento.';
            handleError(err);
            return message;
        } finally {
            setLoading(false);
        }
    }, [loadMovimentos, resolverContaBancariaDaSessao, userPodeTransferirConta, validarSessaoDoDia]);

    const registrarEntrada = useCallback(async (sessaoId: string, valorCentavos: number, descricao: string, formaPagamento?: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            await validarSessaoDoDia(sessaoId);
            if (valorCentavos <= 0) throw new Error('Valor de entrada inválido.');
            const { empresaId, userId } = await getSessionContext();
            if (!empresaId) throw new Error('Empresa não identificada.');

            const formaGravar = normalizarFormaPagamento(formaPagamento) || 'especie';
            const { error: insertError } = await supabase
                .from('fin_caixa_movimentos')
                .insert({
                    empresa_id: empresaId,
                    sessao_id: sessaoId,
                    tipo: 'entrada',
                    descricao: descricao || 'Entrada manual',
                    valor_centavos: valorCentavos,
                    forma_pagamento: formaGravar,
                    usuario_id: userId || null,
                    data_movimentacao: new Date().toISOString().slice(0, 10),
                });

            if (insertError) throw insertError;
            await loadMovimentos(sessaoId, new Date().toISOString().slice(0, 10));
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [getSessionContext, loadMovimentos, validarSessaoDoDia]);

    const registrarSaida = useCallback(async (sessaoId: string, valorCentavos: number, descricao: string, formaPagamento?: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            await validarSessaoDoDia(sessaoId);
            if (valorCentavos <= 0) throw new Error('Valor de saída inválido.');
            const { empresaId, userId } = await getSessionContext();
            if (!empresaId) throw new Error('Empresa não identificada.');

            const formaGravar = normalizarFormaPagamento(formaPagamento) || 'especie';
            const { error: insertError } = await supabase
                .from('fin_caixa_movimentos')
                .insert({
                    empresa_id: empresaId,
                    sessao_id: sessaoId,
                    tipo: 'saida',
                    descricao: descricao || 'Saída manual',
                    valor_centavos: valorCentavos,
                    forma_pagamento: formaGravar,
                    usuario_id: userId || null,
                    data_movimentacao: new Date().toISOString().slice(0, 10),
                });

            if (insertError) throw insertError;
            await loadMovimentos(sessaoId, new Date().toISOString().slice(0, 10));
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [getSessionContext, loadMovimentos, validarSessaoDoDia]);

    // Check if a caixa account has an open session
    const verificarStatusCaixa = useCallback(async (contaId: string): Promise<string | null> => {
        try {
            const { data, error: rpcError } = await supabase.rpc('fin_verificar_status_caixa', {
                p_conta_id: contaId
            });
            if (rpcError) throw rpcError;
            return data as string | null; // Returns session ID if open, null otherwise
        } catch (err) {
            console.error('Error checking caixa status:', err);
            return null;
        }
    }, []);

    const garantirCaixaAbertoParaData = useCallback(
        async (contaBancariaId: string, dataPagamento: string, observacao?: string): Promise<string | null> => {
            const { userId } = await getSessionContext();
            return garantirCaixaAbertoParaDataFn({
                contaBancariaId,
                dataPagamento,
                observacao,
                usuarioId: userId || null,
            });
        },
        [],
    );

    const value: CaixaContextValue = {
        loading, error,
        sessaoAtual, movimentos, sessoes, totaisDia,
        loadSessaoAtual, loadMovimentos, loadSessoes,
        abrirCaixa, fecharCaixa, registrarSangria, registrarSuprimento, registrarEntrada, registrarSaida, verificarStatusCaixa,
        garantirCaixaAbertoParaData,
    };

    return (
        <CaixaContext.Provider value={value}>
            {children}
        </CaixaContext.Provider>
    );
};

export { formatCentavos };
