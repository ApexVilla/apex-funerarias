import React from 'react';
import { AlertTriangle, Palmtree, HeartPulse, UserX, Info } from 'lucide-react';
import { Button } from '../ui/Components';
import type { LoginBlockInativo } from '../../lib/usuarioInativacao';
import { APEX_PLAN_NAME } from '../../lib/apexBranding';

const ICONE_POR_MOTIVO: Record<string, React.ReactNode> = {
    ferias: <Palmtree className="h-10 w-10 text-amber-600" />,
    acidente: <HeartPulse className="h-10 w-10 text-rose-600" />,
    doenca: <HeartPulse className="h-10 w-10 text-violet-600" />,
    normal: <Info className="h-10 w-10 text-slate-600" />,
};

export const UsuarioInativoAviso: React.FC<{
    block: LoginBlockInativo;
    onFechar: () => void;
}> = ({ block, onFechar }) => {
    if (block.estilo === 'simples') {
        return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-6 text-center space-y-3">
                <UserX className="h-10 w-10 text-slate-500 mx-auto" />
                <h3 className="text-lg font-bold text-slate-900">{block.titulo}</h3>
                <p className="text-sm text-slate-600">{block.mensagem}</p>
                <Button type="button" variant="outline" className="w-full" onClick={onFechar}>
                    Voltar ao login
                </Button>
            </div>
        );
    }

    const gradiente =
        block.motivo === 'ferias'
            ? 'from-amber-50 via-orange-50 to-yellow-50 border-amber-200'
            : block.motivo === 'acidente'
              ? 'from-rose-50 via-red-50 to-orange-50 border-rose-200'
              : block.motivo === 'doenca'
                ? 'from-violet-50 via-purple-50 to-indigo-50 border-violet-200'
                : 'from-slate-50 via-blue-50 to-indigo-50 border-slate-200';

    return (
        <div className={`rounded-2xl border bg-gradient-to-br ${gradiente} px-5 py-6 space-y-4 shadow-sm`}>
            <div className="flex flex-col items-center text-center gap-3">
                <div className="h-16 w-16 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm ring-1 ring-black/5">
                    {ICONE_POR_MOTIVO[block.motivo || 'normal'] ?? (
                        <AlertTriangle className="h-10 w-10 text-amber-600" />
                    )}
                </div>
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {APEX_PLAN_NAME}
                    </p>
                    <h3 className="text-xl font-bold text-slate-900 mt-1">{block.titulo}</h3>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed max-w-sm">{block.mensagem}</p>
            </div>
            <Button type="button" className="w-full" onClick={onFechar}>
                Entendi
            </Button>
        </div>
    );
};
