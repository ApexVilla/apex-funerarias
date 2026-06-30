/** Valores aceitos em `clientes.sexo` (CHECK constraint no Postgres). */
export const SEXO_CLIENTE_DB = ['M', 'F', 'Outro'] as const;
export type SexoClienteDb = (typeof SEXO_CLIENTE_DB)[number];

/**
 * Normaliza sexo para gravar em `clientes`.
 * Retorna `null` quando vazio — o campo deve ser omitido ou null no INSERT/UPDATE.
 */
export function normalizarSexoCliente(valor?: string | null): SexoClienteDb | null {
  const v = String(valor ?? '').trim();
  if (!v) return null;

  const upper = v.toUpperCase();
  if (upper === 'M' || upper === 'MASCULINO' || upper === 'MASC') return 'M';
  if (upper === 'F' || upper === 'FEMININO' || upper === 'FEM') return 'F';
  if (upper === 'O' || upper === 'OUTRO' || upper === 'OUTROS') return 'Outro';

  if ((SEXO_CLIENTE_DB as readonly string[]).includes(v)) return v as SexoClienteDb;

  return null;
}

type PayloadClienteCampos = {
  sexo?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
};

/** Normaliza payload de INSERT/UPDATE em `clientes` (campos opcionais temporários). */
export function aplicarSexoNoPayloadCliente<T extends PayloadClienteCampos>(payload: T): T {
  const out = { ...payload };

  const normSexo = normalizarSexoCliente(out.sexo);
  if (normSexo) out.sexo = normSexo;
  else delete out.sexo;

  const cpfDigits = String(out.cpf ?? '').replace(/\D/g, '');
  if (cpfDigits) out.cpf = cpfDigits;
  else delete out.cpf;

  const dn = String(out.data_nascimento ?? '').trim();
  if (dn) out.data_nascimento = dn;
  else delete out.data_nascimento;

  return out;
}
