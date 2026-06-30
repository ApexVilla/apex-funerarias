import { useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';

/** Empresa(s) ativas para listagens de estoque — alinhado ao seletor do header. */
export function useEstoqueEmpresaScope() {
    const { user } = useAuth();
    const { empresaIdEfetivo, empresaIdsParaFiltro, dataRevisionEmpresa } = useEmpresaContextoAtivo();

    const empresaId = empresaIdEfetivo || user?.empresa_id || '';

    const empresaIds = useMemo(() => {
        const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
        if (ids.length > 0) return ids;
        return empresaId ? [empresaId] : [];
    }, [empresaIdsParaFiltro, empresaId]);

    return { empresaId, empresaIds, dataRevisionEmpresa };
}
