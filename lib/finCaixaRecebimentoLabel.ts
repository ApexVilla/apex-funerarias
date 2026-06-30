import type { CaixaMovimento } from './CaixaStore';
import { supabase } from './supabase';

type RecebimentoMeta = {
    codigo: string;
    descricao: string | null;
    clienteNome: string | null;
    contratoCodigo: string | null;
    pixNomePagador: string | null;
};

export type CaixaMovimentoEnriquecido = CaixaMovimento & {
    cliente_nome?: string;
    contrato_codigo?: string;
    pagador_pix?: string;
};

function lerNomeRelacao(rel: unknown): string | null {
    if (!rel) return null;
    const row = Array.isArray(rel) ? rel[0] : rel;
    if (!row || typeof row !== 'object') return null;
    const nome = (row as { nome?: string }).nome;
    return nome?.trim() || null;
}

function lerCodigoRelacao(rel: unknown): string | null {
    if (!rel) return null;
    const row = Array.isArray(rel) ? rel[0] : rel;
    if (!row || typeof row !== 'object') return null;
    const codigo = (row as { codigo?: string }).codigo;
    return codigo?.trim() || null;
}

export function montarDescricaoRecebimentoCaixa(meta: RecebimentoMeta): string {
    const partes = [
        `Recebimento ${meta.codigo}`.trim(),
        meta.clienteNome,
        meta.contratoCodigo ? `Contrato ${meta.contratoCodigo}` : null,
        meta.pixNomePagador ? `Pagador PIX: ${meta.pixNomePagador}` : null,
        meta.descricao?.trim() || null,
    ].filter(Boolean);
    return partes.join(' - ');
}

export async function enriquecerMovimentosCaixaComRecebimento(
    movs: CaixaMovimento[],
): Promise<CaixaMovimentoEnriquecido[]> {
    const contaReceberIds = Array.from(new Set(
        movs
            .filter((m) => m.referencia_tipo === 'fin_contas_receber' && m.referencia_id)
            .map((m) => m.referencia_id as string),
    ));
    if (contaReceberIds.length === 0) return movs;

    const metaMap = new Map<string, RecebimentoMeta>();

    const { data: titulos, error: titulosErr } = await supabase
        .from('fin_contas_receber')
        .select(`
            id,
            codigo,
            descricao,
            clientes:cliente_id ( nome ),
            assinaturas:assinatura_id ( codigo )
        `)
        .in('id', contaReceberIds);

    if (!titulosErr) {
        (titulos ?? []).forEach((cr: Record<string, unknown>) => {
            const id = String(cr.id || '');
            if (!id) return;
            metaMap.set(id, {
                codigo: String(cr.codigo || '').trim() || id.slice(0, 8),
                descricao: typeof cr.descricao === 'string' ? cr.descricao : null,
                clienteNome: lerNomeRelacao(cr.clientes),
                contratoCodigo: lerCodigoRelacao(cr.assinaturas),
                pixNomePagador: null,
            });
        });
    }

    const { data: baixas } = await supabase
        .from('fin_contas_receber_baixas')
        .select('conta_receber_id, pix_nome_pagador, created_at')
        .in('conta_receber_id', contaReceberIds)
        .order('created_at', { ascending: false });

    (baixas ?? []).forEach((b: { conta_receber_id?: string; pix_nome_pagador?: string | null }) => {
        const id = b.conta_receber_id;
        const pix = b.pix_nome_pagador?.trim();
        if (!id || !pix) return;
        const atual = metaMap.get(id);
        if (atual && !atual.pixNomePagador) {
            atual.pixNomePagador = pix;
        }
    });

    return movs.map((mov) => {
        if (mov.referencia_tipo !== 'fin_contas_receber' || !mov.referencia_id) return mov;
        const meta = metaMap.get(mov.referencia_id);
        if (!meta) return mov;
        const descricaoEnriquecida = montarDescricaoRecebimentoCaixa(meta);
        return {
            ...mov,
            cliente_nome: meta.clienteNome || undefined,
            contrato_codigo: meta.contratoCodigo || undefined,
            pagador_pix: meta.pixNomePagador || undefined,
            descricao: descricaoEnriquecida || mov.descricao,
        };
    });
}
