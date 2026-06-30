import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

type EmitirBoletoBody = {
  boleto_integracao_id: string;
  mensalidade_id: string;
  assinatura_id: string;
  cliente: {
    nome: string;
    documento: string;
    email?: string | null;
    telefone?: string | null;
  };
  cobranca: {
    valor_centavos: number;
    vencimento: string;
    descricao?: string | null;
  };
};

const onlyDigits = (v: string | null | undefined) => (v || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método não permitido." });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
      return json(401, { ok: false, error: "Contexto de autenticação inválido." });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !authData.user) {
      return json(401, { ok: false, error: "Usuário não autenticado." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = (await req.json().catch(() => ({}))) as Partial<EmitirBoletoBody>;

    if (!body?.boleto_integracao_id || !body?.mensalidade_id || !body?.assinatura_id) {
      return json(400, { ok: false, error: "boleto_integracao_id, mensalidade_id e assinatura_id são obrigatórios." });
    }
    if (!body?.cliente?.nome || !body?.cliente?.documento) {
      return json(400, { ok: false, error: "Dados do cliente obrigatórios." });
    }
    if (!body?.cobranca?.valor_centavos || !body?.cobranca?.vencimento) {
      return json(400, { ok: false, error: "Dados de cobrança obrigatórios." });
    }

    const providerBaseUrl = Deno.env.get("BOLETO_PROVIDER_BASE_URL") || "";
    const providerToken = Deno.env.get("BOLETO_PROVIDER_TOKEN") || "";
    const providerName = Deno.env.get("BOLETO_PROVIDER_NAME") || "gateway_mock";

    let providerResponse: Record<string, unknown> = {};
    let status: "emitido" | "erro_emissao" = "emitido";
    let mensagemErro: string | null = null;

    if (!providerBaseUrl || !providerToken) {
      providerResponse = {
        provider: providerName,
        modo: "simulado",
        nosso_numero: `${body.mensalidade_id.slice(0, 8)}${Date.now().toString().slice(-6)}`,
        linha_digitavel: "34191.79001 01043.510047 91020.150008 9 91630026000",
        codigo_barras: "34199916300026000017900101043510049102015000",
        url_boleto: null,
        url_pdf: null,
      };
    } else {
      const upstream = await fetch(`${providerBaseUrl.replace(/\/$/, "")}/boletos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerToken}`,
        },
        body: JSON.stringify({
          referencia_id: body.boleto_integracao_id,
          assinatura_id: body.assinatura_id,
          mensalidade_id: body.mensalidade_id,
          cliente: {
            nome: body.cliente.nome,
            documento: onlyDigits(body.cliente.documento),
            email: body.cliente.email || undefined,
            telefone: onlyDigits(body.cliente.telefone),
          },
          cobranca: {
            valor_centavos: body.cobranca.valor_centavos,
            vencimento: body.cobranca.vencimento,
            descricao: body.cobranca.descricao || `Mensalidade ${body.mensalidade_id}`,
          },
        }),
      });

      const upstreamBody = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        status = "erro_emissao";
        mensagemErro = typeof upstreamBody?.error === "string" ? upstreamBody.error : "Falha ao emitir boleto no provedor.";
      }
      providerResponse = upstreamBody as Record<string, unknown>;
    }

    const updatePayload = {
      status,
      provedor: providerName,
      nosso_numero: (providerResponse.nosso_numero as string) || null,
      linha_digitavel: (providerResponse.linha_digitavel as string) || null,
      codigo_barras: (providerResponse.codigo_barras as string) || null,
      url_boleto: (providerResponse.url_boleto as string) || null,
      url_pdf: (providerResponse.url_pdf as string) || null,
      payload_retorno: providerResponse,
      mensagem_erro: mensagemErro,
      emitido_em: status === "emitido" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("fin_boletos_integracao")
      .update(updatePayload)
      .eq("id", body.boleto_integracao_id);

    if (updateError) {
      return json(500, { ok: false, error: updateError.message });
    }

    return json(200, {
      ok: true,
      status,
      provedor: providerName,
      boleto_integracao_id: body.boleto_integracao_id,
      boleto: {
        nosso_numero: updatePayload.nosso_numero,
        linha_digitavel: updatePayload.linha_digitavel,
        codigo_barras: updatePayload.codigo_barras,
        url_boleto: updatePayload.url_boleto,
        url_pdf: updatePayload.url_pdf,
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Erro inesperado.",
    });
  }
});
