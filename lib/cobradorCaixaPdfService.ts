import type { CaixaMovimento, CaixaSessao } from './CaixaStore';
import type { ContaBancaria } from './FinanceiroStore';
import {
    carregarContasCobrador,
    carregarContasBancariasVinculadas,
} from './cobradorContasBancarias';
import { montarPdfCaixaBlob, type CaixaPdfSnapshot } from './caixaRelatorioPdf';
import { contaSaldoFinalSomenteEspecie } from './caixaFormaPagamento';
import { enriquecerMovimentosCaixaComRecebimento } from './finCaixaRecebimentoLabel';
import {
    dataCalendarioSp,
    dataIsoSessao,
    movimentoPertenceSessao,
} from './finCaixaSessaoMovimento';
import { supabase } from './supabase';

const SESSAO_MOV_SELECT =
    'id, empresa_id, sessao_id, tipo, descricao, valor_centavos, forma_pagamento, referencia_id, referencia_tipo, data_movimentacao, created_at, usuario_id, conciliado, conciliado_em, conciliado_por';

const formatDateBr = (iso?: string | null) => {
    const cal = dataCalendarioSp(iso);
    if (!cal) return '—';
    const [y, m, d] = cal.split('-');
    return `${d}/${m}/${y}`;
};

async function enriquecerMovimentosComUsuario(baseMovs: CaixaMovimento[]): Promise<CaixaMovimento[]> {
    const userIds = Array.from(new Set(
        baseMovs.flatMap((m) => [m.usuario_id, m.conciliado_por].filter(Boolean)),
    )) as string[];
    if (userIds.length === 0) return baseMovs;

    const { data: users, error } = await supabase
        .from('users')
        .select('id, nome')
        .in('id', userIds);
    if (error) return baseMovs;

    const userMap = new Map<string, string>();
    (users || []).forEach((u: { id: string; nome: string }) => userMap.set(u.id, u.nome));

    return baseMovs.map((m) => ({
        ...m,
        usuario_nome: m.usuario_id ? userMap.get(m.usuario_id) || m.usuario_nome : m.usuario_nome,
        conciliado_por_nome: m.conciliado_por
            ? userMap.get(m.conciliado_por) || m.conciliado_por_nome
            : m.conciliado_por_nome,
    }));
}

export async function listarSessoesCaixaCobradorPeriodo(
    cobradorId: string,
    dataInicio: string,
    dataFim: string,
): Promise<{ sessoes: CaixaSessao[]; contas: ContaBancaria[] }> {
    const vinculos = await carregarContasCobrador(cobradorId);
    if (vinculos.length === 0) {
        throw new Error('Nenhum caixa vinculado ao cobrador. Configure em Cobradores → editar.');
    }

    const contaIds = vinculos.map((v) => v.conta_bancaria_id);
    const contas = await carregarContasBancariasVinculadas(vinculos);

    const inicioDia = `${dataInicio}T00:00:00`;
    const fimDia = `${dataFim}T23:59:59`;
    const { data, error } = await supabase
        .from('fin_caixa_sessoes')
        .select('*')
        .in('conta_bancaria_id', contaIds)
        .gte('data_abertura', inicioDia)
        .lte('data_abertura', fimDia)
        .order('data_abertura', { ascending: true });

    if (error) throw error;

    return { sessoes: (data ?? []) as CaixaSessao[], contas };
}

export async function montarSnapshotsPdfCaixaCobrador(opts: {
    cobradorId: string;
    dataInicio: string;
    dataFim: string;
    empresaNome?: string;
}): Promise<CaixaPdfSnapshot[]> {
    const { sessoes, contas } = await listarSessoesCaixaCobradorPeriodo(
        opts.cobradorId,
        opts.dataInicio,
        opts.dataFim,
    );

    if (sessoes.length === 0) {
        throw new Error(
            'Nenhuma sessão de caixa no período. Verifique as datas ou se o dia foi aberto na Tesouraria.',
        );
    }

    const contaMap = new Map(contas.map((c) => [c.id, c]));
    const snapshots: CaixaPdfSnapshot[] = [];

    for (const sessao of sessoes) {
        const conta = contaMap.get(sessao.conta_bancaria_id);
        const dia = dataIsoSessao(sessao);
        const inicioIso = `${dia}T00:00:00.000`;
        const fimIso = `${dia}T23:59:59.999`;

        const { data: sessoesConta } = await supabase
            .from('fin_caixa_sessoes')
            .select('id')
            .eq('conta_bancaria_id', sessao.conta_bancaria_id);
        const idsConta = (sessoesConta ?? []).map((s: { id: string }) => s.id);
        const contaPorSessaoId = new Map(idsConta.map((id) => [id, sessao.conta_bancaria_id]));

        const [comData, semData] = await Promise.all([
            supabase
                .from('fin_caixa_movimentos')
                .select(SESSAO_MOV_SELECT)
                .in('sessao_id', idsConta.length ? idsConta : [sessao.id])
                .eq('data_movimentacao', dia)
                .order('created_at', { ascending: true }),
            supabase
                .from('fin_caixa_movimentos')
                .select(SESSAO_MOV_SELECT)
                .in('sessao_id', idsConta.length ? idsConta : [sessao.id])
                .is('data_movimentacao', null)
                .gte('created_at', inicioIso)
                .lte('created_at', fimIso)
                .order('created_at', { ascending: true }),
        ]);
        if (comData.error) throw comData.error;
        if (semData.error) throw semData.error;

        const raw = [
            ...((comData.data ?? []) as CaixaMovimento[]),
            ...((semData.data ?? []) as CaixaMovimento[]),
        ];
        const filtered = raw.filter((m) => movimentoPertenceSessao(m, sessao, contaPorSessaoId));
        let movs = await enriquecerMovimentosComUsuario(filtered);
        movs = await enriquecerMovimentosCaixaComRecebimento(movs);

        snapshots.push({
            data_abertura: formatDateBr(dataIsoSessao(sessao)),
            status: sessao.status,
            saldo_abertura_centavos: Number(sessao.saldo_abertura_centavos || 0),
            conta_nome: conta?.nome || 'Caixa',
            banco_nome: conta?.banco_nome,
            filial_nome: opts.empresaNome,
            somente_especie: contaSaldoFinalSomenteEspecie(conta?.tipo),
            movimentos: movs.map((m) => ({
                created_at: m.created_at,
                tipo: m.tipo,
                valor_centavos: m.valor_centavos,
                forma_pagamento: m.forma_pagamento,
                descricao: m.descricao,
                usuario_nome: m.usuario_nome,
            })),
        });
    }

    return snapshots;
}

export function gerarBlobPdfCaixaCobrador(snapshot: CaixaPdfSnapshot): Blob {
    return montarPdfCaixaBlob(snapshot);
}

export function nomeArquivoPdfCaixaCobrador(
    cobradorNome: string,
    dataAbertura: string,
    contaNome: string,
): string {
    const slug = (s: string) =>
        s
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    const dia = dataAbertura.replace(/\//g, '-');
    return `caixa-${slug(cobradorNome)}-${slug(contaNome)}-${dia}.pdf`;
}
