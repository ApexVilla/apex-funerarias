import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { ESTOQUE_SAIDA_MOTIVO_LABELS } from '../../lib/estoqueSaidaMotivos';
import { escapeHtml } from '../../lib/escapeHtml';

type SaidaCompleta = {
    id: string;
    numero_saida: string;
    solicitante: string | null;
    departamento: string | null;
    motivo: string;
    data_saida: string;
    status: string;
    observacoes: string | null;
    processado_em: string | null;
    created_at: string;
    itens: {
        id: string;
        quantidade: number;
        valor_unitario_centavos: number;
        produto_nome: string;
        produto_codigo: string;
        kit_nome?: string | null;
    }[];
};

export const EstoqueSaidaRecibo: React.FC = () => {
    const navigate = useNavigate();
    const { saidaId } = useParams();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [saida, setSaida] = useState<SaidaCompleta | null>(null);
    const [loading, setLoading] = useState(true);
    const [empresaNome, setEmpresaNome] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!user?.empresa_id || !saidaId) return;

            const { data: saidaData, error } = await supabase
                .from('estoque_saidas')
                .select('*')
                .eq('id', saidaId)
                .single();

            if (error || !saidaData) {
                showToast('Saída não encontrada.', 'warning');
                navigate('/estoque/saidas');
                return;
            }

            const { data: empresaData } = await supabase
                .from('empresas')
                .select('nome')
                .eq('id', saidaData.empresa_id)
                .single();
            setEmpresaNome(empresaData?.nome || 'Empresa');

            const { data: itensData } = await supabase
                .from('estoque_saida_itens')
                .select('id, quantidade, valor_unitario_centavos, produto_id, kit_id')
                .eq('saida_id', saidaId);

            const produtoIds = (itensData ?? [])
                .map((i: { produto_id?: string | null }) => i.produto_id)
                .filter(Boolean) as string[];
            const kitIds = (itensData ?? [])
                .map((i: { kit_id?: string | null }) => i.kit_id)
                .filter(Boolean) as string[];

            const { data: produtosData } = produtoIds.length > 0
                ? await supabase.from('ser_produtos').select('id, nome, codigo').in('id', produtoIds)
                : { data: [] };
            const { data: kitsData } = kitIds.length > 0
                ? await supabase.from('estoque_kits').select('id, nome').in('id', kitIds)
                : { data: [] };

            const prodMap = new Map((produtosData ?? []).map((p: { id: string; nome: string; codigo: string }) => [p.id, p]));
            const kitMap = new Map((kitsData ?? []).map((k: { id: string; nome: string }) => [k.id, k]));
            const itensMapped = (itensData ?? []).map((i: {
                id: string;
                quantidade: number;
                valor_unitario_centavos: number;
                produto_id?: string | null;
                kit_id?: string | null;
            }) => {
                if (i.kit_id) {
                    const kit = kitMap.get(i.kit_id);
                    return {
                        id: i.id,
                        quantidade: i.quantidade,
                        valor_unitario_centavos: i.valor_unitario_centavos,
                        produto_nome: kit?.nome ? `Kit: ${kit.nome}` : 'Kit',
                        produto_codigo: 'KIT',
                        kit_nome: kit?.nome ?? null,
                    };
                }
                const prod = prodMap.get(i.produto_id as string);
                return {
                    id: i.id,
                    quantidade: i.quantidade,
                    valor_unitario_centavos: i.valor_unitario_centavos,
                    produto_nome: prod?.nome || '-',
                    produto_codigo: prod?.codigo || '-',
                };
            });

            setSaida({ ...saidaData, itens: itensMapped } as SaidaCompleta);
            setLoading(false);
        };
        void load();
    }, [saidaId, user?.empresa_id, navigate, showToast]);

    const handlePrint = () => {
        if (!saida) return;

        const totalCentavos = saida.itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario_centavos, 0);
        const formatCurrency = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const formatDate = (d: string) => new Date(d.includes('T') ? d : `${d}T00:00:00`).toLocaleDateString('pt-BR');

        const printWindow = window.open('', '_blank', 'width=800,height=900');
        if (!printWindow) {
            showToast('Não foi possível abrir a janela de impressão.', 'warning');
            return;
        }

        const itensHtml = saida.itens.map((item, idx) => `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${idx + 1}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-family:monospace;">${escapeHtml(item.produto_codigo)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escapeHtml(item.produto_nome)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">${Number(item.quantidade)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">${formatCurrency(item.valor_unitario_centavos)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:600;">${formatCurrency(item.quantidade * item.valor_unitario_centavos)}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
    <title>Recibo de Saída - ${escapeHtml(saida.numero_saida)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 32px; max-width: 800px; margin: 0 auto; }
        @page { size: A4; margin: 20mm; }
        @media print { body { padding: 0; } .no-print { display: none !important; } }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #1e40af; }
        .header h1 { font-size: 22px; color: #1e40af; }
        .header .empresa { font-size: 14px; color: #6b7280; margin-top: 4px; }
        .header .numero { text-align: right; }
        .header .numero .badge { background: #1e40af; color: white; padding: 6px 16px; border-radius: 6px; font-size: 16px; font-weight: 700; display: inline-block; }
        .header .numero .data { font-size: 12px; color: #6b7280; margin-top: 6px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
        .info-box .label { font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.5px; }
        .info-box .value { font-size: 14px; font-weight: 600; color: #1f2937; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        thead th { background: #1e40af; color: white; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
        thead th:first-child { border-radius: 8px 0 0 0; }
        thead th:last-child { border-radius: 0 8px 0 0; }
        .total-row td { padding: 12px; font-weight: 700; font-size: 15px; border-top: 2px solid #1e40af; }
        .obs { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; }
        .obs strong { color: #92400e; }
        .footer { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
        .footer .sign { text-align: center; padding-top: 8px; border-top: 1px solid #1f2937; font-size: 12px; color: #6b7280; }
        .rodape { margin-top: 32px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .status-confirmada { background: #dcfce7; color: #166534; }
        .status-rascunho { background: #fef3c7; color: #92400e; }
        .status-cancelada { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Recibo de Saída de Estoque</h1>
            <div class="empresa">${escapeHtml(empresaNome)}</div>
        </div>
        <div class="numero">
            <div class="badge">${escapeHtml(saida.numero_saida)}</div>
            <div class="data">${formatDate(saida.data_saida)}</div>
            <div style="margin-top:6px;"><span class="status-badge status-${escapeHtml(saida.status)}">${escapeHtml(saida.status)}</span></div>
        </div>
    </div>

    <div class="info-grid">
        <div class="info-box">
            <div class="label">Solicitante</div>
            <div class="value">${escapeHtml(saida.solicitante || '-')}</div>
        </div>
        <div class="info-box">
            <div class="label">Depósito</div>
            <div class="value">${escapeHtml(saida.departamento || '-')}</div>
        </div>
        <div class="info-box">
            <div class="label">Motivo</div>
            <div class="value">${escapeHtml(ESTOQUE_SAIDA_MOTIVO_LABELS[saida.motivo] || saida.motivo)}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="text-align:center;width:40px;">#</th>
                <th>Código</th>
                <th>Produto</th>
                <th style="text-align:right;">Qtd</th>
                <th style="text-align:right;">Valor Unit.</th>
                <th style="text-align:right;">Subtotal</th>
            </tr>
        </thead>
        <tbody>
            ${itensHtml}
            <tr class="total-row">
                <td colspan="5" style="text-align:right;">TOTAL:</td>
                <td style="text-align:right;">${formatCurrency(totalCentavos)}</td>
            </tr>
        </tbody>
    </table>

    ${saida.observacoes ? `<div class="obs"><strong>Observações:</strong> ${escapeHtml(saida.observacoes)}</div>` : ''}

    <div class="footer">
        <div>
            <div class="sign">Responsável pelo Estoque</div>
        </div>
        <div>
            <div class="sign">Recebedor / Solicitante</div>
        </div>
    </div>

    <div class="rodape">
        Documento gerado em ${new Date().toLocaleString('pt-BR')} · ${escapeHtml(empresaNome)} · Sistema de Gestão de Estoque
    </div>

    <script>
        window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
    </script>
</body>
</html>`;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    };

    if (loading || !saida) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-500">
                Carregando recibo...
            </div>
        );
    }

    const totalCentavos = saida.itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario_centavos, 0);
    const formatCurrency = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Recibo - ${saida.numero_saida}`}
                subtitle="Visualização do recibo de saída de estoque"
                actionButton={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => navigate('/estoque/saidas')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                        <Button onClick={handlePrint}>
                            <Printer className="h-4 w-4 mr-2" />
                            Imprimir Recibo
                        </Button>
                    </div>
                }
            />

            <Card className="p-6">
                <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-blue-600">
                    <div>
                        <h2 className="text-xl font-bold text-blue-700">Recibo de Saída de Estoque</h2>
                        <p className="text-sm text-gray-500 mt-1">{empresaNome}</p>
                    </div>
                    <div className="text-right">
                        <span className="bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-lg">{saida.numero_saida}</span>
                        <p className="text-xs text-gray-500 mt-2">
                            {new Date(`${saida.data_saida}T00:00:00`).toLocaleDateString('pt-BR')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-50 border rounded-lg p-3">
                        <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Solicitante</div>
                        <div className="font-semibold text-slate-900 mt-1">{saida.solicitante || '-'}</div>
                    </div>
                    <div className="bg-slate-50 border rounded-lg p-3">
                        <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Depósito</div>
                        <div className="font-semibold text-slate-900 mt-1">{saida.departamento || '-'}</div>
                    </div>
                    <div className="bg-slate-50 border rounded-lg p-3">
                        <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Motivo</div>
                        <div className="font-semibold text-slate-900 mt-1">{ESTOQUE_SAIDA_MOTIVO_LABELS[saida.motivo] || saida.motivo}</div>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-blue-700 text-white">
                                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">#</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Código</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Produto</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">Qtd</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">Valor Unit.</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {saida.itens.map((item, idx) => (
                                <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="px-3 py-2 text-sm text-center">{idx + 1}</td>
                                    <td className="px-3 py-2 text-sm font-mono">{item.produto_codigo}</td>
                                    <td className="px-3 py-2 text-sm font-medium">{item.produto_nome}</td>
                                    <td className="px-3 py-2 text-sm text-right">{Number(item.quantidade)}</td>
                                    <td className="px-3 py-2 text-sm text-right">{formatCurrency(item.valor_unitario_centavos)}</td>
                                    <td className="px-3 py-2 text-sm text-right font-semibold">{formatCurrency(item.quantidade * item.valor_unitario_centavos)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-blue-600">
                                <td colSpan={5} className="px-3 py-3 text-right font-bold text-base">TOTAL:</td>
                                <td className="px-3 py-3 text-right font-bold text-base text-blue-700">{formatCurrency(totalCentavos)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {saida.observacoes && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                        <strong className="text-amber-800">Observações:</strong> {saida.observacoes}
                    </div>
                )}

                <div className="mt-12 grid grid-cols-2 gap-12">
                    <div className="text-center pt-2 border-t border-gray-900">
                        <span className="text-xs text-gray-500">Responsável pelo Estoque</span>
                    </div>
                    <div className="text-center pt-2 border-t border-gray-900">
                        <span className="text-xs text-gray-500">Recebedor / Solicitante</span>
                    </div>
                </div>

                <p className="mt-8 text-center text-[10px] text-gray-400 border-t pt-3">
                    Documento gerado em {new Date().toLocaleString('pt-BR')} · {empresaNome} · Sistema de Gestão de Estoque
                </p>
            </Card>
        </div>
    );
};
