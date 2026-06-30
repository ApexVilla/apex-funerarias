export type EnderecoViaCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  complemento?: string;
};

export function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function cepSomenteDigitos(cep: string): string {
  return cep.replace(/\D/g, '').slice(0, 8);
}

/** Consulta ViaCEP (mesma API usada no cadastro de clientes). */
export async function buscarEnderecoPorCep(
  cep: string,
  signal?: AbortSignal,
): Promise<EnderecoViaCep> {
  const digits = cepSomenteDigitos(cep);
  if (digits.length !== 8) {
    throw new Error('Informe um CEP com 8 dígitos.');
  }

  const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal });
  if (!resp.ok) throw new Error('Falha ao consultar CEP.');

  const data = (await resp.json()) as {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    complemento?: string;
  };

  if (data.erro) throw new Error('CEP não encontrado.');

  return {
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    cidade: data.localidade || '',
    estado: (data.uf || '').toUpperCase(),
    complemento: data.complemento || undefined,
  };
}
