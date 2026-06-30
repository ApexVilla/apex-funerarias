// LEGADO — não usado pelo app React. O frontend usa lib/usePrintCaixa.ts (PDF no navegador).
// hooks/usePrintCaixa.ts
// Abre o PDF do caixa numa nova aba (ou força download).
// Chama a rota Slim 4:  GET /financeiro/caixa/:id/imprimir

import { useState } from "react";

export function usePrintCaixa() {
  const [loading, setLoading] = useState(false);

  async function imprimirCaixa(caixaId: number) {
    setLoading(true);
    try {
      const token = localStorage.getItem("token") ?? "";

      const res = await fetch(`/api/financeiro/caixa/${caixaId}/imprimir`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro ?? "Falha ao gerar PDF");
      }

      // Cria URL temporária e abre numa nova aba
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");

      // Libera memória após 60s
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return { imprimirCaixa, loading };
}

/* ──────────────────────────────────────────────────────
   Exemplo de uso num componente:

   import { usePrintCaixa } from "@/hooks/usePrintCaixa";

   function BotaoImprimir({ caixaId }: { caixaId: number }) {
     const { imprimirCaixa, loading } = usePrintCaixa();
     return (
       <button
         onClick={() => imprimirCaixa(caixaId)}
         disabled={loading}
       >
         {loading ? "Gerando PDF…" : "🖨 Imprimir Caixa"}
       </button>
     );
   }
────────────────────────────────────────────────────── */
