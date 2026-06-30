import type { ContaBancaria } from './FinanceiroStore';
import { resolverContaCaixaPadrao } from './finCaixaPermissoes';
import { supabase } from './supabase';

export type CobradorContaVinculo = {
    conta_bancaria_id: string;
    principal: boolean;
    nome?: string;
    tipo?: string;
};

function supabasePareceTabelaAusente(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('cobrador_contas_bancarias') && (m.includes('does not exist') || m.includes('schema cache'));
}

/** Lista vínculos cobrador ↔ caixa (com nome da conta). */
export async function carregarContasCobrador(cobradorId: string): Promise<CobradorContaVinculo[]> {
    const id = cobradorId.trim();
    if (!id) return [];

    const { data, error } = await supabase
        .from('cobrador_contas_bancarias')
        .select('conta_bancaria_id, principal, fin_contas_bancarias ( nome, tipo )')
        .eq('cobrador_id', id);

    if (error) {
        if (supabasePareceTabelaAusente(error.message)) return [];
        throw error;
    }

    return (data || []).map((row: Record<string, unknown>) => {
        const conta = row.fin_contas_bancarias as { nome?: string; tipo?: string } | null;
        return {
            conta_bancaria_id: String(row.conta_bancaria_id),
            principal: Boolean(row.principal),
            nome: conta?.nome,
            tipo: conta?.tipo,
        };
    });
}

/** Substitui vínculos e inclui o usuário do cobrador nos operadores das contas escolhidas. */
export async function salvarContasCobrador(opts: {
    cobradorId: string;
    contaIds: string[];
    contaPadraoId: string | null;
    usuarioId: string | null;
}): Promise<void> {
    const cobradorId = opts.cobradorId.trim();
    if (!cobradorId) return;

    const contaIds = [...new Set(opts.contaIds.map((x) => x.trim()).filter(Boolean))];
    const padrao =
        opts.contaPadraoId && contaIds.includes(opts.contaPadraoId.trim())
            ? opts.contaPadraoId.trim()
            : contaIds[0] || null;

    const { error: delErr } = await supabase
        .from('cobrador_contas_bancarias')
        .delete()
        .eq('cobrador_id', cobradorId);

    if (delErr && !supabasePareceTabelaAusente(delErr.message)) throw delErr;

    if (contaIds.length > 0) {
        const rows = contaIds.map((conta_bancaria_id) => ({
            cobrador_id: cobradorId,
            conta_bancaria_id,
            principal: conta_bancaria_id === padrao,
        }));
        const { error: insErr } = await supabase.from('cobrador_contas_bancarias').insert(rows);
        if (insErr && !supabasePareceTabelaAusente(insErr.message)) throw insErr;
    }

    const usuarioId = (opts.usuarioId || '').trim();
    if (!usuarioId || contaIds.length === 0) return;

    for (const contaId of contaIds) {
        const { data: conta, error } = await supabase
            .from('fin_contas_bancarias')
            .select('id, autorizados_operacao, autorizados_visualizacao')
            .eq('id', contaId)
            .maybeSingle();
        if (error || !conta) continue;

        const op = Array.isArray(conta.autorizados_operacao) ? [...conta.autorizados_operacao] : [];
        const vis = Array.isArray(conta.autorizados_visualizacao)
            ? [...conta.autorizados_visualizacao]
            : [];
        let mudou = false;
        if (!op.includes(usuarioId)) {
            op.push(usuarioId);
            mudou = true;
        }
        if (!vis.includes(usuarioId)) {
            vis.push(usuarioId);
            mudou = true;
        }
        if (!mudou) continue;

        await supabase
            .from('fin_contas_bancarias')
            .update({
                autorizados_operacao: op,
                autorizados_visualizacao: vis,
                updated_at: new Date().toISOString(),
            })
            .eq('id', contaId);
    }
}

/** Carrega contas vinculadas direto do banco (quando não aparecem na lista operável do usuário). */
export async function carregarContasBancariasVinculadas(
    vinculos: CobradorContaVinculo[],
): Promise<ContaBancaria[]> {
    const ids = [...new Set(vinculos.map((v) => v.conta_bancaria_id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('fin_contas_bancarias')
        .select('*')
        .in('id', ids)
        .eq('ativo', true);

    if (error) throw error;
    return (data || []) as ContaBancaria[];
}

/** Resolve contas de destino na baixa em campo; espelha a lista de Cobradores (vínculo direto). */
export async function resolverContasDestinoBaixaCobrador(
    contasVisiveis: ContaBancaria[],
    vinculos: CobradorContaVinculo[],
    opts?: { apenasVinculo?: boolean },
): Promise<ContaBancaria[]> {
    if (opts?.apenasVinculo && vinculos.length > 0) {
        return carregarContasBancariasVinculadas(vinculos);
    }
    const filtradas = filtrarContasDestinoCobrador(contasVisiveis, vinculos, opts);
    if (filtradas.length > 0 || vinculos.length === 0) {
        return filtradas;
    }
    return carregarContasBancariasVinculadas(vinculos);
}

/** Contas que o cobrador pode usar na baixa (interseção com as visíveis ao usuário). */
export function filtrarContasDestinoCobrador(
    contasVisiveis: ContaBancaria[],
    vinculos: CobradorContaVinculo[],
    opts?: { apenasVinculo?: boolean },
): ContaBancaria[] {
    const ativas = contasVisiveis.filter((c) => c.ativo);
    if (vinculos.length === 0) {
        return opts?.apenasVinculo ? [] : ativas;
    }
    const ids = new Set(vinculos.map((v) => v.conta_bancaria_id));
    const filtradas = ativas.filter((c) => ids.has(c.id));
    if (filtradas.length > 0) return filtradas;
    return opts?.apenasVinculo ? [] : ativas;
}

/** Cobrador em campo usa sempre o próprio cadastro; gestor usa o cobrador da parcela. */
export function resolverCobradorIdBaixaCampo(
    modoCobrador: boolean,
    meuCobradorId: string | null | undefined,
    clienteCobradorId?: string | null,
): string {
    if (modoCobrador) return (meuCobradorId || '').trim();
    const cid = (clienteCobradorId || '').trim();
    if (cid && cid !== 'sem-cobrador') return cid;
    return (meuCobradorId || '').trim();
}

/** Conta padrão na abertura do modal de baixa. */
export function resolverContaPadraoDestinoCobrador(
    contasFiltradas: ContaBancaria[],
    vinculos: CobradorContaVinculo[],
): ContaBancaria | undefined {
    if (contasFiltradas.length === 0) return undefined;

    const principalId = vinculos.find((v) => v.principal)?.conta_bancaria_id;
    if (principalId) {
        const p = contasFiltradas.find((c) => c.id === principalId);
        if (p) return p;
    }
    if (vinculos.length === 1) {
        return contasFiltradas.find((c) => c.id === vinculos[0].conta_bancaria_id);
    }

    return (
        contasFiltradas.find((c) => c.principal) ||
        contasFiltradas[0]
    );
}

/** Caixa do operador na baixa: prioriza vínculo do cobrador quando existir. */
export async function resolverCaixaOperadorParaUsuario(
    contasOperaveis: ContaBancaria[],
    userId?: string | null,
    verTodosCaixas = false,
    cobradorId?: string | null,
): Promise<ContaBancaria | null> {
    const cid = (cobradorId || '').trim();
    if (cid) {
        const vinculos = await carregarContasCobrador(cid);
        if (vinculos.length > 0) {
            const contas = await resolverContasDestinoBaixaCobrador(contasOperaveis, vinculos, {
                apenasVinculo: true,
            });
            const padrao = resolverContaPadraoDestinoCobrador(contas, vinculos);
            if (padrao && (padrao.tipo || '').toLowerCase() === 'caixa') return padrao;
            const caixaVinc = contas.find((c) => (c.tipo || '').toLowerCase() === 'caixa');
            if (caixaVinc) return caixaVinc;
            if (padrao) return padrao;
        }
    }
    return resolverContaCaixaPadrao(contasOperaveis, userId, verTodosCaixas);
}

export function rotuloContasCobrador(vinculos: CobradorContaVinculo[]): string {
    if (vinculos.length === 0) return '';
    const principal = vinculos.find((v) => v.principal) || vinculos[0];
    const nome = (principal.nome || 'Caixa').trim();
    if (vinculos.length === 1) return nome;
    return `${nome} (+${vinculos.length - 1})`;
}
