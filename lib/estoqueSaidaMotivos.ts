export const ESTOQUE_SAIDA_MOTIVO_OPTIONS = [
    { value: 'consumo', label: 'Consumo interno' },
    { value: 'atendimento', label: 'Atendimento funerário' },
    { value: 'venda_particular', label: 'Venda particular' },
    { value: 'perda', label: 'Perda / Avaria' },
    { value: 'doacao', label: 'Doação' },
    { value: 'devolucao', label: 'Devolução ao fornecedor' },
    { value: 'ajuste_saldo', label: 'Ajuste de saldo' },
    { value: 'outro', label: 'Outro' },
] as const;

export const ESTOQUE_SAIDA_MOTIVO_LABELS: Record<string, string> = Object.fromEntries(
    ESTOQUE_SAIDA_MOTIVO_OPTIONS.map((o) => [o.value, o.label]),
);
