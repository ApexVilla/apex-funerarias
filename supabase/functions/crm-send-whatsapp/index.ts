import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Conexao = {
  provider: string;
  numero_whatsapp: string;
  instance_key: string | null;
  access_token: string | null;
  webhook_url: string | null;
  status_conexao: "desconectado" | "conectado";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });

const digits = (value: string | null | undefined) => (value || "").replace(/\D/g, "");

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
      global: { headers: { Authorization: authHeader } }
    });
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !authData.user) return json(401, { ok: false, error: "Usuário não autenticado." });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, empresa_id")
      .eq("id", authData.user.id)
      .single();

    if (userErr || !userRow?.empresa_id) {
      return json(403, { ok: false, error: "Usuário sem empresa vinculada." });
    }

    const body = await req.json().catch(() => ({}));
    const clienteId = String(body?.cliente_id || "");
    const mensagem = String(body?.mensagem || "").trim();
    if (!clienteId || !mensagem) return json(400, { ok: false, error: "cliente_id e mensagem são obrigatórios." });

    const { data: cliente, error: clienteErr } = await supabaseAdmin
      .from("clientes")
      .select("id, nome, whatsapp, empresa_id")
      .eq("id", clienteId)
      .eq("empresa_id", userRow.empresa_id)
      .single();

    if (clienteErr || !cliente) return json(404, { ok: false, error: "Cliente não encontrado." });

    const telefoneDestino = digits(cliente.whatsapp);
    if (telefoneDestino.length < 10) {
      return json(400, { ok: false, error: "Cliente sem WhatsApp válido." });
    }

    const { data: conexao, error: conexaoErr } = await supabaseAdmin
      .from("crm_whatsapp_conexoes")
      .select("provider, numero_whatsapp, instance_key, access_token, webhook_url, status_conexao")
      .eq("empresa_id", userRow.empresa_id)
      .maybeSingle();

    if (conexaoErr) return json(500, { ok: false, error: conexaoErr.message });
    if (!conexao || conexao.status_conexao !== "conectado") {
      return json(400, { ok: false, error: "WhatsApp da empresa não está conectado." });
    }

    const cfg = conexao as Conexao;
    const provider = cfg.provider.toLowerCase();
    let upstreamStatus = 0;
    let upstreamBody: unknown = null;

    if (provider.includes("evolution")) {
      if (!cfg.webhook_url || !cfg.instance_key || !cfg.access_token) {
        return json(400, { ok: false, error: "Configuração Evolution incompleta." });
      }
      const base = cfg.webhook_url.replace(/\/$/, "");
      const resp = await fetch(`${base}/message/sendText/${cfg.instance_key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.access_token
        },
        body: JSON.stringify({
          number: telefoneDestino,
          text: mensagem
        })
      });
      upstreamStatus = resp.status;
      upstreamBody = await resp.json().catch(() => null);
    } else if (provider.includes("z-api") || provider.includes("zapi")) {
      if (!cfg.webhook_url || !cfg.access_token) {
        return json(400, { ok: false, error: "Configuração Z-API incompleta." });
      }
      const base = cfg.webhook_url.replace(/\/$/, "");
      const resp = await fetch(`${base}/send-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "client-token": cfg.access_token
        },
        body: JSON.stringify({
          phone: telefoneDestino,
          message: mensagem
        })
      });
      upstreamStatus = resp.status;
      upstreamBody = await resp.json().catch(() => null);
    } else {
      if (!cfg.webhook_url) {
        return json(400, { ok: false, error: "Webhook não configurado para o provedor." });
      }
      const resp = await fetch(cfg.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.access_token ? { Authorization: `Bearer ${cfg.access_token}` } : {})
        },
        body: JSON.stringify({
          to: telefoneDestino,
          message: mensagem,
          cliente_id: cliente.id,
          cliente_nome: cliente.nome
        })
      });
      upstreamStatus = resp.status;
      upstreamBody = await resp.json().catch(() => null);
    }

    if (upstreamStatus < 200 || upstreamStatus >= 300) {
      return json(502, {
        ok: false,
        error: "Falha ao enviar mensagem no provedor.",
        provider: cfg.provider,
        upstream_status: upstreamStatus,
        upstream_body: upstreamBody
      });
    }

    return json(200, {
      ok: true,
      provider: cfg.provider,
      destination: telefoneDestino
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Erro inesperado."
    });
  }
});
