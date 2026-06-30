import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { resolverPermissoesUsuarioParaSessao } from './permissoesResolucao';
import { persistLoginBlockInativo } from './usuarioInativacao';
import {
    encerrarSessaoInvalida,
    isAuthRefreshTokenError,
} from './authSessionUtils';

interface UserProfile {
    id: string;
    email: string;
    nome: string;
    role: string;
    roles_extra?: string[];
    empresa_id: string;
    must_change_password?: boolean;
    permissoes?: any;
}

interface Empresa {
    id: string;
    nome: string;
    cnpj?: string | null;
    logo_url: string | null;
}

interface AuthContextType {
    user: UserProfile | null;
    empresa: Empresa | null;
    loading: boolean;
    signOut: () => Promise<void>;
    /** Opcional: sessão recém-retornada por `signInWithPassword` (evita corrida com `getSession()`). */
    refreshUser: (sessionFromSignIn?: Session | null) => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function mergeSessionUserFromProfile(profile: UserProfile) {
    try {
        const prev = JSON.parse(sessionStorage.getItem('user') || '{}');
        sessionStorage.setItem(
            'user',
            JSON.stringify({
                ...prev,
                id: profile.id,
                nome: profile.nome,
                email: profile.email,
                role: profile.role,
            }),
        );
        sessionStorage.setItem('userId', profile.id);
    } catch {
        /* ignore */
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [loading, setLoading] = useState(true);
    const currentUserIdRef = useRef<string | null>(null);
    const currentUserRef = useRef<UserProfile | null>(null);
    const fetchingUserIdRef = useRef<string | null>(null);

    const updateUsuario = useCallback((u: UserProfile | null) => {
        setUser(u);
        currentUserRef.current = u;
        currentUserIdRef.current = u ? u.id : null;
        if (!u) {
            fetchingUserIdRef.current = null;
        }
    }, []);

    /** Serializa todas as cargas de perfil (login + SIGNED_IN + refresh) — evita corrida no celular. */
    const fetchUserChainRef = useRef<Promise<UserProfile | null>>(Promise.resolve(null));

    const fetchUser = useCallback(async (sessionFromSignIn?: Session | null): Promise<UserProfile | null> => {
        const run = async (): Promise<UserProfile | null> => {
            try {
                let session: Session | null =
                    sessionFromSignIn !== undefined ? sessionFromSignIn : null;
                if (!session?.user) {
                    const { data: s0, error: errSession } = await supabase.auth.getSession();
                    if (errSession && isAuthRefreshTokenError(errSession)) {
                        await encerrarSessaoInvalida('Sua sessão expirou. Entre novamente com e-mail e senha.');
                        updateUsuario(null);
                        setEmpresa(null);
                        setLoading(false);
                        return null;
                    }
                    session = s0.session;
                }

                // Se o perfil do mesmo usuário já estiver carregado, evitamos piscar a tela e fazer requisições duplicadas
                if (session?.user?.id && currentUserIdRef.current === session.user.id && currentUserRef.current) {
                    return currentUserRef.current;
                }

                setLoading(true);
                if (session?.user?.id) {
                    fetchingUserIdRef.current = session.user.id;
                }

                if (!session?.user) {
                    const hasAuthToken = Object.keys(localStorage).some(
                        (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
                    );
                    if (!hasAuthToken) {
                        // Sem token no localStorage, o usuário com certeza não está logado.
                        // Evita o backoff lento de 3 segundos.
                        updateUsuario(null);
                        setEmpresa(null);
                        setLoading(false);
                        return null;
                    }
                }

                if (!session?.user) {
                    const { data: userData, error: errUser } = await supabase.auth.getUser();
                    if (errUser && isAuthRefreshTokenError(errUser)) {
                        await encerrarSessaoInvalida('Sua sessão expirou. Entre novamente com e-mail e senha.');
                        updateUsuario(null);
                        setEmpresa(null);
                        setLoading(false);
                        return null;
                    }
                    if (userData.user) {
                        const { data: sUser } = await supabase.auth.getSession();
                        session = sUser.session;
                    }
                }
                if (!session?.user) {
                    // Backoff exponencial: 100ms, 200ms, 400ms, 800ms, 1600ms (máx ~3,1s)
                    for (let i = 0; i < 5; i++) {
                        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, i)));
                        const { data: sn } = await supabase.auth.getSession();
                        if (sn.session?.user) {
                            session = sn.session;
                            break;
                        }
                    }
                }

                if (!session?.user) {
                    console.warn('[Auth] Sem sessão no cliente após tentativas — perfil não carregado.');
                    updateUsuario(null);
                    setEmpresa(null);
                    return null;
                }

                const loadProfileOnce = async () => {
                    const q = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', session.user.id)
                        .maybeSingle();

                    let profileData: typeof q.data = q.data;
                    if (q.error) {
                        console.warn('[Auth] SELECT public.users:', q.error.code, q.error.message);
                    }
                    if (!profileData) {
                        const { data: rpcData, error: rpcError } = await supabase.rpc('fn_auth_bootstrap_perfil');
                        if (rpcError) {
                            console.error('[Auth] fn_auth_bootstrap_perfil:', rpcError.code, rpcError.message);
                        } else {
                            const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
                            profileData = (row ?? null) as typeof q.data;
                        }
                    }
                    return profileData;
                };

                let profileData = await loadProfileOnce();
                const retryDelaysMs = [200, 400, 600, 900, 1200, 1500];
                for (const delay of retryDelaysMs) {
                    if (profileData) break;
                    await new Promise((r) => setTimeout(r, delay));
                    profileData = await loadProfileOnce();
                }

                if (!profileData) {
                    console.error(
                        '[Auth] Perfil ausente após SELECT e fn_auth_bootstrap_perfil. Verifique public.users e auth.users (mesmo id).',
                    );
                    await supabase.auth.signOut();
                    updateUsuario(null);
                    setEmpresa(null);
                    return null;
                }

                const profileRow = profileData as typeof profileData & {
                    permissoes?: Record<string, unknown>;
                    roles_extra?: string[];
                    ativo?: boolean;
                    motivo_inativacao?: string | null;
                };

                if (profileRow.ativo === false) {
                    persistLoginBlockInativo(profileRow.motivo_inativacao);
                    await supabase.auth.signOut();
                    updateUsuario(null);
                    setEmpresa(null);
                    return null;
                }

                const raw =
                    profileRow.permissoes && typeof profileRow.permissoes === 'object' && !Array.isArray(profileRow.permissoes)
                        ? (profileRow.permissoes as Record<string, unknown>)
                        : undefined;
                const profile: UserProfile = {
                    ...profileRow,
                    permissoes: resolverPermissoesUsuarioParaSessao(
                        profileRow.role,
                        raw,
                        profileRow.roles_extra,
                    ) as typeof profileRow.permissoes,
                };
                updateUsuario(profile);
                mergeSessionUserFromProfile(profile);

                if (profile.empresa_id) {
                    const { data: empresaData, error: empresaError } = await supabase
                        .from('empresas')
                        .select('id, nome, cnpj, logo_url')
                        .eq('id', profile.empresa_id)
                        .single();

                    if (empresaError) {
                        console.error('Error fetching empresa data:', empresaError.message, 'Status:', empresaError.code);
                    } else if (empresaData) {
                        setEmpresa(empresaData);
                    }
                } else {
                    setEmpresa(null);
                }

                return profile;
            } catch (error) {
                if (isAuthRefreshTokenError(error)) {
                    await encerrarSessaoInvalida('Sua sessão expirou. Entre novamente com e-mail e senha.');
                    updateUsuario(null);
                    setEmpresa(null);
                    return null;
                }
                console.error('Error fetching auth data:', error);
                try {
                    await new Promise((r) => setTimeout(r, 250));
                    const { data: s1 } = await supabase.auth.getSession();
                    if (!s1.session?.user) throw new Error('no session');
                    const q2 = await supabase.from('users').select('*').eq('id', s1.session.user.id).maybeSingle();
                    let row = q2.data;
                    if (!row) {
                        const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_auth_bootstrap_perfil');
                        if (!rpcErr) {
                            const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
                            row = (rpcRow ?? null) as typeof q2.data;
                        }
                    }
                    if (row) {
                        const profileRow = row as typeof row & {
                            permissoes?: Record<string, unknown>;
                            roles_extra?: string[];
                            ativo?: boolean;
                            motivo_inativacao?: string | null;
                        };
                        if (profileRow.ativo === false) {
                            persistLoginBlockInativo(profileRow.motivo_inativacao);
                            await supabase.auth.signOut();
                            updateUsuario(null);
                            setEmpresa(null);
                            return null;
                        }
                        const raw =
                            profileRow.permissoes &&
                            typeof profileRow.permissoes === 'object' &&
                            !Array.isArray(profileRow.permissoes)
                                ? (profileRow.permissoes as Record<string, unknown>)
                                : undefined;
                        const profile: UserProfile = {
                            ...profileRow,
                            permissoes: resolverPermissoesUsuarioParaSessao(
                                profileRow.role,
                                raw,
                                profileRow.roles_extra,
                            ) as typeof profileRow.permissoes,
                        };
                        updateUsuario(profile);
                        mergeSessionUserFromProfile(profile);
                        if (profile.empresa_id) {
                            const { data: empresaData } = await supabase
                                .from('empresas')
                                .select('id, nome, cnpj, logo_url')
                                .eq('id', profile.empresa_id)
                                .single();
                            if (empresaData) setEmpresa(empresaData);
                        } else {
                            setEmpresa(null);
                        }
                        return profile;
                    }
                } catch {
                    /* segue para signOut */
                }
                await supabase.auth.signOut().catch(() => undefined);
                updateUsuario(null);
                setEmpresa(null);
                return null;
            } finally {
                setLoading(false);
            }
        };

        const chained = fetchUserChainRef.current.then(() => run());
        fetchUserChainRef.current = chained.catch(() => null);
        return chained;
    }, []);

    useEffect(() => {
        const hasAuthToken = Object.keys(localStorage).some(
            (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
        );
        if (hasAuthToken) {
            void import('../components/AuthenticatedShell');
            void import('../pages/InicioModulos');
        }

        // Garante carga inicial mesmo se INITIAL_SESSION atrasar (Firefox / cookies / rede).
        void fetchUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                updateUsuario(null);
                setEmpresa(null);
                setLoading(false);
                return;
            }

            if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                if (session?.user?.id) {
                    if (fetchingUserIdRef.current === session.user.id || currentUserIdRef.current === session.user.id) {
                        return;
                    }
                }
                void fetchUser(session);
                return;
            }

            if (event === 'SIGNED_IN' && session?.user) {
                if (fetchingUserIdRef.current === session.user.id || currentUserIdRef.current === session.user.id) {
                    return;
                }
                void fetchUser(session);
                return;
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [fetchUser]);

    // Aplica permissões imediatamente quando admin altera o perfil do usuário logado, sem esperar logout/reload
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel(`user-perms-sync-${user.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
                (payload) => {
                    const row = payload.new as {
                        role?: string;
                        roles_extra?: string[];
                        permissoes?: Record<string, unknown>;
                    } | null;
                    if (!row || !currentUserRef.current) return;
                    const perms = resolverPermissoesUsuarioParaSessao(
                        row.role ?? currentUserRef.current.role,
                        row.permissoes ?? null,
                        row.roles_extra ?? null,
                    );
                    updateUsuario({
                        ...currentUserRef.current,
                        permissoes: perms,
                        role: row.role ?? currentUserRef.current.role,
                        roles_extra: row.roles_extra ?? currentUserRef.current.roles_extra,
                    });
                },
            )
            .subscribe();

        return () => { void supabase.removeChannel(channel); };
    }, [user?.id, updateUsuario]);

    const signOut = async () => {
        await supabase.auth.signOut();
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('empresa_id');
        sessionStorage.removeItem('userId');
    };

    return (
        <AuthContext.Provider value={{ user, empresa, loading, signOut, refreshUser: fetchUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
