/** Link interno para fluxo de recebimento / baixa (HashRouter). */
export function montarLinkPagamentoInterno(params: {
  clienteNome?: string;
  parcelaId?: string;
  clienteId?: string;
}): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const q = new URLSearchParams();
  if (params.parcelaId) q.set('parcela', params.parcelaId);
  if (params.clienteId) q.set('cliente', params.clienteId);
  if (params.clienteNome?.trim()) q.set('search', params.clienteNome.trim());
  const qs = q.toString();
  return `${base}#/financeiro/baixa-parcelas${qs ? `?${qs}` : ''}`;
}

export function montarUrlQrCode(texto: string, tamanho = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${tamanho}x${tamanho}&data=${encodeURIComponent(texto)}`;
}
