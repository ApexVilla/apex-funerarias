/** Linha de dependente no cadastro de cliente/contrato (não usar em Nova Proposta). */

export type BeneficiarioLinhaForm = {
    /** Quando preenchido, o dependente já está no banco — filiação não deve ser revalidada/alterada. */
    id?: string;
    nome?: string;
    parentesco?: string;
    data_nascimento?: string;
    data_inclusao?: string;
    cpf?: string;
    rg?: string;
};

export function beneficiarioLinhaTemAlgumDado(b: BeneficiarioLinhaForm): boolean {
    return Boolean(
        (b.nome || '').trim() ||
            (b.cpf || '').replace(/\D/g, '') ||
            (b.data_nascimento || '').trim() ||
            (b.rg || '').trim(),
    );
}

/** Só exige nome e parentesco se a linha tiver algum dado preenchido. */
export function mensagemErroBeneficiarioLinhaOpcional(
    b: BeneficiarioLinhaForm,
    indice: number,
): string | null {
    if (!beneficiarioLinhaTemAlgumDado(b)) return null;
    const n = indice + 1;
    if (!(b.nome || '').trim()) {
        return `Informe o nome do dependente #${n} ou remova a linha vazia.`;
    }
    if (!(b.parentesco || '').trim()) {
        return `Selecione o parentesco do dependente #${n}.`;
    }
    return null;
}

export function validarBeneficiariosOpcionais(
    lista: BeneficiarioLinhaForm[],
    _dataInicioContrato?: string,
): string | null {
    for (let i = 0; i < lista.length; i++) {
        const msg = mensagemErroBeneficiarioLinhaOpcional(lista[i], i);
        if (msg) return msg;
    }
    return null;
}
