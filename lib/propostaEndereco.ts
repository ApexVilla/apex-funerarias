/** Monta texto legado (`endereco_residencia` / PDF) a partir dos campos separados. */
export function montarEnderecoResidenciaProposta(parts: {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  quadra?: string | null;
  lote?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): string {
  const logradouro = (parts.logradouro || '').trim();
  const numero = (parts.numero || '').trim();
  const bairro = (parts.bairro || '').trim();
  const quadra = (parts.quadra || '').trim();
  const lote = (parts.lote || '').trim();
  const cidade = (parts.cidade || '').trim();
  const uf = (parts.uf || '').trim();
  const cepDigits = String(parts.cep || '').replace(/\D/g, '');
  const cepFmt =
    cepDigits.length === 8 ? cepDigits.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';

  const linhas: string[] = [];
  const ruaNum = [logradouro, numero].filter(Boolean).join(', ');
  if (ruaNum) linhas.push(ruaNum);

  const detalhes = [
    bairro ? `Bairro ${bairro}` : '',
    quadra ? `Quadra ${quadra}` : '',
    lote ? `Lote ${lote}` : '',
  ].filter(Boolean);
  if (detalhes.length) linhas.push(detalhes.join(' · '));

  const loc = [cidade, uf].filter(Boolean).join('/');
  if (loc) linhas.push(loc);
  if (cepFmt) linhas.push(`CEP ${cepFmt}`);

  return linhas.join(' — ').trim();
}

export type EnderecoPropostaPartes = {
  logradouro: string;
  numero: string;
  bairro: string;
  quadra: string;
  lote: string;
};

/** Endereço completo para PDF/listagem — prioriza campos separados (inclui cidade/UF/CEP). */
export function enderecoResidenciaCompletoFromRow(row: {
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_quadra?: string | null;
  endereco_lote?: string | null;
  endereco_cidade?: string | null;
  endereco_uf?: string | null;
  endereco_cep?: string | null;
  endereco_residencia?: string | null;
}): string {
  const montado = montarEnderecoResidenciaProposta({
    logradouro: row.endereco_logradouro,
    numero: row.endereco_numero,
    bairro: row.endereco_bairro,
    quadra: row.endereco_quadra,
    lote: row.endereco_lote,
    cidade: row.endereco_cidade,
    uf: row.endereco_uf,
    cep: row.endereco_cep,
  });
  if (montado) return montado;
  return (row.endereco_residencia || '').trim();
}

export function enderecoPropostaPartesFromRow(row: {
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_quadra?: string | null;
  endereco_lote?: string | null;
  endereco_residencia?: string | null;
}): EnderecoPropostaPartes {
  const logradouro = (row.endereco_logradouro || '').trim();
  if (logradouro || row.endereco_bairro || row.endereco_numero) {
    return {
      logradouro,
      numero: (row.endereco_numero || '').trim(),
      bairro: (row.endereco_bairro || '').trim(),
      quadra: (row.endereco_quadra || '').trim(),
      lote: (row.endereco_lote || '').trim(),
    };
  }
  return {
    logradouro: (row.endereco_residencia || '').trim(),
    numero: '',
    bairro: '',
    quadra: '',
    lote: '',
  };
}
