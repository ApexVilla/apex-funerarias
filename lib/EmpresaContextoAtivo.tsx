import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { podeVerVisaoConsolidadaGrupo } from './perfisContexto';
import {
  podeAlternarEstabelecimentoUsuario,
  filtrarEmpresasGrupoParaUsuario,
  usuarioTemEmpresasContextoConfiguradas,
} from './empresasContextoUsuario';

const SS_KEY = 'apex_empresa_modulos_contexto_id';
const SS_TODAS_UNIDADES = 'apex_visao_todas_empresas_grupo';

export function podeAlternarEmpresaDoGrupo(role?: string | null): boolean {
  return podeVerVisaoConsolidadaGrupo(role);
}

type EmpresaGrupoRow = { id: string; nome: string };

type EmpresaContextoAtivoValue = {
  empresaIdEfetivo: string;
  empresasDoGrupo: EmpresaGrupoRow[];
  loadingEmpresasGrupo: boolean;
  podeAlternarEmpresa: boolean;
  empresaSelecionadaId: string;
  setEmpresaDoGrupo: (id: string) => void;
  visaoTodasEmpresasGrupo: boolean;
  setVisaoTodasEmpresasGrupo: (v: boolean) => void;
  empresaIdsParaFiltro: string[];
  dataRevisionEmpresa: number;
};

const EmpresaContextoAtivoContext = createContext<EmpresaContextoAtivoValue | null>(null);

export const EmpresaContextoAtivoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [empresasGrupoRpc, setEmpresasGrupoRpc] = useState<EmpresaGrupoRow[]>([]);
  const [loadingEmpresasGrupo, setLoadingEmpresasGrupo] = useState(false);
  const [empresasCarregadas, setEmpresasCarregadas] = useState(false);
  const [dataRevisionEmpresa, setDataRevisionEmpresa] = useState(0);

  // Inicialização síncrona dos estados lendo do localStorage (persistente) e sessionStorage (legado)
  const [empresaSelecionadaId, setEmpresaSelecionadaId] = useState(() => {
    try {
      return (localStorage.getItem(SS_KEY) || sessionStorage.getItem(SS_KEY) || '').trim();
    } catch {
      return '';
    }
  });

  const [visaoTodasEmpresasGrupo, setVisaoTodasEmpresasGrupoState] = useState(() => {
    try {
      return (
        localStorage.getItem(SS_TODAS_UNIDADES) === '1' ||
        sessionStorage.getItem(SS_TODAS_UNIDADES) === '1'
      );
    } catch {
      return false;
    }
  });

  const userPermissoes = user?.permissoes as Record<string, unknown> | undefined;
  const restricaoEmpresasContexto = usuarioTemEmpresasContextoConfiguradas(userPermissoes);

  const empresasDoGrupo = useMemo(
    () =>
      filtrarEmpresasGrupoParaUsuario(
        empresasGrupoRpc,
        userPermissoes,
        (user?.empresa_id || '').trim(),
        user?.role,
      ),
    [empresasGrupoRpc, userPermissoes, user?.empresa_id, user?.role],
  );

  const podeTrocarUnidade = useMemo(
    () => podeAlternarEstabelecimentoUsuario(empresasDoGrupo, userPermissoes, user?.role),
    [empresasDoGrupo, userPermissoes, user?.role],
  );

  // Busca inicial das empresas do grupo
  useEffect(() => {
    if (!user?.id) {
      setEmpresasGrupoRpc([]);
      setLoadingEmpresasGrupo(false);
      setEmpresasCarregadas(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingEmpresasGrupo(true);
      try {
        const { data, error } = await supabase.rpc('fn_empresas_do_meu_grupo');
        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setEmpresasGrupoRpc([]);
        } else {
          const porId = new Map<string, string>();
          for (const r of data as { id?: string; nome?: string }[]) {
            if (!r?.id) continue;
            const id = String(r.id);
            if (!porId.has(id)) porId.set(id, String(r.nome || id));
          }
          setEmpresasGrupoRpc([...porId.entries()].map(([id, nome]) => ({ id, nome })));
        }
      } catch {
        if (!cancelled) setEmpresasGrupoRpc([]);
      } finally {
        if (!cancelled) {
          setLoadingEmpresasGrupo(false);
          setEmpresasCarregadas(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.empresa_id]);

  /** Limpa seleção persistida se não pertence às unidades permitidas.
   *  SÓ executa quando as empresas de fato carregarem, para evitar limpezas indevidas durante a montagem assíncrona.
   */
  useEffect(() => {
    if (!user?.id || !empresasCarregadas || empresasDoGrupo.length === 0) return;
    try {
      const stored = (localStorage.getItem(SS_KEY) || sessionStorage.getItem(SS_KEY) || '').trim();
      if (stored && !empresasDoGrupo.some((e) => e.id === stored)) {
        localStorage.removeItem(SS_KEY);
        sessionStorage.removeItem(SS_KEY);
        localStorage.removeItem(SS_TODAS_UNIDADES);
        sessionStorage.removeItem(SS_TODAS_UNIDADES);
      }
    } catch {
      /* ignore */
    }
  }, [user?.id, empresasCarregadas, empresasDoGrupo]);

  /** Sem permissão de troca: fixa na unidade permitida e limpa sessão antiga. */
  useEffect(() => {
    if (!user?.id || !empresasCarregadas) return;
    if (podeTrocarUnidade) return;
    if (restricaoEmpresasContexto && empresasDoGrupo.length === 0) return; // Wait for companies list to load
    const base = (
      restricaoEmpresasContexto
        ? (empresasDoGrupo[0]?.id || '')
        : (user?.empresa_id || '')
    ).trim();
    if (!base) return;
    try {
      localStorage.removeItem(SS_KEY);
      sessionStorage.removeItem(SS_KEY);
      localStorage.removeItem(SS_TODAS_UNIDADES);
      sessionStorage.removeItem(SS_TODAS_UNIDADES);
      localStorage.setItem('empresa_id', base);
      sessionStorage.setItem('empresa_id', base);
      const raw = sessionStorage.getItem('user');
      const localUser = raw ? JSON.parse(raw) : null;
      if (localUser && typeof localUser === 'object') {
        sessionStorage.setItem('user', JSON.stringify({ ...localUser, empresa_id: base }));
      }
    } catch {
      /* ignore */
    }
    setVisaoTodasEmpresasGrupoState(false);
    setEmpresaSelecionadaId(base);
  }, [user?.id, user?.empresa_id, podeTrocarUnidade, empresasCarregadas, empresasDoGrupo, restricaoEmpresasContexto]);

  // Sincroniza e garante unidade selecionada válida
  useEffect(() => {
    if (!empresasCarregadas) return;
    const base = (user?.empresa_id || '').trim();
    if (!base) {
      setEmpresaSelecionadaId('');
      return;
    }
    if (!podeTrocarUnidade || empresasDoGrupo.length <= 1) {
      const fixa = restricaoEmpresasContexto
        ? empresasDoGrupo[0]?.id || ''
        : empresasDoGrupo.find((e) => e.id === base)?.id || empresasDoGrupo[0]?.id || base;
      setEmpresaSelecionadaId(fixa);
      return;
    }
    if (empresasDoGrupo.length === 0) return;

    let fromStorage = '';
    try {
      fromStorage = (localStorage.getItem(SS_KEY) || sessionStorage.getItem(SS_KEY) || '').trim();
    } catch {
      /* ignore */
    }
    const valid =
      fromStorage && empresasDoGrupo.some((e) => e.id === fromStorage)
        ? fromStorage
        : empresasDoGrupo.find((e) => e.id === base)?.id || empresasDoGrupo[0]?.id || '';
    setEmpresaSelecionadaId(valid);
    if (valid && valid !== fromStorage) {
      try {
        localStorage.setItem(SS_KEY, valid);
        sessionStorage.setItem(SS_KEY, valid);
        localStorage.setItem('empresa_id', valid);
        sessionStorage.setItem('empresa_id', valid);
      } catch {
        /* ignore */
      }
    }
  }, [user?.empresa_id, podeTrocarUnidade, empresasCarregadas, empresasDoGrupo, restricaoEmpresasContexto]);

  /** Restaura visão consolidada só se o usuário confirmou "Todas as unidades" (não força por perfil). */
  useEffect(() => {
    if (!empresasCarregadas) return;
    if (!podeTrocarUnidade || empresasDoGrupo.length <= 1) {
      setVisaoTodasEmpresasGrupoState(false);
      return;
    }
    if (empresasDoGrupo.length === 0) return;

    try {
      const rawLocal = localStorage.getItem(SS_TODAS_UNIDADES);
      const rawSession = sessionStorage.getItem(SS_TODAS_UNIDADES);
      const todas = rawLocal === '1' || rawSession === '1';
      setVisaoTodasEmpresasGrupoState(todas);
    } catch {
      setVisaoTodasEmpresasGrupoState(false);
    }
  }, [podeTrocarUnidade, empresasCarregadas, empresasDoGrupo]);

  const empresaIdEfetivo = useMemo(() => {
    const base = (user?.empresa_id || '').trim();
    if (!base && empresasDoGrupo.length === 0) return '';
    if (!podeTrocarUnidade || empresasDoGrupo.length <= 1) {
      if (restricaoEmpresasContexto) {
        return empresasDoGrupo[0]?.id || '';
      }
      return empresasDoGrupo.find((e) => e.id === base)?.id || empresasDoGrupo[0]?.id || base;
    }
    const sel = (empresaSelecionadaId || '').trim();
    if (sel && empresasDoGrupo.some((e) => e.id === sel)) return sel;
    if (restricaoEmpresasContexto) {
      return empresasDoGrupo[0]?.id || '';
    }
    return empresasDoGrupo.find((e) => e.id === base)?.id || empresasDoGrupo[0]?.id || '';
  }, [
    user?.empresa_id,
    podeTrocarUnidade,
    empresasDoGrupo,
    empresaSelecionadaId,
    restricaoEmpresasContexto,
  ]);

  const empresaIdsParaFiltro = useMemo(() => {
    if (visaoTodasEmpresasGrupo && podeTrocarUnidade && empresasDoGrupo.length > 1) {
      return empresasDoGrupo.map((e) => e.id);
    }
    const id = empresaIdEfetivo.trim();
    return id ? [id] : [];
  }, [visaoTodasEmpresasGrupo, podeTrocarUnidade, empresasDoGrupo, empresaIdEfetivo]);

  const setVisaoTodasEmpresasGrupo = useCallback(
    (v: boolean) => {
      if (!podeTrocarUnidade || empresasDoGrupo.length <= 1) return;
      try {
        if (v) {
          localStorage.setItem(SS_TODAS_UNIDADES, '1');
          sessionStorage.setItem(SS_TODAS_UNIDADES, '1');
        } else {
          localStorage.removeItem(SS_TODAS_UNIDADES);
          sessionStorage.removeItem(SS_TODAS_UNIDADES);
        }
      } catch {
        /* ignore */
      }
      setVisaoTodasEmpresasGrupoState(v);
      setDataRevisionEmpresa((x) => x + 1);
      try {
        window.dispatchEvent(
          new CustomEvent('apex:empresa-contexto-changed', { detail: { visaoTodas: v } }),
        );
      } catch {
        /* ignore */
      }
    },
    [podeTrocarUnidade, empresasDoGrupo.length],
  );

  const setEmpresaDoGrupo = useCallback(
    (id: string) => {
      if (!podeTrocarUnidade) return;
      if (!empresasDoGrupo.some((e) => e.id === id)) return;
      try {
        localStorage.setItem(SS_TODAS_UNIDADES, '0');
        sessionStorage.setItem(SS_TODAS_UNIDADES, '0');
      } catch {
        /* ignore */
      }
      setVisaoTodasEmpresasGrupoState(false);
      try {
        localStorage.setItem(SS_KEY, id);
        sessionStorage.setItem(SS_KEY, id);
        localStorage.setItem('empresa_id', id);
        sessionStorage.setItem('empresa_id', id);
        const raw = sessionStorage.getItem('user');
        const localUser = raw ? JSON.parse(raw) : {};
        if (localUser && typeof localUser === 'object') {
          sessionStorage.setItem('user', JSON.stringify({ ...localUser, empresa_id: id }));
        }
      } catch {
        /* ignore */
      }
      setEmpresaSelecionadaId(id);
      setDataRevisionEmpresa((x) => x + 1);
      try {
        window.dispatchEvent(new CustomEvent('apex:empresa-contexto-changed', { detail: { id } }));
      } catch {
        /* ignore */
      }
    },
    [podeTrocarUnidade, empresasDoGrupo],
  );

  useEffect(() => {
    if (!empresaIdEfetivo || !user?.id) return;
    try {
      localStorage.setItem('empresa_id', empresaIdEfetivo);
      sessionStorage.setItem('empresa_id', empresaIdEfetivo);
      const raw = sessionStorage.getItem('user');
      const localUser = raw ? JSON.parse(raw) : {};
      if (localUser && typeof localUser === 'object') {
        sessionStorage.setItem(
          'user',
          JSON.stringify({ ...localUser, id: user.id, empresa_id: empresaIdEfetivo }),
        );
      }
    } catch {
      /* ignore */
    }
  }, [empresaIdEfetivo, user?.id]);

  const podeAlternarEmpresa = podeTrocarUnidade;

  const value = useMemo<EmpresaContextoAtivoValue>(
    () => ({
      empresaIdEfetivo,
      empresasDoGrupo,
      loadingEmpresasGrupo,
      podeAlternarEmpresa,
      empresaSelecionadaId: (empresaSelecionadaId || '').trim() || empresaIdEfetivo,
      setEmpresaDoGrupo,
      visaoTodasEmpresasGrupo,
      setVisaoTodasEmpresasGrupo,
      empresaIdsParaFiltro,
      dataRevisionEmpresa,
    }),
    [
      empresaIdEfetivo,
      empresasDoGrupo,
      loadingEmpresasGrupo,
      podeAlternarEmpresa,
      empresaSelecionadaId,
      setEmpresaDoGrupo,
      visaoTodasEmpresasGrupo,
      setVisaoTodasEmpresasGrupo,
      empresaIdsParaFiltro,
      dataRevisionEmpresa,
    ],
  );

  return (
    <EmpresaContextoAtivoContext.Provider value={value}>{children}</EmpresaContextoAtivoContext.Provider>
  );
};

export function useEmpresaContextoAtivo(): EmpresaContextoAtivoValue {
  const ctx = useContext(EmpresaContextoAtivoContext);
  if (!ctx) {
    throw new Error('useEmpresaContextoAtivo deve ser usado dentro de EmpresaContextoAtivoProvider');
  }
  return ctx;
}
