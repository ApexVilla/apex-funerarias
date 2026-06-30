-- Timeline: registrar usuário responsável nos triggers e corrigir registros antigos sem autor.

CREATE OR REPLACE FUNCTION public.fn_trg_timeline_beneficiario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO timeline_clientes (
      empresa_id, cliente_id, tipo_evento, categoria, titulo, dados_novos,
      referencia_tipo, referencia_id, criado_por
    )
    VALUES (
      NEW.empresa_id,
      NEW.cliente_id,
      'beneficiario_inclusao',
      'cadastro',
      'Beneficiário adicionado: ' || NEW.nome || ' (' || NEW.parentesco || ')',
      jsonb_build_object('nome', NEW.nome, 'parentesco', NEW.parentesco, 'data_nascimento', NEW.data_nascimento),
      'beneficiario',
      NEW.id,
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.ativo IS DISTINCT FROM NEW.ativo AND NEW.ativo = false)
       OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('inativo', 'excluido')) THEN
      INSERT INTO timeline_clientes (
        empresa_id, cliente_id, tipo_evento, categoria, titulo, dados_novos,
        referencia_tipo, referencia_id, criado_por
      )
      VALUES (
        NEW.empresa_id,
        NEW.cliente_id,
        'beneficiario_exclusao',
        'cadastro',
        'Beneficiário excluído: ' || NEW.nome,
        jsonb_build_object('motivo', NEW.motivo_exclusao),
        'beneficiario',
        NEW.id,
        auth.uid()
      );
    END IF;

    IF OLD.data_falecimento IS NULL AND NEW.data_falecimento IS NOT NULL THEN
      INSERT INTO timeline_clientes (
        empresa_id, cliente_id, tipo_evento, categoria, titulo, dados_novos,
        referencia_tipo, referencia_id, importante, criado_por
      )
      VALUES (
        NEW.empresa_id,
        NEW.cliente_id,
        'sinistro',
        'atendimento',
        'Falecimento registrado: ' || NEW.nome,
        jsonb_build_object('data_falecimento', NEW.data_falecimento),
        'beneficiario',
        NEW.id,
        true,
        auth.uid()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_timeline_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO timeline_clientes (empresa_id, cliente_id, tipo_evento, categoria, titulo, dados_novos, criado_por)
    VALUES (
      NEW.empresa_id,
      NEW.id,
      'cadastro',
      'cadastro',
      'Cliente cadastrado: ' || NEW.nome,
      to_jsonb(NEW),
      COALESCE(NEW.criado_por_user_id, auth.uid())
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO timeline_clientes (
        empresa_id, cliente_id, tipo_evento, categoria, titulo,
        dados_anteriores, dados_novos, criado_por
      )
      VALUES (
        NEW.empresa_id,
        NEW.id,
        'status',
        'cadastro',
        'Status alterado: ' || COALESCE(OLD.status, 'n/a') || ' → ' || COALESCE(NEW.status, 'n/a'),
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        auth.uid()
      );
    END IF;

    IF OLD.cliente_vip IS DISTINCT FROM NEW.cliente_vip AND NEW.cliente_vip = true THEN
      INSERT INTO timeline_clientes (empresa_id, cliente_id, tipo_evento, categoria, titulo, importante, criado_por)
      VALUES (NEW.empresa_id, NEW.id, 'alteracao', 'cadastro', 'Cliente marcado como VIP ⭐', true, auth.uid());
    END IF;

    IF OLD.bloqueado IS DISTINCT FROM NEW.bloqueado AND NEW.bloqueado = true THEN
      INSERT INTO timeline_clientes (
        empresa_id, cliente_id, tipo_evento, categoria, titulo, dados_novos, importante, criado_por
      )
      VALUES (
        NEW.empresa_id,
        NEW.id,
        'status',
        'cadastro',
        'Cliente BLOQUEADO',
        jsonb_build_object('motivo', NEW.motivo_bloqueio),
        true,
        auth.uid()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;

-- Jane Almeida e demais: preenche autor nos eventos gerados pela proposta (Sarah gerou contrato).
UPDATE public.timeline_clientes t
SET criado_por = a.criado_por
FROM public.timeline_clientes a
WHERE t.cliente_id = 'd4ed2326-c6aa-4acd-bc84-a59468ed7b29'
  AND t.tipo_evento = 'beneficiario_inclusao'
  AND t.criado_por IS NULL
  AND a.cliente_id = t.cliente_id
  AND a.tipo_evento = 'AUDITORIA'
  AND a.referencia_tipo = 'beneficiario'
  AND a.referencia_id = t.referencia_id
  AND a.criado_por IS NOT NULL;

UPDATE public.timeline_clientes
SET criado_por = 'b90067c7-1dd9-4ab1-bc6d-5477252b78b1'
WHERE cliente_id = 'd4ed2326-c6aa-4acd-bc84-a59468ed7b29'
  AND tipo_evento = 'cadastro'
  AND titulo ILIKE '%Jane Almeida%'
  AND criado_por = '04fab772-6188-4174-a11b-891cd3b13414';
