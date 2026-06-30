import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { unidadeNomeCurto } from './contextoUnidadeLabels';
import { filialCombinaUnidade } from './cobradorUnidadeFiltro';
import {
  filtrarFiliaisParaUsuario,
  usuarioTemEmpresasContextoConfiguradas,
} from './empresasContextoUsuario';
import { podeVerVisaoConsolidadaGrupo } from './perfisContexto';
import { FILIAL_TODAS_ID } from './filialConstants';

export { FILIAL_TODAS_ID } from './filialConstants';

const LS_ID = 'apex_filial_id';
const LS_NOME = 'apex_filial_nome';

export type FilialRow = {
  id: string;
  nome: string;
  ativo: boolean;
};

type FilialContextValue = {
  filiais: FilialRow[];
  loadingFiliais: boolean;
  /** Erro ao buscar filiais (ex.: RLS); vazio se ok. */
  filiaisLoadError: string | null;
  /** id da filial ativa ou `FILIAL_TODAS_ID` */
  filialId: string;
  filialNome: string;
  /** Incrementa ao trocar filial — use como dependência para refetch nas páginas. */
  dataRevision: number;
  isTodasFiliais: boolean;
  podeVerTodasFiliais: boolean;
  setFilial: (id: string, nome: string) => void;
  /** Lê id/nome persistidos sem alterar estado (útil em efeitos). */
  readPersistedFilial: () => { id: string; nome: string };
  /** Recarrega `users`/empresa no auth e busca filiais de novo (útil após troca de empresa no banco). */
  atualizarEmpresaEFiliais: () => Promise<void>;
  atualizandoEmpresaEFiliais: boolean;
  /** Há filiais na empresa, mas o perfil não liberou nenhuma após o filtro por unidade. */
  filiaisBloqueadasPorPermissao: boolean;
};

const FilialContext = createContext<FilialContextValue | null>(null);

function filialPreferidaUsuario(
  list: FilialRow[],
  empresaNome: string,
): FilialRow | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const token = unidadeNomeCurto(empresaNome).toLowerCase();
  if (token) {
    const match = list.find((f) => f.nome.toLowerCase().includes(token));
    if (match) return match;
  }
  return list[0];
}

export const FilialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useAuth();
  const { empresaIdEfetivo, dataRevisionEmpresa, empresasDoGrupo, podeAlternarEmpresa, setEmpresaDoGrupo } =
    useEmpresaContextoAtivo();
  const [filiaisBrutas, setFiliaisBrutas] = useState<FilialRow[]>([]);
  const [loadingFiliais, setLoadingFiliais] = useState(false);
  const [filiaisLoadError, setFiliaisLoadError] = useState<string | null>(null);
  const [filialId, setFilialIdState] = useState('');
  const [filialNome, setFilialNomeState] = useState('');
  const [dataRevision, setDataRevision] = useState(0);
  const [filiaisRefreshKey, setFiliaisRefreshKey] = useState(0);
  const [atualizandoEmpresaEFiliais, setAtualizandoEmpresaEFiliais] = useState(false);
  const prevEmpresaContextoRef = useRef<string>('');

  useEffect(() => {
    if (!empresaIdEfetivo) return;
    if (prevEmpresaContextoRef.current && prevEmpresaContextoRef.current !== empresaIdEfetivo) {
      setDataRevision((x) => x + 1);
    }
    prevEmpresaContextoRef.current = empresaIdEfetivo;
  }, [empresaIdEfetivo]);

  const empresaNomeAtual = useMemo(
    () => empresasDoGrupo.find((e) => e.id === empresaIdEfetivo)?.nome || '',
    [empresasDoGrupo, empresaIdEfetivo],
  );

  const userPermissoes = user?.permissoes as Record<string, unknown> | undefined;
  const restricaoFiliaisPorContexto = usuarioTemEmpresasContextoConfiguradas(userPermissoes);

  const filiais = useMemo(
    () =>
      filtrarFiliaisParaUsuario(filiaisBrutas, empresaNomeAtual, userPermissoes, {
        role: user?.role,
        qtdEmpresasVisiveis: empresasDoGrupo.length,
      }),
    [filiaisBrutas, empresaNomeAtual, userPermissoes, user?.role, empresasDoGrupo.length],
  );

  const podeVerTodasFiliais = useMemo(
    () =>
      podeVerVisaoConsolidadaGrupo(user?.role) &&
      !restricaoFiliaisPorContexto &&
      filiais.length > 1,
    [user?.role, restricaoFiliaisPorContexto, filiais.length],
  );

  /** Remove visão “todas as filiais” persistida se o perfil não pode mais consolidar. */
  useEffect(() => {
    if (!user?.id || podeVerTodasFiliais) return;
    try {
      const id = localStorage.getItem(LS_ID) || '';
      if (id === FILIAL_TODAS_ID) {
        localStorage.removeItem(LS_ID);
        localStorage.removeItem(LS_NOME);
      }
    } catch {
      /* ignore */
    }
  }, [user?.id, user?.role, podeVerTodasFiliais]);

  const isTodasFiliais = filialId === FILIAL_TODAS_ID;

  const readPersistedFilial = useCallback(() => {
    try {
      return {
        id: localStorage.getItem(LS_ID) || '',
        nome: localStorage.getItem(LS_NOME) || '',
      };
    } catch {
      return { id: '', nome: '' };
    }
  }, []);

  const persistFilialLocal = useCallback((id: string, nome: string) => {
    try {
      localStorage.setItem(LS_ID, id);
      localStorage.setItem(LS_NOME, nome);
      setFilialIdState(id);
      setFilialNomeState(nome);
    } catch {
      /* ignore */
    }
  }, []);

  const sincronizarEmpresaComFilial = useCallback(
    (nomeFilial: string) => {
      if (!podeAlternarEmpresa || empresasDoGrupo.length <= 1 || !nomeFilial.trim()) return;
      const empresaAtualNome = empresasDoGrupo.find((e) => e.id === empresaIdEfetivo)?.nome || '';
      const combinaAtual = empresaAtualNome
        ? filialCombinaUnidade(nomeFilial, unidadeNomeCurto(empresaAtualNome))
        : false;
      if (combinaAtual) return;
      const empresaAlvo = empresasDoGrupo.find((e) =>
        filialCombinaUnidade(nomeFilial, unidadeNomeCurto(e.nome)),
      );
      if (empresaAlvo && empresaAlvo.id !== empresaIdEfetivo) {
        setEmpresaDoGrupo(empresaAlvo.id);
      }
    },
    [podeAlternarEmpresa, empresasDoGrupo, empresaIdEfetivo, setEmpresaDoGrupo],
  );

  const setFilial = useCallback((id: string, nome: string) => {
    sincronizarEmpresaComFilial(nome);
    persistFilialLocal(id, nome);
    setDataRevision((x) => x + 1);
    try {
      window.dispatchEvent(new CustomEvent('apex:filial-changed', { detail: { id, nome } }));
    } catch {
      /* ignore */
    }
  }, [persistFilialLocal, sincronizarEmpresaComFilial]);

  const atualizarEmpresaEFiliais = useCallback(async () => {
    setAtualizandoEmpresaEFiliais(true);
    setFiliaisLoadError(null);
    try {
      await refreshUser();
      setFiliaisRefreshKey((k) => k + 1);
      setDataRevision((x) => x + 1);
    } catch (e) {
      console.error('[FilialContext] atualizarEmpresaEFiliais', e);
    } finally {
      setAtualizandoEmpresaEFiliais(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    if (!empresaIdEfetivo) {
      setFiliaisBrutas([]);
      setFiliaisLoadError(null);
      setFilialIdState('');
      setFilialNomeState('');
      return;
    }

    let active = true;
    const load = async () => {
      setLoadingFiliais(true);
      setFiliaisLoadError(null);
      try {
        const { data, error } = await supabase
          .from('filiais')
          .select('id, nome, ativo')
          .eq('empresa_id', empresaIdEfetivo);
        if (!active) return;
        if (error) throw error;
        setFiliaisBrutas((data || []) as FilialRow[]);
      } catch (err) {
        if (active) {
          console.error('[FilialContext] load error:', err);
          setFiliaisLoadError(
            err instanceof Error ? err.message : 'Falha ao ler filiais no banco.'
          );
        }
      } finally {
        if (active) setLoadingFiliais(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [empresaIdEfetivo, filiaisRefreshKey]);

  /** Define seleção inicial quando lista de filiais ou usuário mudam (sem incrementar dataRevision). */
  useEffect(() => {
    if (loadingFiliais || filiaisBrutas.length === 0) return;

    const persisted = readPersistedFilial();
    const list = filiais;

    if (podeVerTodasFiliais && persisted.id === FILIAL_TODAS_ID) {
      setFilialIdState(FILIAL_TODAS_ID);
      setFilialNomeState('Todas');
      return;
    }

    const match = list.find((f) => f.id === persisted.id);
    if (match) {
      sincronizarEmpresaComFilial(match.nome);
      setFilialIdState(match.id);
      setFilialNomeState(match.nome);
      return;
    }

    if (list.length === 0) {
      setFilialIdState('');
      setFilialNomeState('');
      try {
        localStorage.removeItem(LS_ID);
        localStorage.removeItem(LS_NOME);
      } catch {
        /* ignore */
      }
      return;
    }

    const padrao = filialPreferidaUsuario(list, empresaNomeAtual) || list[0];
    persistFilialLocal(padrao.id, padrao.nome);
  }, [
    filiais,
    loadingFiliais,
    podeVerTodasFiliais,
    readPersistedFilial,
    persistFilialLocal,
    empresaNomeAtual,
    filiaisBrutas.length,
    sincronizarEmpresaComFilial,
  ]);

  const filiaisBloqueadasPorPermissao =
    !loadingFiliais && filiaisBrutas.length > 0 && filiais.length === 0;

  const value = useMemo<FilialContextValue>(
    () => ({
      filiais,
      loadingFiliais,
      filiaisLoadError,
      filialId,
      filialNome,
      dataRevision,
      isTodasFiliais,
      podeVerTodasFiliais,
      setFilial,
      readPersistedFilial,
      atualizarEmpresaEFiliais,
      atualizandoEmpresaEFiliais,
      filiaisBloqueadasPorPermissao,
    }),
    [
      filiais,
      loadingFiliais,
      filiaisLoadError,
      filialId,
      filialNome,
      dataRevision,
      isTodasFiliais,
      podeVerTodasFiliais,
      setFilial,
      readPersistedFilial,
      atualizarEmpresaEFiliais,
      atualizandoEmpresaEFiliais,
      filiaisBloqueadasPorPermissao,
    ],
  );

  return <FilialContext.Provider value={value}>{children}</FilialContext.Provider>;
};

export function useFilial() {
  const ctx = useContext(FilialContext);
  if (!ctx) throw new Error('useFilial deve ser usado dentro de FilialProvider');
  return ctx;
}
