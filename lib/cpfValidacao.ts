/** CPF com 11 dígitos, dígitos verificadores e sem sequência repetida (000…, 111…). */
export function isCpfValido(raw: string): boolean {
  const cpf = String(raw || '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigito = (base: string, fatorInicial: number) => {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) {
      total += Number(base[i]) * (fatorInicial - i);
    }
    const resto = total % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcDigito(cpf.slice(0, 9), 10);
  const d2 = calcDigito(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Aceito para cadastro completo: válido e não placeholder de migração/rascunho. */
export function cpfValidoParaCadastro(cpf: unknown): boolean {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (digits === '00000000000') return false;
  return isCpfValido(digits);
}
