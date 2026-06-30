import { supabase } from './supabase';
import { mensagemErroSupabase } from './supabaseErrorMessage';
import {
  buildContratoPdfFromDados,
  buscarNomeVendedorContrato,
} from './ContratoAssinaturaService';
import { carregarBeneficiariosDoContrato } from './contratoAtendimentoService';
import { nomePlanoParaExibicao } from './planoNomeExibicao';
import type { AssinaturaSB, ClienteSB } from './ClienteStore';

// ==================== TYPES ====================

export interface AssinaturaDigital {
  id: string;
  empresa_id: string;
  assinatura_id: string;
  cliente_id: string;
  token: string;
  contrato_numero: string | null;
  contrato_plano: string | null;
  titular_nome: string;
  titular_cpf: string | null;
  titular_telefone: string | null;
  status: 'pendente' | 'visualizado' | 'assinado' | 'expirado' | 'cancelado';
  assinatura_imagem_url: string | null;
  assinado_em: string | null;
  ip_assinatura: string | null;
  user_agent: string | null;
  dispositivo: string | null;
  canal_envio: 'whatsapp' | 'sms' | 'email' | 'presencial';
  enviado_por: string | null;
  enviado_em: string;
  expira_em: string;
  observacoes: string | null;
  contrato_pdf_path: string | null;
  aceite_termos_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface CriarAssinaturaDigitalPayload {
  empresa_id: string;
  assinatura_id: string;
  cliente_id: string;
  contrato_numero?: string;
  contrato_plano?: string;
  titular_nome: string;
  titular_cpf?: string;
  titular_telefone?: string;
  canal_envio?: 'whatsapp' | 'sms' | 'email' | 'presencial';
  enviado_por?: string;
  observacoes?: string;
  /** Horas até expirar (padrão: 72) */
  horas_validade?: number;
}

// ==================== SERVICE ====================

/** Link público para o cliente assinar (HashRouter: `#/assinar/...`). */
export function montarLinkAssinaturaDigital(token: string): string {
  const base = `${window.location.origin}${window.location.pathname || '/'}`;
  const path = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${path}#/assinar/${encodeURIComponent(token)}`;
}

/**
 * Cria um registro de assinatura digital e retorna o token/link público.
 */
export async function criarAssinaturaDigital(
  payload: CriarAssinaturaDigitalPayload,
): Promise<{ data: AssinaturaDigital | null; error: string | null; link: string | null }> {
  try {
    const horasVal = payload.horas_validade ?? 72;
    const expiraEm = new Date(Date.now() + horasVal * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('contratos_assinaturas_digitais')
      .insert({
        empresa_id: payload.empresa_id,
        assinatura_id: payload.assinatura_id,
        cliente_id: payload.cliente_id,
        contrato_numero: payload.contrato_numero || null,
        contrato_plano: payload.contrato_plano || null,
        titular_nome: payload.titular_nome,
        titular_cpf: payload.titular_cpf || null,
        titular_telefone: payload.titular_telefone || null,
        canal_envio: payload.canal_envio || 'whatsapp',
        enviado_por: payload.enviado_por || null,
        observacoes: payload.observacoes || null,
        expira_em: expiraEm,
        status: 'pendente',
      })
      .select('*')
      .single();

    if (error) throw error;
    if (!data) throw new Error('Registro não retornado.');

    const record = data as AssinaturaDigital;
    const link = montarLinkAssinaturaDigital(record.token);

    return { data: record, error: null, link };
  } catch (err: any) {
    console.error('[criarAssinaturaDigital]', err);
    return { data: null, error: err.message || 'Erro ao criar solicitação de assinatura.', link: null };
  }
}

/** Caminho padrão do PDF do contrato no Storage (vinculado ao token público). */
export function caminhoContratoPdfAssinatura(token: string): string {
  return `contratos-pendentes/${token}.pdf`;
}

/**
 * Gera o PDF do contrato, envia ao Storage e vincula ao registro de assinatura digital.
 */
async function anexarContratoPdfAoRegistro(
  record: AssinaturaDigital,
  cliente: ClienteSB,
  assinatura: AssinaturaSB,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    let assinaturaComPlano = assinatura;
    if (assinatura.plano_id && !assinatura.plano_nome) {
      const { data: plano } = await supabase
        .from('planos')
        .select('nome, codigo, valor_mensal_centavos')
        .eq('id', assinatura.plano_id)
        .maybeSingle();
      if (plano) {
        assinaturaComPlano = {
          ...assinatura,
          plano_nome: nomePlanoParaExibicao(
            plano.nome,
            plano.valor_mensal_centavos,
            plano.codigo,
          ),
          plano_codigo: plano.codigo || assinatura.plano_codigo,
        };
      }
    }

    const beneficiarios = await carregarBeneficiariosDoContrato(
      assinatura.cliente_id,
      assinatura.id,
    );
    const vendedorNome = await buscarNomeVendedorContrato(assinaturaComPlano, cliente);
    const { blob } = await buildContratoPdfFromDados(
      cliente,
      assinaturaComPlano,
      beneficiarios,
      vendedorNome,
    );

    const filePath = caminhoContratoPdfAssinatura(record.token);
    const { error: uploadErr } = await supabase.storage
      .from('assinaturas-digitais')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const { error: updateErr } = await supabase
      .from('contratos_assinaturas_digitais')
      .update({
        contrato_pdf_path: filePath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    if (updateErr) throw updateErr;
    return { ok: true, error: null };
  } catch (err: any) {
    console.error('[anexarContratoPdfAoRegistro]', err);
    return { ok: false, error: err.message || 'Erro ao gerar PDF do contrato.' };
  }
}

/**
 * Cria solicitação de assinatura com PDF do contrato para o cliente ler antes de assinar.
 */
export async function criarAssinaturaDigitalComContrato(
  payload: CriarAssinaturaDigitalPayload,
  cliente: ClienteSB,
  assinatura: AssinaturaSB,
): Promise<{ data: AssinaturaDigital | null; error: string | null; link: string | null }> {
  const criado = await criarAssinaturaDigital(payload);
  if (criado.error || !criado.data || !criado.link) return criado;

  const pdf = await anexarContratoPdfAoRegistro(criado.data, cliente, assinatura);
  if (!pdf.ok) {
    await cancelarAssinaturaDigital(criado.data.id);
    return {
      data: null,
      error: pdf.error || 'Não foi possível gerar o contrato para envio.',
      link: null,
    };
  }

  const record = { ...criado.data, contrato_pdf_path: caminhoContratoPdfAssinatura(criado.data.token) };
  return { data: record, error: null, link: criado.link };
}

/** Baixa o PDF do contrato vinculado ao token (acesso público). */
export async function baixarContratoPdfPorToken(
  token: string,
  contratoPdfPath?: string | null,
): Promise<{ blob: Blob | null; error: string | null }> {
  try {
    const filePath = (contratoPdfPath || '').trim() || caminhoContratoPdfAssinatura(token);
    const { data, error } = await supabase.storage
      .from('assinaturas-digitais')
      .download(filePath);

    if (error) throw error;
    if (!data) throw new Error('Contrato não encontrado.');
    if (data.size === 0) throw new Error('O arquivo do contrato está vazio.');
    return { blob: data, error: null };
  } catch (err: unknown) {
    console.error('[baixarContratoPdfPorToken]', err);
    return {
      blob: null,
      error: mensagemErroSupabase(err, 'Não foi possível carregar o contrato. Tente novamente em instantes.'),
    };
  }
}

/** Registra o aceite dos termos antes da assinatura manuscrita. */
export async function registrarAceiteTermosContrato(
  token: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await supabase.rpc('registrar_aceite_termos_contrato', { p_token: token });

    if (error) throw error;
    return { ok: true, error: null };
  } catch (err: any) {
    console.error('[registrarAceiteTermosContrato]', err);
    return { ok: false, error: err.message || 'Erro ao registrar aceite.' };
  }
}

/** Helper para extrair o caminho relativo do arquivo a partir de uma URL pública */
export function obterCaminhoArquivoDaUrl(url: string): string {
  const parts = url.split('/assinaturas-digitais/');
  if (parts.length > 1) {
    return parts[1];
  }
  return url;
}

/**
 * Gera uma URL assinada (temporária e segura) para visualizar a assinatura privada.
 */
export async function obterSignedUrlAssinatura(
  urlOuCaminho: string,
  expiraEmSegundos: number = 60,
): Promise<string | null> {
  try {
    const caminho = obterCaminhoArquivoDaUrl(urlOuCaminho);
    const { data, error } = await supabase.storage
      .from('assinaturas-digitais')
      .createSignedUrl(caminho, expiraEmSegundos);

    if (error) throw error;
    return data?.signedUrl || null;
  } catch (err) {
    console.error('[obterSignedUrlAssinatura]', err);
    return null;
  }
}

/**
 * Busca um registro de assinatura digital pelo token público (acesso anônimo via RPC segura).
 */
export async function buscarAssinaturaPorToken(
  token: string,
): Promise<{ data: AssinaturaDigital | null; error: string | null; expirado: boolean }> {
  try {
    const { data, error } = await supabase
      .rpc('buscar_contrato_por_token', { p_token: token })
      .maybeSingle();

    if (error) throw error;
    if (!data) return { data: null, error: 'Link de assinatura não encontrado.', expirado: false };

    const record = data as AssinaturaDigital;

    // Verificar expiração
    if (new Date(record.expira_em) < new Date()) {
      return { data: record, error: 'Este link de assinatura expirou.', expirado: true };
    }

    if (record.status === 'cancelado') {
      return { data: record, error: 'Esta solicitação de assinatura foi cancelada.', expirado: false };
    }

    // Marcar como visualizado se ainda está pendente (RPC segura por token)
    if (record.status === 'pendente') {
      await supabase.rpc('marcar_contrato_visualizado', { p_token: token });
      record.status = 'visualizado';
    }

    return { data: record, error: null, expirado: false };
  } catch (err: any) {
    console.error('[buscarAssinaturaPorToken]', err);
    return { data: null, error: err.message || 'Erro ao buscar assinatura.', expirado: false };
  }
}

/**
 * Registra a assinatura digital do cliente (upload da imagem + update do registro).
 */
export async function registrarAssinaturaDigital(
  token: string,
  signatureBlob: Blob,
  metadata: {
    ip?: string;
    userAgent?: string;
    dispositivo?: 'mobile' | 'tablet' | 'desktop';
  },
): Promise<{ ok: boolean; error: string | null }> {
  try {
    // 1. Buscar registro pelo token usando a RPC segura buscar_contrato_por_token
    const { data: registroData, error: fetchErr } = await supabase
      .rpc('buscar_contrato_por_token', { p_token: token })
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!registroData) throw new Error('Registro de assinatura não encontrado.');
    const registro = registroData as AssinaturaDigital;
    if (registro.status === 'assinado') throw new Error('Este contrato já foi assinado.');
    if (registro.status === 'cancelado') throw new Error('Esta solicitação foi cancelada.');
    if (new Date(registro.expira_em) < new Date()) throw new Error('Este link expirou.');

    // 2. Upload da imagem da assinatura para o Storage (bucket agora privado, mas upload funciona com a política insert)
    const fileName = `${registro.id}_${Date.now()}.png`;
    const filePath = `signatures/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from('assinaturas-digitais')
      .upload(filePath, signatureBlob, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadErr) throw uploadErr;

    // 3. Obter URL pública (que serve como referência de caminho/estrutura)
    const { data: urlData } = supabase.storage
      .from('assinaturas-digitais')
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || '';

    // 4. Registrar a assinatura via RPC segura (valida o token internamente)
    const { error: updateErr } = await supabase.rpc('assinar_contrato_por_token', {
      p_token: token,
      p_assinatura_imagem_url: publicUrl,
      p_ip: metadata.ip || null,
      p_user_agent: metadata.userAgent || navigator.userAgent,
      p_dispositivo: metadata.dispositivo || detectarDispositivo(),
    });

    if (updateErr) throw updateErr;

    return { ok: true, error: null };
  } catch (err: any) {
    console.error('[registrarAssinaturaDigital]', err);
    return { ok: false, error: err.message || 'Erro ao registrar assinatura.' };
  }
}

/**
 * Lista todas as assinaturas digitais de um contrato (assinatura_id).
 */
export async function listarAssinaturasDigitais(
  assinaturaId: string,
): Promise<AssinaturaDigital[]> {
  try {
    const { data, error } = await supabase
      .from('contratos_assinaturas_digitais')
      .select('*')
      .eq('assinatura_id', assinaturaId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as AssinaturaDigital[]) || [];
  } catch (err) {
    console.error('[listarAssinaturasDigitais]', err);
    return [];
  }
}

/**
 * Cancela uma solicitação de assinatura digital pendente.
 */
export async function cancelarAssinaturaDigital(
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('contratos_assinaturas_digitais')
      .update({
        status: 'cancelado',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .in('status', ['pendente', 'visualizado']);

    if (error) throw error;
    return { ok: true, error: null };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Erro ao cancelar.' };
  }
}

// ==================== HELPERS ====================

/** Detecta o tipo de dispositivo pela largura da tela. */
function detectarDispositivo(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/** Gera link de compartilhamento por WhatsApp. */
export function gerarLinkWhatsApp(telefone: string, linkAssinatura: string, nomeCliente: string): string {
  const tel = telefone.replace(/\D/g, '');
  const telFormatado = tel.startsWith('55') ? tel : `55${tel}`;
  const mensagem = encodeURIComponent(
    `Olá ${nomeCliente}! 👋\n\n` +
    `Segue o link para você ler e assinar seu contrato com a Fênix Funerária de forma digital:\n\n` +
    `📋 ${linkAssinatura}\n\n` +
    `Basta abrir o link, ler o contrato completo, aceitar os termos e assinar com o dedo na tela do celular.\n\n` +
    `⏰ Este link é válido por 72 horas.\n\n` +
    `Qualquer dúvida, entre em contato conosco. 🙏`,
  );
  return `https://wa.me/${telFormatado}?text=${mensagem}`;
}

/** Formata o status para exibição. */
/** Resumo para ícone na lista de contratos. */
export type StatusAssinaturaDigitalResumo = 'assinado' | 'pendente' | 'nenhum';

export function resolverStatusResumoAssinaturaDigital(
  registros: Pick<AssinaturaDigital, 'status'>[],
): StatusAssinaturaDigitalResumo {
  if (registros.some((r) => r.status === 'assinado')) return 'assinado';
  if (registros.some((r) => r.status === 'pendente' || r.status === 'visualizado')) {
    return 'pendente';
  }
  return 'nenhum';
}

/** Mapa assinatura_id → status resumido (para tabela de contratos). */
export async function mapaStatusAssinaturaDigitalPorContrato(
  assinaturaIds: string[],
): Promise<Map<string, StatusAssinaturaDigitalResumo>> {
  const map = new Map<string, StatusAssinaturaDigitalResumo>();
  const ids = [...new Set(assinaturaIds.filter(Boolean))];
  for (const id of ids) map.set(id, 'nenhum');
  if (ids.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from('contratos_assinaturas_digitais')
      .select('assinatura_id, status')
      .in('assinatura_id', ids)
      .neq('status', 'cancelado');

    if (error) throw error;

    const porContrato = new Map<string, Pick<AssinaturaDigital, 'status'>[]>();
    for (const row of data || []) {
      const list = porContrato.get(row.assinatura_id) || [];
      list.push({ status: row.status as AssinaturaDigital['status'] });
      porContrato.set(row.assinatura_id, list);
    }
    for (const id of ids) {
      map.set(id, resolverStatusResumoAssinaturaDigital(porContrato.get(id) || []));
    }
  } catch (e) {
    console.warn('[mapaStatusAssinaturaDigitalPorContrato]', e);
  }
  return map;
}

export function formatarStatusAssinaturaDigital(status: AssinaturaDigital['status']): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'pendente':
      return { label: 'Aguardando', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' };
    case 'visualizado':
      return { label: 'Visualizado', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' };
    case 'assinado':
      return { label: 'Assinado ✓', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200' };
    case 'expirado':
      return { label: 'Expirado', color: 'text-gray-500', bgColor: 'bg-gray-50 border-gray-200' };
    case 'cancelado':
      return { label: 'Cancelado', color: 'text-rose-700', bgColor: 'bg-rose-50 border-rose-200' };
    default:
      return { label: status, color: 'text-gray-500', bgColor: 'bg-gray-50 border-gray-200' };
  }
}
