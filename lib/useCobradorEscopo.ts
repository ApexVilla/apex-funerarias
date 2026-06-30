import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  resolverCobradorIdDoUsuario,
  usuarioEhCobradorCampoRestrito,
  usuarioPodeVerTodosCobradores,
} from './cobradorUsuarioLink';

/** Escopo do usuário logado no módulo de cobradores (próprio vs todos). */
export function useCobradorEscopo(empresaIds: string[]) {
  const { user } = useAuth();
  const podeVerTodos = usuarioPodeVerTodosCobradores(user?.role);
  const cobradorRestrito = usuarioEhCobradorCampoRestrito(user?.role);
  const [meuCobradorId, setMeuCobradorId] = useState<string | null>(null);
  const [vinculoLoading, setVinculoLoading] = useState(false);

  useEffect(() => {
    if (!cobradorRestrito || !user?.id || empresaIds.length === 0) {
      setMeuCobradorId(null);
      return;
    }
    let cancelled = false;
    setVinculoLoading(true);
    void (async () => {
      try {
        const id = await resolverCobradorIdDoUsuario({
          empresaIds,
          usuarioId: user.id,
          email: user.email,
          nome: user.nome,
        });
        if (!cancelled) setMeuCobradorId(id);
      } catch {
        if (!cancelled) setMeuCobradorId(null);
      } finally {
        if (!cancelled) setVinculoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cobradorRestrito, user?.id, user?.email, user?.nome, empresaIds.join(',')]);

  return {
    user,
    podeVerTodos,
    cobradorRestrito,
    meuCobradorId,
    vinculoLoading,
  };
}
