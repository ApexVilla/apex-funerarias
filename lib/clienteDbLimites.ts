/** Limites varchar da tabela `clientes` (espelha information_schema). */

export const CLIENTE_CAMPOS_LIMITES: Record<string, number> = {
  codigo: 20,
  nome: 255,
  cpf: 14,
  rg: 20,
  sexo: 10,
  estado_civil: 50,
  profissao: 255,
  email: 255,
  telefone_principal: 20,
  celular: 20,
  endereco_cep: 10,
  endereco_logradouro: 255,
  endereco_numero: 20,
  endereco_complemento: 255,
  endereco_bairro: 100,
  endereco_cidade: 100,
  endereco_estado: 2,
  endereco_cob_cep: 9,
  endereco_cob_logradouro: 200,
  endereco_cob_numero: 20,
  endereco_cob_complemento: 100,
  endereco_cob_bairro: 100,
  endereco_cob_cidade: 100,
  forma_pagamento_preferencial: 50,
  origem_canal: 50,
  naturalidade_cidade: 100,
};

const ROTULOS_CLIENTE: Record<string, string> = {
  nome: 'Nome do titular',
  cpf: 'CPF',
  rg: 'RG',
  estado_civil: 'Estado civil',
  profissao: 'Profissão',
  email: 'E-mail',
  telefone_principal: 'Telefone',
  celular: 'Celular',
  endereco_cep: 'CEP',
  endereco_logradouro: 'Logradouro',
  endereco_numero: 'Número do endereço',
  endereco_complemento: 'Complemento do endereço',
  endereco_bairro: 'Bairro',
  endereco_cidade: 'Cidade',
  endereco_estado: 'UF',
  endereco_cob_logradouro: 'Logradouro de cobrança',
  endereco_cob_numero: 'Número do endereço de cobrança',
  endereco_cob_bairro: 'Bairro de cobrança',
  endereco_cob_cidade: 'Cidade de cobrança',
  forma_pagamento_preferencial: 'Forma de pagamento',
  naturalidade_cidade: 'Naturalidade (cidade)',
};

/** Campo equivalente na proposta para orientar o usuário. */
const CAMPO_PROPOSTA_POR_CLIENTE: Record<string, string> = {
  endereco_numero: 'Número (endereço residencial)',
  endereco_logradouro: 'Logradouro (endereço residencial)',
  endereco_complemento: 'Complemento (endereço residencial)',
  endereco_bairro: 'Bairro (endereço residencial)',
  endereco_cidade: 'Cidade (endereço residencial)',
  endereco_cep: 'CEP (endereço residencial)',
  endereco_cob_numero: 'Número (endereço de cobrança)',
  endereco_cob_logradouro: 'Logradouro (endereço de cobrança)',
  endereco_cob_bairro: 'Bairro (endereço de cobrança)',
  nome: 'Nome do contribuinte',
  cpf: 'CPF do contribuinte',
  rg: 'RG do contribuinte',
  profissao: 'Profissão do contribuinte',
  email: 'E-mail',
  telefone_principal: 'Telefone principal',
  estado_civil: 'Estado civil do contribuinte',
};

export function rotuloCampoCliente(campo: string): string {
  return ROTULOS_CLIENTE[campo] || campo.replace(/_/g, ' ');
}

function truncar(val: string, max: number): string {
  return val.length <= max ? val : val.slice(0, max);
}

/** Extrai número curto quando o usuário colou o endereço inteiro no campo Número. */
export function normalizarNumeroEnderecoCliente(
  numeroBruto: string,
  complementoExistente?: string | null,
): { numero: string; complemento?: string } {
  const bruto = (numeroBruto || '').trim();
  if (!bruto) return { numero: 'S/N' };
  if (bruto.length <= (CLIENTE_CAMPOS_LIMITES.endereco_numero || 20)) {
    return { numero: bruto };
  }

  const porRotulo = bruto.match(/n[uú]mero\s*[:\-]?\s*(\d{1,6})/i);
  if (porRotulo) {
    const num = porRotulo[1];
    const resto = bruto
      .replace(porRotulo[0], '')
      .replace(/^[\s,.-]+/, '')
      .trim();
    const complemento = [resto, complementoExistente].filter(Boolean).join(' · ').trim();
    return {
      numero: truncar(num, CLIENTE_CAMPOS_LIMITES.endereco_numero),
      complemento: complemento || undefined,
    };
  }

  const grupos = [...bruto.matchAll(/\b(\d{1,6})\b/g)];
  if (grupos.length > 0) {
    const ultimo = grupos[grupos.length - 1][1];
    const resto = bruto
      .replace(new RegExp(`\\b${ultimo}\\b(?!.*\\b${ultimo}\\b)`), '')
      .replace(/\s+/g, ' ')
      .trim();
    const complemento = [resto, complementoExistente].filter(Boolean).join(' · ').trim();
    return {
      numero: truncar(ultimo, CLIENTE_CAMPOS_LIMITES.endereco_numero),
      complemento: complemento || undefined,
    };
  }

  const complemento = [bruto, complementoExistente].filter(Boolean).join(' · ').trim();
  return { numero: 'S/N', complemento: complemento || undefined };
}

export function ajustarEnderecoClientePayload(payload: Record<string, unknown>): void {
  const limNum = CLIENTE_CAMPOS_LIMITES.endereco_numero;
  const limComp = CLIENTE_CAMPOS_LIMITES.endereco_complemento;
  const numeroAtual = String(payload.endereco_numero ?? '').trim();
  if (numeroAtual.length > limNum) {
    const { numero, complemento } = normalizarNumeroEnderecoCliente(
      numeroAtual,
      payload.endereco_complemento as string | null | undefined,
    );
    payload.endereco_numero = numero;
    if (complemento) {
      payload.endereco_complemento = truncar(complemento, limComp);
    }
  }

  const limCobNum = CLIENTE_CAMPOS_LIMITES.endereco_cob_numero;
  const cobNumero = String(payload.endereco_cob_numero ?? '').trim();
  if (cobNumero && cobNumero.length > limCobNum) {
    const { numero, complemento } = normalizarNumeroEnderecoCliente(
      cobNumero,
      payload.endereco_cob_complemento as string | null | undefined,
    );
    payload.endereco_cob_numero = numero;
    if (complemento) {
      payload.endereco_cob_complemento = truncar(complemento, CLIENTE_CAMPOS_LIMITES.endereco_cob_complemento);
    }
  }

  for (const [campo, limite] of Object.entries(CLIENTE_CAMPOS_LIMITES)) {
    const val = payload[campo];
    if (val == null || val === '') continue;
    const str = String(val);
    if (str.length > limite) {
      payload[campo] = truncar(str, limite);
    }
  }
}

export function validarLimitesClientePayload(payload: Record<string, unknown>): string | null {
  for (const [campo, limite] of Object.entries(CLIENTE_CAMPOS_LIMITES)) {
    const val = payload[campo];
    if (val == null || val === '') continue;
    const str = String(val);
    if (str.length > limite) {
      const rotulo = rotuloCampoCliente(campo);
      const dicaProposta = CAMPO_PROPOSTA_POR_CLIENTE[campo];
      const trecho = str.length > 40 ? `${str.slice(0, 40)}…` : str;
      const onde = dicaProposta
        ? ` Edite «${dicaProposta}» na proposta.`
        : '';
      return `O campo «${rotulo}» tem ${str.length} caracteres (máximo ${limite}). Valor: "${trecho}".${onde}`;
    }
  }
  return null;
}
