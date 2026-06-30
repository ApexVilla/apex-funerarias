import type { ClienteSB } from './ClienteStore';
import { buscarClienteIdsPorCodigoContrato, contratoCodigoMatch } from './buscaContrato';
import { supabase } from './supabase';
import { normalizeSearchText, variantesBuscaAcento } from './textUtils';

export type BeneficiarioBuscaAtendimento = {
    id: string;
    cliente_id: string;
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    parentesco?: string | null;
    cliente_nome?: string | null;
    contrato_codigo?: string | null;
};

export type ResultadoBuscaTitularAtendimento =
    | { tipo: 'cliente'; cliente: ClienteSB }
    | { tipo: 'beneficiario'; cliente_id: string; beneficiario: BeneficiarioBuscaAtendimento };

/** Texto para comparação ignorando acentos, vírgulas e caixa. */
export const normalizarBuscaTexto = normalizeSearchText;

/** Extrai apenas dígitos dos campos de telefone do cliente. */
export function digitosTelefonesCliente(c: ClienteSB): string[] {
    const campos = [
        c.telefone_principal,
        c.celular,
        c.telefone_secundario,
        c.telefone_celular2,
        c.telefone_comercial,
        c.whatsapp,
    ];
    return campos
        .map((v) => (v || '').replace(/\D/g, ''))
        .filter((v) => v.length >= 8);
}

/** Compara termo numérico com telefones (completo ou sufixo sem DDD). */
export function telefoneMatchBusca(termoDigits: string, telefones: string[]): boolean {
    if (!termoDigits || termoDigits.length < 3) return false;
    return telefones.some((tel) => {
        if (tel.includes(termoDigits)) return true;
        if (termoDigits.length >= 8 && tel.endsWith(termoDigits.slice(-8))) return true;
        if (termoDigits.length >= 9 && tel.endsWith(termoDigits.slice(-9))) return true;
        return false;
    });
}

/** Rótulo dos contratos do cliente para listas de busca. */
export function contratosClienteExibicao(c: ClienteSB): string {
    const codigos = (c.contratos_codigos || []).filter(Boolean);
    if (codigos.length === 0) return '';
    return codigos.slice(0, 3).join(', ');
}

/** Primeiro telefone disponível para exibição em listas. */
export function telefoneClienteExibicao(c: ClienteSB): string {
    return (
        c.telefone_principal ||
        c.celular ||
        c.whatsapp ||
        c.telefone_secundario ||
        c.telefone_celular2 ||
        c.telefone_comercial ||
        '—'
    );
}

/** Filtro local (lista já carregada) — nome, CPF, e-mail, código, telefone, nº contrato. */
export function clienteMatchBusca(c: ClienteSB, termo: string): boolean {
    const s = normalizarBuscaTexto(termo);
    if (!s) return true;

    if (c.contratos_codigos?.some((cod) => contratoCodigoMatch(cod, termo))) return true;

    const nome = normalizarBuscaTexto(c.nome || '');
    const email = normalizarBuscaTexto(c.email || '');
    const codigo = normalizarBuscaTexto(c.codigo || '');
    const cpf = (c.cpf || '').replace(/\D/g, '');
    const termoDigits = termo.replace(/\D/g, '');

    if (nome.includes(s)) return true;
    if (email.includes(s)) return true;
    if (codigo.includes(s)) return true;
    if (termoDigits.length >= 3 && cpf.includes(termoDigits)) return true;
    if (telefoneMatchBusca(termoDigits, digitosTelefonesCliente(c))) return true;

    const partes = s.split(/\s+/).filter((p) => p.length >= 2);
    if (partes.length > 1 && partes.every((p) => nome.includes(p))) return true;

    return false;
}

/** Valor seguro para `.or()` do PostgREST (vírgulas e aspas no termo não quebram o filtro). */
function filtroIlikePostgrest(coluna: string, valor: string): string {
    const v = valor.replace(/\\/g, '\\\\').replace(/"/g, '""');
    return `${coluna}.ilike."%${v}%"`;
}

/** Monta filtro `.or()` do Supabase para busca por nome/CPF/e-mail/código/telefone. */
export function montarFiltroOrBuscaCliente(
    termo: string,
    opts?: { incluirNomeBusca?: boolean },
): string | null {
    const t = termo.trim().replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;

    const cpf = t.replace(/\D/g, '');
    const norm = normalizeSearchText(t);
    const parts = new Set<string>();

    if (opts?.incluirNomeBusca !== false && norm.length >= 2) {
        parts.add(filtroIlikePostgrest('nome_busca', norm));
    }

    for (const variante of variantesBuscaAcento(t)) {
        parts.add(filtroIlikePostgrest('nome', variante));
    }

    parts.add(filtroIlikePostgrest('email', t));
    parts.add(filtroIlikePostgrest('codigo', t));

    if (cpf.length >= 3) {
        parts.add(filtroIlikePostgrest('cpf', cpf));
        parts.add(filtroIlikePostgrest('telefone_principal', cpf));
        if (cpf.length >= 8) {
            parts.add(filtroIlikePostgrest('telefone_principal', cpf.slice(-8)));
        }
    } else if (t.length >= 2) {
        parts.add(filtroIlikePostgrest('telefone_principal', t));
    }

    return [...parts].join(',');
}

/** Busca dependentes/beneficiários por nome ou CPF (vincula ao titular do contrato). */
export async function buscarBeneficiariosPorTermo(
    empresaIds: string[],
    termo: string,
    incluirNomeBusca = true,
): Promise<BeneficiarioBuscaAtendimento[]> {
    const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
    const t = termo.trim();
    if (!t || t.length < 2 || ids.length === 0) return [];

    const digits = t.replace(/\D/g, '');
    const norm = normalizeSearchText(t);
    const parts = new Set<string>();

    if (incluirNomeBusca && norm.length >= 2) {
        parts.add(filtroIlikePostgrest('nome_busca', norm));
    }
    for (const variante of variantesBuscaAcento(t)) {
        parts.add(filtroIlikePostgrest('nome', variante));
    }
    if (digits.length >= 3) parts.add(`cpf.ilike.%${digits}%`);

    let q = supabase
        .from('beneficiarios')
        .select(
            `
            id, nome, cpf, telefone, parentesco, cliente_id, status,
            clientes!inner ( nome, empresa_id ),
            assinaturas ( codigo )
        `,
        )
        .eq('status', 'ativo')
        .or([...parts].join(','))
        .order('nome')
        .limit(25);

    if (ids.length === 1) q = q.eq('clientes.empresa_id', ids[0]);
    else q = q.in('clientes.empresa_id', ids);

    const { data, error } = await q;
    if (error) {
        if (incluirNomeBusca && /nome_busca/i.test(error.message || '')) {
            return buscarBeneficiariosPorTermo(empresaIds, termo, false);
        }
        console.error('[buscarBeneficiariosPorTermo]', error);
        return [];
    }

    const out: BeneficiarioBuscaAtendimento[] = [];
    for (const row of data || []) {
        const clienteId = String(row.cliente_id || '').trim();
        if (!clienteId) continue;
        const assinaturas = row.assinaturas as { codigo?: string } | { codigo?: string }[] | null;
        const codigo = Array.isArray(assinaturas)
            ? assinaturas[0]?.codigo
            : assinaturas?.codigo;
        const clientes = row.clientes as { nome?: string } | null;
        out.push({
            id: String(row.id),
            cliente_id: clienteId,
            nome: String(row.nome || ''),
            cpf: row.cpf ?? null,
            telefone: row.telefone ?? null,
            parentesco: row.parentesco ?? null,
            cliente_nome: clientes?.nome ?? null,
            contrato_codigo: codigo ?? null,
        });
    }
    return out;
}

/** Busca unificada: titular (cliente) + beneficiários + contrato. */
export async function buscarTitularAtendimento(
    empresaIds: string[],
    termo: string,
    buscarClientesFn: (termo: string) => Promise<ClienteSB[]>,
): Promise<ResultadoBuscaTitularAtendimento[]> {
    const t = termo.trim();
    if (t.length < 2) return [];

    const [clientesDb, beneficiarios, byContrato] = await Promise.all([
        buscarClientesFn(t),
        buscarBeneficiariosPorTermo(empresaIds, t),
        buscarClienteIdsPorCodigoContrato(empresaIds, t),
    ]);

    const map = new Map<string, ResultadoBuscaTitularAtendimento>();
    for (const cliente of clientesDb) {
        const contratos = byContrato.codigosPorCliente.get(cliente.id);
        map.set(`c:${cliente.id}`, {
            tipo: 'cliente',
            cliente: {
                ...cliente,
                contratos_codigos: contratos?.length
                    ? [...new Set([...(cliente.contratos_codigos || []), ...contratos])]
                    : cliente.contratos_codigos,
            },
        });
    }

    for (const clienteId of byContrato.clienteIds) {
        if (map.has(`c:${clienteId}`)) continue;
        const contratos = byContrato.codigosPorCliente.get(clienteId) || [];
        const stub: ClienteSB = {
            id: clienteId,
            nome: 'Cliente do contrato',
            contratos_codigos: contratos,
        } as ClienteSB;
        map.set(`c:${clienteId}`, { tipo: 'cliente', cliente: stub });
    }

    for (const b of beneficiarios) {
        const key = `b:${b.id}`;
        if (!map.has(key)) {
            map.set(key, { tipo: 'beneficiario', cliente_id: b.cliente_id, beneficiario: b });
        }
        if (!map.has(`c:${b.cliente_id}`)) {
            const stub: ClienteSB = {
                id: b.cliente_id,
                nome: b.cliente_nome || 'Titular do contrato',
                contratos_codigos: b.contrato_codigo ? [b.contrato_codigo] : [],
            } as ClienteSB;
            map.set(`c:${b.cliente_id}`, { tipo: 'cliente', cliente: stub });
        }
    }

    return Array.from(map.values()).slice(0, 12);
}
