import { supabase } from './supabase';

export type ContratoEmpresaJuridica = {
  razaoSocial: string;
  cnpjFormatado: string;
  linhaCapaEmpresa: string;
  /** Parágrafo inicial dos modelos Fênix / Ônix. */
  clausulaIntroFenixOnix: string;
  /** Abertura do modelo Catálão Padrão. */
  clausulaIntroCatalaoPadrao: string;
  nomeEmpresaRodape: string;
};

export const JURIDICA_APARECIDA: ContratoEmpresaJuridica = {
  razaoSocial: 'FENIX FUNERARIA LTDA',
  cnpjFormatado: '03.617.822/0002-95',
  linhaCapaEmpresa: 'FENIX FUNERARIA LTDA - 03.617.822/0002-95',
  clausulaIntroFenixOnix:
    'FENIX FUNERARIA LTDA, Pessoa jurídica de direito privado, com sede em Aparecida de Goiânia, Estado de GO, à Avenida B S/N QD.G LT.1-3 e 11, Setor Araguaia CEP: 74981150, inscrita no CNPJ.: sob o n° 03.617.822/0002-95, constituída em 01/06/2005, conforme contrato registrado na JUCEG - Junta Comercial do Estado de GO sob o n° 522.016503.07 e alterações ulteriores, neste ato representada pelos Sócio-Gerente CYNTHIA SOUSA INÁCIO, portador da Carteira de Identidade n° 3439424-6469299, expedida pela SSP-GO, e do CPF n° 802.297.601-63, - vem na melhor forma admitida na legislação vigente e pelo presente instrumento, instituir o programa de serviços.',
  clausulaIntroCatalaoPadrao:
    'Pelo presente instrumento particular de Contrato de Adesão, de um lado, como CONTRATANTE (qualificação abaixo), e de outro lado, como CONTRATADA, FÊNIX FUNERÁRIA LTDA, pessoa jurídica de direito privado, com sede em Aparecida de Goiânia, Estado de GO, à Avenida B S/N QD.G LT.1-3 e 11, Setor Araguaia CEP: 74981150, inscrita no CNPJ sob o nº 03.617.822/0002-95, constituída em 01/06/2005, conforme contrato registrado na JUCEG sob o nº 522.016503.07, neste ato representada pela Sócia-Proprietária Cynthia Sousa Inácio, portadora da CI nº 3439424-6469299 (SSP-GO) e CPF nº 802.297.601-63.',
  nomeEmpresaRodape: 'FENIX FUNERARIA LTDA',
};

export const JURIDICA_IPAMERI: ContratoEmpresaJuridica = {
  razaoSocial: 'FÊNIX FUNERÁRIA LTDA',
  cnpjFormatado: '03.617.822/0003-76',
  linhaCapaEmpresa: 'FÊNIX FUNERÁRIA LTDA - 03.617.822/0003-76',
  clausulaIntroFenixOnix:
    'FÊNIX FUNERÁRIA LTDA, pessoa jurídica de direito privado, com sede em Ipameri, Estado de Goiás, à Avenida Branca A Machado, nº 61, inscrita no CNPJ sob o nº 03.617.822/0003-76, neste ato representada pela Sócia-Proprietária Cynthia Sousa Inácio, portadora da CI nº 3439424-6469299 (SSP-GO) e CPF nº 802.297.601-63, - vem na melhor forma admitida na legislação vigente e pelo presente instrumento, instituir o programa de serviços.',
  clausulaIntroCatalaoPadrao:
    'Pelo presente instrumento particular de Contrato de Adesão, de um lado, como CONTRATANTE (qualificação abaixo), e de outro lado, como CONTRATADA, FÊNIX FUNERÁRIA LTDA, pessoa jurídica de direito privado, com sede em Ipameri, Estado de Goiás, à Avenida Branca A Machado, nº 61, inscrita no CNPJ sob o nº 03.617.822/0003-76, neste ato representada pela Sócia-Proprietária Cynthia Sousa Inácio, portadora da CI nº 3439424-6469299 (SSP-GO) e CPF nº 802.297.601-63.',
  nomeEmpresaRodape: 'FÊNIX FUNERÁRIA LTDA',
};

export const JURIDICA_CATALAO: ContratoEmpresaJuridica = {
  razaoSocial: 'FÊNIX FUNERÁRIA LTDA',
  cnpjFormatado: '03.617.822/0001-04',
  linhaCapaEmpresa: 'FÊNIX FUNERÁRIA LTDA - 03.617.822/0001-04',
  clausulaIntroFenixOnix:
    'FÊNIX FUNERÁRIA LTDA, pessoa jurídica de direito privado, com sede em Catalão, Estado de Goiás, à Rua Margarida Silva, nº 48, Elias Safatte, inscrita no CNPJ sob o nº 03.617.822/0001-04, constituída em 01/06/2004, conforme contrato registrado na JUCEG sob o nº 522.0165030-7, neste ato representada pela Sócia-Proprietária Cynthia Sousa Inácio, portadora da CI nº 3439424-6469299 (SSP-GO) e CPF nº 802.297.601-63, - vem na melhor forma admitida na legislação vigente e pelo presente instrumento, instituir o programa de serviços.',
  clausulaIntroCatalaoPadrao:
    'Pelo presente instrumento particular de Contrato de Adesão, de um lado, como CONTRATANTE (qualificação abaixo), e de outro lado, como CONTRATADA, FÊNIX FUNERÁRIA LTDA, pessoa jurídica de direito privado, com sede em Catalão, Estado de Goiás, à Rua Margarida Silva, nº 48, Elias Safatte, inscrita no CNPJ sob o nº 03.617.822/0001-04, constituída em 01/06/2004, conforme contrato registrado na JUCEG sob o nº 522.0165030-7, neste ato representada pela Sócia-Proprietária Cynthia Sousa Inácio, portadora da CI nº 3439424-6469299 (SSP-GO) e CPF nº 802.297.601-63.',
  nomeEmpresaRodape: 'FÊNIX FUNERÁRIA LTDA',
};

export function formatarCnpjContrato(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return digits;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function cnpjEhCatalao(digits: string): boolean {
  return digits === '03617822000104' || digits.endsWith('000104');
}

function cnpjEhAparecida(digits: string): boolean {
  return digits === '03617822000295' || digits.endsWith('000295');
}

function cnpjEhIpameri(digits: string): boolean {
  return digits === '03617822000376' || digits.endsWith('000376');
}

function nomeIndicaCatalao(nome?: string | null): boolean {
  const n = (nome || '').toLowerCase();
  return n.includes('catalão') || n.includes('catalao');
}

function nomeIndicaIpameri(nome?: string | null): boolean {
  return (nome || '').toLowerCase().includes('ipameri');
}

/** Resolve dados jurídicos da contratada conforme CNPJ/nome da empresa do contrato. */
export function resolverContratoEmpresaJuridica(opts?: {
  cnpj?: string | null;
  nome?: string | null;
  razaoSocial?: string | null;
}): ContratoEmpresaJuridica {
  const digits = String(opts?.cnpj || '').replace(/\D/g, '');
  const nome = opts?.razaoSocial || opts?.nome || '';

  if (cnpjEhCatalao(digits) || (!digits && nomeIndicaCatalao(nome))) {
    return JURIDICA_CATALAO;
  }
  if (cnpjEhIpameri(digits) || (!digits && nomeIndicaIpameri(nome))) {
    return JURIDICA_IPAMERI;
  }
  if (cnpjEhAparecida(digits) || (!digits && (nome || '').toLowerCase().includes('aparecida'))) {
    return JURIDICA_APARECIDA;
  }

  if (digits) {
    const base = cnpjEhCatalao(digits)
      ? JURIDICA_CATALAO
      : cnpjEhIpameri(digits)
        ? JURIDICA_IPAMERI
        : JURIDICA_APARECIDA;
    const cnpjFormatado = formatarCnpjContrato(digits);
    return {
      ...base,
      cnpjFormatado,
      linhaCapaEmpresa: `${base.razaoSocial} - ${cnpjFormatado}`,
    };
  }

  return JURIDICA_APARECIDA;
}

export async function carregarContratoEmpresaJuridica(
  empresaId: string,
): Promise<ContratoEmpresaJuridica> {
  try {
    const { data } = await supabase
      .from('empresas')
      .select('nome, razao_social, cnpj')
      .eq('id', empresaId)
      .maybeSingle();

    return resolverContratoEmpresaJuridica({
      cnpj: data?.cnpj,
      nome: data?.nome,
      razaoSocial: data?.razao_social,
    });
  } catch {
    return JURIDICA_APARECIDA;
  }
}

export function empresaJuridicaOuPadrao(
  juridica?: ContratoEmpresaJuridica | null,
): ContratoEmpresaJuridica {
  return juridica || JURIDICA_APARECIDA;
}
