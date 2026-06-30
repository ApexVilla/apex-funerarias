import React from 'react';
import { X, FileText, CheckCircle } from 'lucide-react';
import { ContaPagar } from '../../lib/FinanceiroStore';

interface AcoesContaModalProps {
    conta: ContaPagar;
    onClose: () => void;
    onDetalhes: () => void;
    onBaixar: () => void;
}

export const AcoesContaModal: React.FC<AcoesContaModalProps> = ({ conta, onClose, onDetalhes, onBaixar }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-md shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 border-l-4 border-slate-800 pl-4">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Ações Disponíveis</h3>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">TÍTULO: {conta.codigo}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-200 rounded-md transition text-slate-500 hover:text-slate-800"
                        aria-label="Fechar"
                    >
                        <X className="h-4.5 w-4.5" />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    <button
                        onClick={() => { onDetalhes(); onClose(); }}
                        className="w-full flex items-center gap-3.5 p-3 rounded-md hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition border border-slate-150/40 hover:border-slate-300 group cursor-pointer outline-none"
                    >
                        <div className="p-2 bg-slate-100 text-slate-600 rounded-md group-hover:bg-slate-200 transition">
                            <FileText className="h-4.5 w-4.5 text-slate-700" />
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-800">Ver Detalhes</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Visualizar dados e histórico técnico</p>
                        </div>
                    </button>

                    {['aberto', 'vencido', 'parcial'].includes(conta.status) && (
                        <button
                            onClick={() => { onBaixar(); onClose(); }}
                            className="w-full flex items-center gap-3.5 p-3 rounded-md hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition border border-slate-150/40 hover:border-slate-300 group cursor-pointer outline-none"
                        >
                            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-md group-hover:bg-emerald-100/80 transition border border-emerald-100">
                                <CheckCircle className="h-4.5 w-4.5 text-emerald-800" />
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-800">Baixar Conta</p>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Registrar pagamento na gaveta/banco</p>
                            </div>
                        </button>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-slate-150 bg-slate-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="h-9 px-4 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md text-xs transition cursor-pointer outline-none shadow-sm"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};
