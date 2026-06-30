import { normalizarTextoUnidade } from './cobradorUnidadeFiltro';

/** Nome curto da unidade para o seletor (ex.: "Fênix de Ipameri" → "Ipameri"). */
export function unidadeNomeCurto(nomeEmpresa: string): string {
  let s = nomeEmpresa.trim();
  if (!s) return nomeEmpresa;
  const patterns = [
    /^funer[aá]ria\s+f[eê]nix\s+de\s+/iu,
    /^funer[aá]ria\s+fenix\s+de\s+/iu,
    /^f[eê]nix\s+de\s+/iu,
    /^fenix\s+de\s+/iu,
    /^f[eê]nix\s+/iu,
    /^fenix\s+/iu,
  ];
  for (const p of patterns) {
    s = s.replace(p, '').trim();
  }
  return s || nomeEmpresa;
}

/** Marca exibida no botão (ex.: grupo Fênix). */
export function marcaGrupoCurta(nomeEmpresa: string): string {
  if (/f[eê]nix|fenix/i.test(nomeEmpresa)) return 'Fênix';
  const cut = nomeEmpresa.split(/\s+[–-]\s/)[0]?.trim();
  return cut || nomeEmpresa;
}

export type EmpresaGrupoMin = { id: string; nome: string };

/** Remove empresas repetidas (ex.: RPC retornando a mesma unidade duas vezes). */
export function deduplicarEmpresasGrupo<T extends EmpresaGrupoMin>(empresas: T[]): T[] {
  const porId = new Map<string, T>();
  for (const e of empresas) {
    if (!e?.id) continue;
    if (!porId.has(e.id)) porId.set(e.id, e);
  }
  return [...porId.values()];
}

/** Rótulo no seletor de empresas do grupo (evita dois “Ipameri” iguais sem contexto). */
export function rotuloEmpresaNoSeletor(empresa: EmpresaGrupoMin, todas: EmpresaGrupoMin[]): string {
  const curto = unidadeNomeCurto(empresa.nome);
  const qtdMesmoCurto = todas.filter((e) => unidadeNomeCurto(e.nome) === curto).length;
  if (qtdMesmoCurto <= 1) return curto;
  return empresa.nome.trim() || curto;
}

export type FilialSeletorMin = { id: string; nome: string; empresa_id?: string };

/**
 * Filiais de várias empresas costumam repetir o nome (ex.: “Ipameri” em cada unidade).
 * Quando o nome se repete, acrescenta a empresa: “Ipameri — Catalão”.
 */
export function filiaisComRotuloSeletor(
  filiais: FilialSeletorMin[],
  empresasPorId: Record<string, string>,
): Array<FilialSeletorMin & { rotulo: string }> {
  const norm = (s: string) => s.trim().toLowerCase();
  const contagem = new Map<string, number>();
  for (const f of filiais) {
    const k = norm(f.nome);
    contagem.set(k, (contagem.get(k) || 0) + 1);
  }
  return filiais.map((f) => {
    const dup = (contagem.get(norm(f.nome)) || 0) > 1;
    const empNome = f.empresa_id ? empresasPorId[f.empresa_id] : '';
    const rotulo =
      dup && empNome ? `${f.nome} — ${unidadeNomeCurto(empNome)}` : f.nome.trim() || f.id;
    return { ...f, rotulo };
  });
}

/** Chave estável para agrupar filiais com o mesmo papel operacional (cidade/unidade). */
export function chaveFilialUnidadeOrigem(nomeFilial: string): string {
  const n = normalizarTextoUnidade(nomeFilial);
  if (!n) return '';
  if (n === 'matriz') return 'matriz';
  if (n.includes('aparecida')) return 'aparecida';
  if (n.includes('catalao')) return 'catalao';
  if (n.includes('ipameri')) return 'ipameri';
  return n;
}

function filialCombinaNomeEmpresa(filialNome: string, empresaNome: string): boolean {
  const f = normalizarTextoUnidade(filialNome);
  const e = normalizarTextoUnidade(unidadeNomeCurto(empresaNome));
  if (!f || !e) return false;
  if (f === e) return true;
  if (e.length >= 4 && f.includes(e)) return true;
  if (f.length >= 4 && e.includes(f)) return true;
  return false;
}

/**
 * No cadastro de cobrador, cada empresa do grupo repete Catalão/Ipameri/Matriz/Aparecida.
 * Mantém uma filial por cidade para o seletor "unidade de origem".
 */
export function deduplicarFiliaisUnidadeOrigemCobrador(
  filiais: FilialSeletorMin[],
  empresasPorId: Record<string, string>,
  empresaIdPreferida?: string,
): Array<FilialSeletorMin & { rotulo: string }> {
  const preferida = (empresaIdPreferida || '').trim();
  const porChave = new Map<string, FilialSeletorMin>();

  const pontuar = (f: FilialSeletorMin): number => {
    let s = 0;
    const empNome = f.empresa_id ? empresasPorId[f.empresa_id] || '' : '';
    if (preferida && f.empresa_id === preferida) s += 100;
    if (empNome && filialCombinaNomeEmpresa(f.nome, empNome)) s += 50;
    return s;
  };

  for (const f of filiais) {
    if (!f?.id) continue;
    const chave = chaveFilialUnidadeOrigem(f.nome);
    if (!chave) continue;
    const atual = porChave.get(chave);
    if (!atual || pontuar(f) > pontuar(atual)) porChave.set(chave, f);
  }

  const unicas = [...porChave.values()];
  unicas.sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
  );

  return unicas.map((f) => ({
    ...f,
    rotulo: f.nome.trim() || f.id,
  }));
}
