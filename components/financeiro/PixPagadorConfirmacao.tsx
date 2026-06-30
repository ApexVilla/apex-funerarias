import React from 'react';
import { QrCode } from 'lucide-react';
import { Input } from '../ui/Components';
import type { PixPagadorState } from '../../lib/pixPagadorBaixa';

interface PixPagadorConfirmacaoProps {
    visivel: boolean;
    titularNome: string;
    state: PixPagadorState;
    onChange: (next: PixPagadorState) => void;
    idPrefix?: string;
}

export const PixPagadorConfirmacao: React.FC<PixPagadorConfirmacaoProps> = ({
    visivel,
    titularNome,
    state,
    onChange,
    idPrefix = 'pix-pagador',
}) => {
    if (!visivel) return null;

    const checkId = `${idPrefix}-mesmo-pagador`;

    return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800">
                <QrCode className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">Confirmação PIX</span>
            </div>

            <label
                htmlFor={checkId}
                className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg border border-emerald-100 bg-white/80 p-2.5"
            >
                <input
                    id={checkId}
                    type="checkbox"
                    checked={state.pixMesmoPagador}
                    onChange={(e) =>
                        onChange({
                            pixMesmoPagador: e.target.checked,
                            pixNomePagador: e.target.checked ? '' : state.pixNomePagador,
                        })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-800 leading-snug">
                    O PIX foi pago pelo próprio cliente
                    {titularNome ? (
                        <>
                            {' '}
                            <strong className="text-emerald-900">({titularNome})</strong>
                        </>
                    ) : (
                        ' (titular da parcela)'
                    )}
                </span>
            </label>

            {!state.pixMesmoPagador && (
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        Nome do pagador no comprovante PIX *
                    </label>
                    <Input
                        value={state.pixNomePagador}
                        onChange={(e) =>
                            onChange({ ...state, pixNomePagador: e.target.value })
                        }
                        placeholder="Ex.: nome que aparece no extrato / comprovante"
                        className="bg-white"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                        Use quando outra pessoa pagou o PIX em nome do cliente.
                    </p>
                </div>
            )}
        </div>
    );
};
