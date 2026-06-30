-- Seeding robusto e automático do Plano de Contas do tipo Passivo para TODAS as empresas cadastradas.
-- Garante a existência do grupo Passivo (2), subgrupos (2.1 e 2.2) e contas finais analíticas (que aceitam lançamento)
-- para permitir o lançamento correto de Contas a Pagar vinculadas ao Passivo.
-- Este script é completamente idempotente (pode ser executado várias vezes sem causar erros ou duplicar registros).

DO $$
DECLARE
    r_empresa RECORD;
    v_passivo_id UUID;
    v_circulante_id UUID;
    v_n_circulante_id UUID;
BEGIN
    -- Loop por todas as empresas cadastradas no sistema
    FOR r_empresa IN SELECT id, nome FROM public.empresas LOOP
        
        RAISE NOTICE 'Verificando/Seeding Passivo para empresa: % (%)', r_empresa.nome, r_empresa.id;

        -- 1. Garante a conta Pai 'Passivo' (Código '2')
        SELECT id INTO v_passivo_id 
        FROM public.fin_plano_contas 
        WHERE empresa_id = r_empresa.id AND codigo = '2';
        
        IF v_passivo_id IS NULL THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2', 'Passivo', 'passivo', 'credora', 1, false, true, true
            ) RETURNING id INTO v_passivo_id;
        ELSE
            -- Garante que esteja ativa e classificada corretamente
            UPDATE public.fin_plano_contas
            SET tipo = 'passivo', natureza = 'credora', ativo = true, aceita_lancamento = false
            WHERE id = v_passivo_id;
        END IF;

        -- 2. Garante o subgrupo 'Passivo Circulante' (Código '2.1')
        SELECT id INTO v_circulante_id 
        FROM public.fin_plano_contas 
        WHERE empresa_id = r_empresa.id AND codigo = '2.1';
        
        IF v_circulante_id IS NULL THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, pai_id, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2.1', 'Passivo Circulante', 'passivo', 'credora', 2, v_passivo_id, false, true, true
            ) RETURNING id INTO v_circulante_id;
        ELSE
            -- Se já existia, garante que o pai e configurações estão corretas
            UPDATE public.fin_plano_contas 
            SET pai_id = v_passivo_id, nivel = 2, tipo = 'passivo', natureza = 'credora', ativo = true, aceita_lancamento = false
            WHERE id = v_circulante_id;
        END IF;

        -- 3. Garante o subgrupo 'Passivo Não Circulante' (Código '2.2')
        SELECT id INTO v_n_circulante_id 
        FROM public.fin_plano_contas 
        WHERE empresa_id = r_empresa.id AND codigo = '2.2';
        
        IF v_n_circulante_id IS NULL THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, pai_id, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2.2', 'Passivo Não Circulante', 'passivo', 'credora', 2, v_passivo_id, false, true, true
            ) RETURNING id INTO v_n_circulante_id;
        ELSE
            -- Se já existia, garante que o pai e configurações estão corretas
            UPDATE public.fin_plano_contas 
            SET pai_id = v_passivo_id, nivel = 2, tipo = 'passivo', natureza = 'credora', ativo = true, aceita_lancamento = false
            WHERE id = v_n_circulante_id;
        END IF;

        -- 4. Garante as contas analíticas (que aceitam lançamentos) sob o Passivo Circulante (2.1)
        
        -- 2.1.01 - Fornecedores
        IF NOT EXISTS (SELECT 1 FROM public.fin_plano_contas WHERE empresa_id = r_empresa.id AND codigo = '2.1.01') THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, pai_id, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2.1.01', 'Fornecedores', 'passivo', 'credora', 3, v_circulante_id, true, true, true
            );
        ELSE
            UPDATE public.fin_plano_contas 
            SET pai_id = v_circulante_id, nivel = 3, tipo = 'passivo', aceita_lancamento = true, ativo = true
            WHERE empresa_id = r_empresa.id AND codigo = '2.1.01';
        END IF;

        -- 2.1.02 - Obrigações Fiscais e Tributárias
        IF NOT EXISTS (SELECT 1 FROM public.fin_plano_contas WHERE empresa_id = r_empresa.id AND codigo = '2.1.02') THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, pai_id, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2.1.02', 'Obrigações Fiscais e Tributárias', 'passivo', 'credora', 3, v_circulante_id, true, true, true
            );
        ELSE
            UPDATE public.fin_plano_contas 
            SET pai_id = v_circulante_id, nivel = 3, tipo = 'passivo', aceita_lancamento = true, ativo = true
            WHERE empresa_id = r_empresa.id AND codigo = '2.1.02';
        END IF;

        -- 2.1.03 - Obrigações Trabalhistas
        IF NOT EXISTS (SELECT 1 FROM public.fin_plano_contas WHERE empresa_id = r_empresa.id AND codigo = '2.1.03') THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, pai_id, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2.1.03', 'Obrigações Trabalhistas', 'passivo', 'credora', 3, v_circulante_id, true, true, true
            );
        ELSE
            UPDATE public.fin_plano_contas 
            SET pai_id = v_circulante_id, nivel = 3, tipo = 'passivo', aceita_lancamento = true, ativo = true
            WHERE empresa_id = r_empresa.id AND codigo = '2.1.03';
        END IF;

        -- 2.1.04 - Outras Obrigações a Pagar
        IF NOT EXISTS (SELECT 1 FROM public.fin_plano_contas WHERE empresa_id = r_empresa.id AND codigo = '2.1.04') THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, pai_id, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2.1.04', 'Outras Obrigações a Pagar', 'passivo', 'credora', 3, v_circulante_id, true, true, true
            );
        ELSE
            UPDATE public.fin_plano_contas 
            SET pai_id = v_circulante_id, nivel = 3, tipo = 'passivo', aceita_lancamento = true, ativo = true
            WHERE empresa_id = r_empresa.id AND codigo = '2.1.04';
        END IF;

        -- 5. Garante as contas analíticas sob o Passivo Não Circulante (2.2)
        
        -- 2.2.01 - Empréstimos e Financiamentos (Longo Prazo)
        IF NOT EXISTS (SELECT 1 FROM public.fin_plano_contas WHERE empresa_id = r_empresa.id AND codigo = '2.2.01') THEN
            INSERT INTO public.fin_plano_contas (
                empresa_id, codigo, nome, tipo, natureza, nivel, pai_id, aceita_lancamento, conta_sistema, ativo
            ) VALUES (
                r_empresa.id, '2.2.01', 'Empréstimos e Financiamentos (Longo Prazo)', 'passivo', 'credora', 3, v_n_circulante_id, true, true, true
            );
        ELSE
            UPDATE public.fin_plano_contas 
            SET pai_id = v_n_circulante_id, nivel = 3, tipo = 'passivo', aceita_lancamento = true, ativo = true
            WHERE empresa_id = r_empresa.id AND codigo = '2.2.01';
        END IF;

    END LOOP;
END $$;
