-- Copia plano de contas (naturezas financeiras): Fenix de Aparecida → Fenix de Ipameri.
-- Idempotente: insere contas ausentes por código e alinha pai/nível das já existentes.

DO $$
DECLARE
    v_src uuid := '04d81f24-6712-4929-a329-b01d369fe8cb'; -- Fenix de Aparecida
    v_dst uuid := 'a1c5a3c4-39d9-4191-ad5c-244d827eb52e'; -- Fenix de Ipameri
    r RECORD;
    v_pai_id uuid;
    v_pai_codigo text;
BEGIN
    -- 1) Inserir contas que ainda não existem em Ipameri (pais antes dos filhos).
    FOR r IN
        SELECT *
        FROM public.fin_plano_contas
        WHERE empresa_id = v_src
        ORDER BY nivel, codigo
    LOOP
        IF EXISTS (
            SELECT 1
            FROM public.fin_plano_contas
            WHERE empresa_id = v_dst
              AND codigo = r.codigo
        ) THEN
            CONTINUE;
        END IF;

        v_pai_id := NULL;
        IF r.pai_id IS NOT NULL THEN
            SELECT p.codigo
            INTO v_pai_codigo
            FROM public.fin_plano_contas p
            WHERE p.id = r.pai_id;

            IF v_pai_codigo IS NOT NULL THEN
                SELECT id
                INTO v_pai_id
                FROM public.fin_plano_contas
                WHERE empresa_id = v_dst
                  AND codigo = v_pai_codigo;
            END IF;
        END IF;

        INSERT INTO public.fin_plano_contas (
            empresa_id,
            codigo,
            nome,
            tipo,
            natureza,
            nivel,
            pai_id,
            aceita_lancamento,
            conta_sistema,
            ativo
        ) VALUES (
            v_dst,
            r.codigo,
            r.nome,
            r.tipo,
            r.natureza,
            r.nivel,
            v_pai_id,
            r.aceita_lancamento,
            r.conta_sistema,
            r.ativo
        );
    END LOOP;

    -- 2) Alinhar contas já existentes (hierarquia, nomes e flags).
    UPDATE public.fin_plano_contas dst
    SET
        nome = src.nome,
        tipo = src.tipo,
        natureza = src.natureza,
        nivel = src.nivel,
        aceita_lancamento = src.aceita_lancamento,
        conta_sistema = src.conta_sistema,
        ativo = src.ativo,
        pai_id = pai_dst.id,
        updated_at = now()
    FROM public.fin_plano_contas src
    LEFT JOIN public.fin_plano_contas src_pai
        ON src_pai.id = src.pai_id
    LEFT JOIN public.fin_plano_contas pai_dst
        ON pai_dst.empresa_id = v_dst
       AND pai_dst.codigo = src_pai.codigo
    WHERE dst.empresa_id = v_dst
      AND src.empresa_id = v_src
      AND dst.codigo = src.codigo;
END $$;
