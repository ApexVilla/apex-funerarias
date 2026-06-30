/** Motivos de desativação de usuário (gestão em Configurações → Usuários). */
export type MotivoInativacao =
    | 'ferias'
    | 'desligamento'
    | 'acidente'
    | 'doenca'
    | 'normal';

export const MOTIVOS_INATIVACAO: { value: MotivoInativacao; label: string; descricao: string }[] = [
    { value: 'desligamento', label: 'Desligamento', descricao: 'Encerramento de vínculo com a empresa' },
    { value: 'ferias', label: 'Férias', descricao: 'Afastamento temporário — férias' },
    { value: 'acidente', label: 'Acidente', descricao: 'Afastamento por acidente de trabalho ou similar' },
    { value: 'doenca', label: 'Doença', descricao: 'Afastamento por motivo de saúde' },
    { value: 'normal', label: 'Desativação normal', descricao: 'Outro motivo administrativo' },
];

export const LOGIN_BLOCK_STORAGE_KEY = 'funeraria_login_block_inativo';

export type LoginBlockInativo = {
    titulo: string;
    mensagem: string;
    motivo: MotivoInativacao | null;
    /** Desligamento: mensagem simples; demais: layout destacado */
    estilo: 'simples' | 'destaque';
};

export function labelMotivoInativacao(motivo?: string | null): string {
    if (!motivo) return 'Inativo';
    return MOTIVOS_INATIVACAO.find((m) => m.value === motivo)?.label ?? 'Inativo';
}

export function mensagemLoginUsuarioInativo(motivo?: string | null): LoginBlockInativo {
    const m = (motivo || 'normal') as MotivoInativacao;

    if (m === 'desligamento') {
        return {
            titulo: 'Usuário desativado',
            mensagem: 'Seu acesso ao sistema foi desativado.',
            motivo: 'desligamento',
            estilo: 'simples',
        };
    }

    if (m === 'ferias') {
        return {
            titulo: 'Acesso em férias',
            mensagem:
                'Você está em período de férias e seu acesso ao sistema está temporariamente suspenso. ' +
                'Ao retornar, solicite a reativação ao seu gestor ou ao RH.',
            motivo: 'ferias',
            estilo: 'destaque',
        };
    }

    if (m === 'acidente') {
        return {
            titulo: 'Afastamento temporário',
            mensagem:
                'Seu acesso está suspenso por afastamento (acidente). ' +
                'Desejamos melhoras! Para reativar o acesso, entre em contato com o RH ou a administração.',
            motivo: 'acidente',
            estilo: 'destaque',
        };
    }

    if (m === 'doenca') {
        return {
            titulo: 'Afastamento por saúde',
            mensagem:
                'Seu acesso está suspenso por afastamento médico. Cuide-se! ' +
                'Para reativar, procure o RH ou a administração da sua unidade.',
            motivo: 'doenca',
            estilo: 'destaque',
        };
    }

    return {
        titulo: 'Conta desativada',
        mensagem:
            'Sua conta está desativada no momento. Entre em contato com o administrador do sistema ' +
            'ou com o RH da sua unidade para mais informações.',
        motivo: 'normal',
        estilo: 'destaque',
    };
}

export function persistLoginBlockInativo(motivo?: string | null): void {
    try {
        const block = mensagemLoginUsuarioInativo(motivo);
        sessionStorage.setItem(LOGIN_BLOCK_STORAGE_KEY, JSON.stringify(block));
    } catch {
        /* ignore */
    }
}

export function readLoginBlockInativo(): LoginBlockInativo | null {
    try {
        const raw = sessionStorage.getItem(LOGIN_BLOCK_STORAGE_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(LOGIN_BLOCK_STORAGE_KEY);
        return JSON.parse(raw) as LoginBlockInativo;
    } catch {
        return null;
    }
}

export function motivoInativacaoValido(motivo: string | null | undefined): motivo is MotivoInativacao {
    return MOTIVOS_INATIVACAO.some((m) => m.value === motivo);
}
