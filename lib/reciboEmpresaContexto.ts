import { supabase } from './supabase';
import { formatarCnpjContrato } from './contratoEmpresaJuridica';
import { unidadeNomeCurto } from './contextoUnidadeLabels';
import { resolveLogoUrl, FENIX_LOGO_APARECIDA_PATH } from './fenixLogo';
import { enderecoPareceUrlInvalida } from './logoUrl';
import { loadReciboTermicoConfig } from './reciboTermicoConfig';

const SS_CONTEXTO_EMPRESA = 'apex_empresa_modulos_contexto_id';

export type EmpresaReciboContext = {
  empresaId: string | null;
  nome: string;
  /** CNPJ formatado para exibição (XX.XXX.XXX/XXXX-XX). */
  cnpj: string;
  telefone: string;
  endereco?: string;
  logoUrl: string;
  logoUrlOrigem?: string | null;
};

const CNPJ_CATALAO = '03.617.822/0001-04';
const CNPJ_APARECIDA = '03.617.822/0002-95';
const CNPJ_IPAMERI = '03.617.822/0003-76';

/** Endereço padrão quando `empresas.endereco` não está preenchido no banco. */
function enderecoPadraoPorCnpj(cnpj?: string | null): string | undefined {
  const digits = String(cnpj || '').replace(/\D/g, '');
  if (digits.endsWith('000104')) {
    return 'RUA MARGARIDA SILVA, N 48, ELIAS SAFATTE, CATALAO-GO';
  }
  if (digits.endsWith('000295')) {
    return 'AVENIDA B S/N QD.G LT.1-3 E 11, SETOR ARAGUAIA, APARECIDA-GO CEP 74981150';
  }
  if (digits.endsWith('000376')) {
    return 'AVENIDA BRANCA A MACHADO, N 61, IPAMERI-GO';
  }
  return 'RUA MARGARIDA SILVA, N 48, ELIAS SAFATTE, CATALAO-GO';
}

function formatarCnpjExibicao(value?: string | null): string {
  return formatarCnpjContrato(value) || CNPJ_CATALAO;
}

function logoPadraoPorCnpj(cnpj?: string | null): string {
  const digits = String(cnpj || '').replace(/\D/g, '');
  if (digits.endsWith('000295')) return FENIX_LOGO_APARECIDA_PATH;
  return resolveLogoUrl(null);
}

function resolverLogoEmpresa(logoUrl?: string | null, cnpj?: string | null): string {
  const padraoUnidade = logoPadraoPorCnpj(cnpj);
  if (padraoUnidade !== resolveLogoUrl(null)) return padraoUnidade;
  return resolveLogoUrl(logoUrl);
}

function formatarTelefone(value?: string | null): string {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  return value || '';
}

/** Empresas.endereco é jsonb — evita "[object Object]" no recibo térmico. */
export function enderecoEmpresaParaTexto(endereco: unknown): string | undefined {
  if (endereco == null) return undefined;
  if (typeof endereco === 'string') {
    const t = endereco.trim();
    if (t && !enderecoPareceUrlInvalida(t)) return t;
    return undefined;
  }
  if (typeof endereco === 'object') {
    const e = endereco as Record<string, unknown>;
    const textoDireto = String(e.texto ?? e.text ?? '').trim();
    if (textoDireto && !enderecoPareceUrlInvalida(textoDireto)) return textoDireto;
    const partes: string[] = [];
    const rua = [e.logradouro, e.numero].filter(Boolean).join(' ').trim();
    if (rua) partes.push(String(rua));
    if (e.complemento) partes.push(String(e.complemento));
    const loc = [e.bairro, e.cidade, e.uf || e.estado].filter(Boolean).join(' ');
    if (loc) partes.push(String(loc));
    const cep = String(e.cep || '').replace(/\D/g, '');
    if (cep) partes.push(`CEP ${cep}`);
    const texto = partes.join(' ').trim();
    return texto || undefined;
  }
  return undefined;
}

/** Prioridade: explícito → unidade selecionada no topo → sessão do usuário. */
export function resolverEmpresaIdRecibo(explicito?: string | null): string | null {
  const id = (explicito || '').trim();
  if (id) return id;
  try {
    const ctx = (
      localStorage.getItem(SS_CONTEXTO_EMPRESA)
      || sessionStorage.getItem(SS_CONTEXTO_EMPRESA)
      || ''
    ).trim();
    if (ctx) return ctx;
    const userRaw = sessionStorage.getItem('user');
    const user = userRaw ? JSON.parse(userRaw) : null;
    const sessao = (user?.empresa_id || sessionStorage.getItem('empresa_id') || '').trim();
    return sessao || null;
  } catch {
    return null;
  }
}

export async function carregarEmpresaReciboContext(
  empresaIdExplicito?: string | null,
): Promise<EmpresaReciboContext> {
  const cfg = loadReciboTermicoConfig();
  const empresaId = resolverEmpresaIdRecibo(empresaIdExplicito);

  if (!empresaId) {
    return {
      empresaId: null,
      nome: 'FENIX FUNERARIA',
      cnpj: CNPJ_CATALAO,
      telefone: formatarTelefone(cfg.telefone || '(64)3441-4747'),
      endereco: enderecoPadraoPorCnpj(CNPJ_CATALAO),
      logoUrl: resolverLogoEmpresa(null, CNPJ_CATALAO),
      logoUrlOrigem: null,
    };
  }

  try {
    const { data } = await supabase
      .from('empresas')
      .select('nome, cnpj, telefone, endereco, logo_url')
      .eq('id', empresaId)
      .maybeSingle();

    const nomeBase = data?.nome || 'FENIX FUNERARIA';
    const unidade = unidadeNomeCurto(nomeBase).toUpperCase();
    const nome =
      /f[eê]nix|fenix/i.test(nomeBase)
        ? `FENIX FUNERARIA ${unidade}`.trim()
        : nomeBase.toUpperCase();

    const cnpjDigits = String(data?.cnpj || '').replace(/\D/g, '');
    const nomeLower = nomeBase.toLowerCase();
    const cnpj =
      formatarCnpjExibicao(data?.cnpj)
      || (cnpjDigits.endsWith('000104')
        ? CNPJ_CATALAO
        : cnpjDigits.endsWith('000376') || nomeLower.includes('ipameri')
          ? CNPJ_IPAMERI
          : cnpjDigits.endsWith('000295') || nomeLower.includes('aparecida')
            ? CNPJ_APARECIDA
            : CNPJ_CATALAO);

    const enderecoBanco = enderecoEmpresaParaTexto(data?.endereco)?.toUpperCase();
    return {
      empresaId,
      nome,
      cnpj,
      telefone: formatarTelefone(cfg.telefone || data?.telefone || '(64)3441-4747'),
      endereco: enderecoBanco || enderecoPadraoPorCnpj(cnpj),
      logoUrl: resolverLogoEmpresa(data?.logo_url, cnpj),
      logoUrlOrigem: data?.logo_url || null,
    };
  } catch {
    return {
      empresaId,
      nome: 'FENIX FUNERARIA',
      cnpj: CNPJ_CATALAO,
      telefone: formatarTelefone(cfg.telefone || '(64)3441-4747'),
      endereco: enderecoPadraoPorCnpj(CNPJ_CATALAO),
      logoUrl: resolverLogoEmpresa(null, CNPJ_CATALAO),
      logoUrlOrigem: null,
    };
  }
}

export async function carregarEmpresaReciboPorClienteId(
  clienteId: string,
): Promise<EmpresaReciboContext> {
  try {
    const { data } = await supabase
      .from('clientes')
      .select('empresa_id')
      .eq('id', clienteId)
      .maybeSingle();
    return carregarEmpresaReciboContext(data?.empresa_id);
  } catch {
    return carregarEmpresaReciboContext();
  }
}
