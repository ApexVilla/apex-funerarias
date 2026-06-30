import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Landmark,
    HandCoins,
    FileText,
    Settings,
    Receipt,
    ArrowDownCircle,
    ArrowUpCircle,
    Minus,
    Plus,
    Lock,
    Unlock,
} from 'lucide-react';
import { DropdownMenuContent, DropdownMenuItem } from '../ui/Components';
import { type ContaBancaria } from '../../lib/FinanceiroStore';
import { usuarioPodeOperarConta, usuarioPodeTransferirConta } from '../../lib/contaBancariaPermissoes';

export type ContaBancariaMenuVariant = 'contas' | 'tesouraria';

type Props = {
    conta: ContaBancaria;
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number } | null;
    variant: ContaBancariaMenuVariant;
    sessaoAberta?: boolean;
    userId?: string;
    isGestor?: boolean;
    onExtrato?: () => void;
    onEditar?: () => void;
    onVerMovimentos?: () => void;
    onEntrada?: () => void;
    onSaida?: () => void;
    onSangria?: () => void;
    onSuprimento?: () => void;
    onAbrirCaixa?: () => void;
    onFecharCaixa?: () => void;
};

export const ContaBancariaMenuAcoes: React.FC<Props> = ({
    conta,
    isOpen,
    onClose,
    position,
    variant,
    sessaoAberta = false,
    userId,
    isGestor = false,
    onExtrato,
    onEditar,
    onVerMovimentos,
    onEntrada,
    onSaida,
    onSangria,
    onSuprimento,
    onAbrirCaixa,
    onFecharCaixa,
}) => {
    const navigate = useNavigate();
    const podeOperar = usuarioPodeOperarConta(conta, userId, isGestor);
    const podeTransferir = usuarioPodeTransferirConta(conta, userId, isGestor);
    const ehCaixa = conta.tipo === 'caixa' || conta.tipo === 'corrente';

    const fechar = () => onClose();

    if (!isOpen || !position) return null;

    return (
        <DropdownMenuContent isOpen={isOpen} onClose={fechar} position={position}>
            <div className="px-3 py-2 border-b mb-1 min-w-[200px]">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ações</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{conta.nome}</p>
                <p className="text-[11px] text-gray-400 font-mono">{conta.codigo}</p>
            </div>

            {variant === 'contas' && (
                <>
                    <DropdownMenuItem
                        onClick={() => {
                            navigate(`/financeiro/tesouraria?contaId=${conta.id}`);
                            fechar();
                        }}
                    >
                        <Landmark className="h-4 w-4 mr-2" />
                        Tesouraria
                    </DropdownMenuItem>
                    {ehCaixa && podeOperar && (
                        <DropdownMenuItem
                            onClick={() => {
                                navigate(`/financeiro/baixa-parcelas?contaId=${conta.id}`);
                                fechar();
                            }}
                        >
                            <HandCoins className="h-4 w-4 mr-2" />
                            Baixa de parcelas
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        onClick={() => {
                            onExtrato?.();
                            fechar();
                        }}
                    >
                        <FileText className="h-4 w-4 mr-2" />
                        Extrato
                    </DropdownMenuItem>
                    {isGestor && (
                        <DropdownMenuItem
                            onClick={() => {
                                onEditar?.();
                                fechar();
                            }}
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Editar / Usuários
                        </DropdownMenuItem>
                    )}
                    {!podeOperar && (
                        <div className="px-4 py-2 text-xs text-amber-700 border-t">
                            Sem permissão para operar este caixa.
                        </div>
                    )}
                </>
            )}

            {variant === 'tesouraria' && (
                <>
                    {sessaoAberta ? (
                        <>
                            {onVerMovimentos && (
                                <DropdownMenuItem onClick={() => { onVerMovimentos(); fechar(); }}>
                                    <Receipt className="h-4 w-4 mr-2" /> Ver movimentos
                                </DropdownMenuItem>
                            )}
                            {podeOperar && onEntrada && (
                                <DropdownMenuItem onClick={() => { onEntrada(); fechar(); }}>
                                    <ArrowDownCircle className="h-4 w-4 mr-2" /> Lançar entrada
                                </DropdownMenuItem>
                            )}
                            {podeOperar && onSaida && (
                                <DropdownMenuItem onClick={() => { onSaida(); fechar(); }}>
                                    <ArrowUpCircle className="h-4 w-4 mr-2" /> Lançar saída
                                </DropdownMenuItem>
                            )}
                            {podeOperar && podeTransferir && onSangria && (
                                <DropdownMenuItem onClick={() => { onSangria(); fechar(); }}>
                                    <Minus className="h-4 w-4 mr-2" /> Sangria
                                </DropdownMenuItem>
                            )}
                            {podeOperar && podeTransferir && onSuprimento && (
                                <DropdownMenuItem onClick={() => { onSuprimento(); fechar(); }}>
                                    <Plus className="h-4 w-4 mr-2" /> Suprimento
                                </DropdownMenuItem>
                            )}
                            {podeOperar && onFecharCaixa && (
                                <DropdownMenuItem variant="danger" onClick={() => { onFecharCaixa(); fechar(); }}>
                                    <Lock className="h-4 w-4 mr-2" /> Fechar o dia
                                </DropdownMenuItem>
                            )}
                        </>
                    ) : (
                        podeOperar && onAbrirCaixa && (
                            <DropdownMenuItem onClick={() => { onAbrirCaixa(); fechar(); }}>
                                <Unlock className="h-4 w-4 mr-2" /> Abrir caixa
                            </DropdownMenuItem>
                        )
                    )}
                    {!podeOperar && (
                        <div className="px-4 py-2 text-xs text-amber-700">
                            Sem permissão para operar este caixa.
                        </div>
                    )}
                </>
            )}
        </DropdownMenuContent>
    );
};
