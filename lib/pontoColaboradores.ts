import { supabase } from './supabase';
import { empresaIdsConsultaCobradores } from './cobradorEmpresaScope';
import { FILIAL_TODAS_ID } from './filialConstants';
import { cobradorPertenceUnidade, idsFiliaisDaUnidadeOperacional } from './cobradorUnidadeFiltro';
import { filtrarQueryPorEmpresaIds } from './useEmpresaIdsOperacao';
import { unidadeNomeCurto } from './contextoUnidadeLabels';
import { colaboradorBatePonto, colaboradorElegivelFolhaPonto } from './pontoRules';

export type ColaboradorPonto = {
  id: string;
  nome: string;
  email: string;
  empresa_id?: string;
  role?: string;
  permissoes?: Record<string, unknown> | null;
  ativo?: boolean;
  deleted_at?: string | null;
  departamento_id?: string | null;
};

type ListarColaboradoresPontoOpts = {
  empresaIdsFiltro: string[];
  empresaIdOperacao: string;
  empresasDoGrupo: { id: string; nome: string }[];
  visaoTodasEmpresasGrupo: boolean;
  podeAlternarEmpresa: boolean;
  filialId?: string;
  isTodasFiliais?: boolean;
};

/**
 * Usuários do ponto na unidade ativa + cobradores do grupo com login (usuario_id),
 * inclusive cadastro na matriz e atuação em Catalão/Aparecida.
 */
export async function listarColaboradoresPonto(
  opts: ListarColaboradoresPontoOpts,
): Promise<ColaboradorPonto[]> {
  const ids = (opts.empresaIdsFiltro || []).map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return [];

  const multiEmpresa = opts.podeAlternarEmpresa && opts.empresasDoGrupo.length > 1;
  const empresaNomeAtual =
    opts.empresasDoGrupo.find((e) => e.id === opts.empresaIdOperacao)?.nome || '';
  const tokenUnidadeGrupo = opts.visaoTodasEmpresasGrupo ? '' : unidadeNomeCurto(empresaNomeAtual);

  const { data: usersData, error: usersErr } = await filtrarQueryPorEmpresaIds(
    (supabase as any)
      .from('users')
      .select('id, nome, email, role, permissoes, empresa_id, ativo, deleted_at, departamento_id')
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome', { ascending: true }),
    ids,
  );
  if (usersErr) throw usersErr;

  const porId = new Map<string, ColaboradorPonto>();
  for (const u of (usersData || []) as ColaboradorPonto[]) {
    if (!u?.id) continue;
    if (!colaboradorElegivelFolhaPonto(u)) continue;
    porId.set(u.id, u);
  }

  const idsCobradores = empresaIdsConsultaCobradores({
    empresaIdsParaFiltro: ids,
    empresasDoGrupo: opts.empresasDoGrupo,
    visaoTodasEmpresasGrupo: opts.visaoTodasEmpresasGrupo,
    multiEmpresa,
    tokenUnidadeGrupo,
  });

  if (idsCobradores.length > 0) {
    const { data: filiaisRows } = await supabase
      .from('filiais')
      .select('id, nome')
      .in('empresa_id', idsCobradores);
    const filiais = (filiaisRows || []) as { id: string; nome: string }[];

    const shouldFilterByFilial =
      !multiEmpresa &&
      Boolean(opts.filialId && opts.filialId !== FILIAL_TODAS_ID && !opts.isTodasFiliais);
    const filialIdsUnidade = idsFiliaisDaUnidadeOperacional(filiais, tokenUnidadeGrupo);

    let cq = supabase
      .from('cobradores')
      .select('id, nome, empresa_id, filial_id, area_atuacao, usuario_id, status')
      .in('empresa_id', idsCobradores)
      .eq('status', 'ativo')
      .not('usuario_id', 'is', null);

    const { data: cobRows, error: cobErr } = await cq;
    if (cobErr) throw cobErr;

    const usuarioIds = [
      ...new Set(
        (cobRows || [])
          .map((c: { usuario_id?: string | null }) => (c.usuario_id || '').trim())
          .filter(Boolean),
      ),
    ];

    let usersPorId = new Map<string, ColaboradorPonto>();
    if (usuarioIds.length > 0) {
      const { data: linkedUsers, error: linkErr } = await supabase
        .from('users')
        .select('id, nome, email, role, permissoes, empresa_id, ativo, deleted_at, departamento_id')
        .eq('ativo', true)
        .is('deleted_at', null)
        .in('id', usuarioIds);
      if (linkErr) throw linkErr;
      for (const u of (linkedUsers || []) as ColaboradorPonto[]) {
        if (u?.id) usersPorId.set(u.id, u);
      }
    }

    for (const c of cobRows || []) {
      const row = c as {
        usuario_id?: string | null;
        nome?: string;
        empresa_id?: string | null;
        filial_id?: string | null;
        area_atuacao?: string | null;
      };
      const uid = (row.usuario_id || '').trim();
      if (!uid) continue;

      if (
        !cobradorPertenceUnidade(row, filiais, {
          filialIdFixo: shouldFilterByFilial ? opts.filialId : undefined,
          filialIdsUnidade,
          tokenUnidade: tokenUnidadeGrupo,
          empresaIdAtual: opts.empresaIdOperacao,
        })
      ) {
        continue;
      }

      const existente = porId.get(uid) || usersPorId.get(uid);
      if (existente) {
        if (colaboradorElegivelFolhaPonto(existente)) {
          porId.set(uid, existente);
        }
        continue;
      }

      const u = usersPorId.get(uid);
      if (!u || !colaboradorElegivelFolhaPonto(u)) continue;

      porId.set(uid, {
        id: uid,
        nome: u.nome || row.nome || 'Cobrador',
        email: u.email || '',
        role: u.role || 'cobrador',
        permissoes: u.permissoes ?? null,
        empresa_id: u.empresa_id || row.empresa_id || undefined,
        departamento_id: u.departamento_id || undefined,
      });
    }
  }

  return [...porId.values()].sort((a, b) =>
    (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }),
  );
}
