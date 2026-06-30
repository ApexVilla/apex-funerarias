import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRelatorios, RelatorioConfig, RelatorioParamSpec } from '../../lib/RelatoriosStore';
import { resolveEmpresaIdForRelatorios } from '../../lib/relatorioEmpresaId';
import { Card, Button } from '../../components/ui/Components';
import {
    ArrowLeft, Download, RefreshCw,
    FileText, Filter, AlertCircle, CheckCircle,
    Printer,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { buildVisualizationPlan } from '../../lib/relatorioChartInference';
import { RelatorioResultDashboard } from '../../components/relatorios/RelatorioResultDashboard';
import { loadPickOptionsForParam, PickOption } from '../../lib/relatorioPickOptions';
import {
    findDepartamentoLikeColumn,
    uniqueColumnValues,
} from '../../lib/relatorioResultRowFilter';

export const RelatorioView: React.FC = () => {
    const { codigo } = useParams<{ codigo: string }>();
    const navigate = useNavigate();
    const { relatorios, executarRelatorio, currentResult, executing, error } = useRelatorios();
    const [relatorio, setRelatorio] = useState<RelatorioConfig | null>(null);

    // Dynamic form state
    const [params, setParams] = useState<Record<string, string>>({});
    const [pickOptions, setPickOptions] = useState<Record<string, PickOption[]>>({});
    /** Refina linhas do resultado quando a API devolve coluna de departamento / centro / setor. */
    const [resultDeptoVal, setResultDeptoVal] = useState('');

    useEffect(() => {
        if (relatorios.length > 0 && codigo) {
            const found = relatorios.find(r => r.codigo === codigo);
            if (found) {
                setRelatorio(found);
                // Initialize params with defaults
                const initialParams: Record<string, string> = {};
                found.parametros?.forEach(p => {
                    if (p.default) initialParams[p.name] = String(p.default);
                    if (p.type === 'date' && !p.default) {
                        // Default to current month for start/end dates
                        const now = new Date();
                        if (p.name.includes('inicio')) {
                            initialParams[p.name] = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                        } else if (p.name.includes('fim')) {
                            initialParams[p.name] = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                        } else {
                            initialParams[p.name] = now.toISOString().split('T')[0];
                        }
                    }
                });
                setParams(initialParams);
            }
        }
    }, [relatorios, codigo]);

    useEffect(() => {
        setResultDeptoVal('');
    }, [currentResult?.gerado_em]);

    useEffect(() => {
        if (!relatorio) return;
        let cancelled = false;
        (async () => {
            const empresaId = await resolveEmpresaIdForRelatorios();
            if (!empresaId || cancelled) return;
            const acc: Record<string, PickOption[]> = {};
            for (const p of relatorio.parametros || []) {
                if (!p.pickFrom) continue;
                acc[p.name] = await loadPickOptionsForParam(p, empresaId);
            }
            if (!cancelled) setPickOptions(acc);
        })();
        return () => {
            cancelled = true;
        };
    }, [relatorio?.id]);

    const dadosBrutos = currentResult?.status === 'sucesso' ? currentResult.dados : null;

    const deptoColKey = useMemo(() => {
        if (!Array.isArray(dadosBrutos) || dadosBrutos.length === 0) return null;
        const first = dadosBrutos[0];
        if (!first || typeof first !== 'object') return null;
        return findDepartamentoLikeColumn(first as Record<string, unknown>);
    }, [dadosBrutos]);

    const dadosFiltrados = useMemo(() => {
        if (!Array.isArray(dadosBrutos)) return dadosBrutos;
        if (!deptoColKey || !resultDeptoVal) return dadosBrutos;
        return dadosBrutos.filter(
            (r) => String((r as Record<string, unknown>)[deptoColKey]) === resultDeptoVal
        );
    }, [dadosBrutos, deptoColKey, resultDeptoVal]);

    const dadosParaExibir = useMemo(() => {
        if (!Array.isArray(dadosBrutos)) return dadosBrutos;
        return dadosFiltrados;
    }, [dadosBrutos, dadosFiltrados]);

    const deptoOpcoes = useMemo(() => {
        if (!deptoColKey || !Array.isArray(dadosBrutos)) return [];
        return uniqueColumnValues(dadosBrutos as Record<string, unknown>[], deptoColKey);
    }, [dadosBrutos, deptoColKey]);

    const handleExecute = () => {
        if (relatorio) {
            executarRelatorio(relatorio, params);
        }
    };

    const handleExportPDF = () => {
        if (!currentResult?.dados || !relatorio) return;

        const doc = new jsPDF();

        // Header
        doc.setFontSize(18);
        doc.text(relatorio.nome, 14, 22);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 30);

        // Params info
        let y = 40;
        // doc.text(`Parâmetros: ${JSON.stringify(params)}`, 14, 38);

        // Table: exporta o mesmo conjunto exibido (inclui refinamento por departamento, se houver)
        const exportSource =
            Array.isArray(dadosBrutos) && Array.isArray(dadosParaExibir) ? dadosParaExibir : currentResult.dados;
        const data = Array.isArray(exportSource) ? exportSource : [exportSource];
        if (data.length > 0) {
            const keys = Object.keys(data[0]);
            const tableData = data.map((item: any) => keys.map(k => {
                const val = item[k];
                if (typeof val === 'object') return JSON.stringify(val);
                return val;
            }));

            autoTable(doc, {
                head: [keys],
                body: tableData,
                startY: y,
                theme: 'striped',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [41, 128, 185] }
            });
        }

        doc.save(`${relatorio.codigo}_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleExportExcel = () => {
        if (!currentResult?.dados || !relatorio) return;

        const exportSource =
            Array.isArray(dadosBrutos) && Array.isArray(dadosParaExibir) ? dadosParaExibir : currentResult.dados;
        const data = Array.isArray(exportSource) ? exportSource : [exportSource];
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Relatório");
        XLSX.writeFile(wb, `${relatorio.codigo}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const renderResult = () => {
        if (executing) {
            return (
                <div className="flex flex-col items-center justify-center p-12 text-slate-600">
                    <RefreshCw className="h-10 w-10 animate-spin mb-4 text-blue-500" />
                    <p>Processando dados...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 flex items-center gap-3">
                    <AlertCircle className="h-6 w-6" />
                    <div>
                        <h4 className="font-semibold">Erro na execução</h4>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            );
        }

        if (!currentResult) {
            return (
                <div className="text-center py-12 text-slate-600 border-2 border-dashed border-slate-300 rounded-lg bg-white">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>Configure os filtros acima e clique em "Gerar Relatório" para visualizar os dados.</p>
                </div>
            );
        }

        const { dados } = currentResult;

        if (!dados || (Array.isArray(dados) && dados.length === 0)) {
            return (
                <div className="p-8 text-center text-slate-600 bg-slate-50 rounded-lg border border-slate-200">
                    Nenhum dado encontrado para os filtros selecionados.
                </div>
            );
        }

        const vizPlan = buildVisualizationPlan(dadosParaExibir, relatorio!);
        if (vizPlan.placeholderMessage) {
            return (
                <div className="p-8 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-center max-w-lg mx-auto">
                    <p className="text-sm font-medium">{vizPlan.placeholderMessage}</p>
                    <p className="text-xs text-amber-700 mt-2">Quando a fonte de dados estiver ativa, o painel e a tabela serão exibidos aqui.</p>
                </div>
            );
        }

        if (
            Array.isArray(dadosParaExibir) &&
            dadosParaExibir.length === 0 &&
            Array.isArray(dadosBrutos) &&
            dadosBrutos.length > 0
        ) {
            return (
                <div className="p-6 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-center text-sm">
                    Nenhum registro corresponde ao refinamento por{' '}
                    <span className="text-slate-900 font-medium">{deptoColKey?.replace(/_/g, ' ')}</span>.
                    Escolha outro valor ou limpe o filtro.
                </div>
            );
        }

        // Se o resultado for um objeto complexo (ex: DRE com nested JSONs), tratamos diferente
        // Mas para MVP, assumimos array de objetos flat ou objeto único
        const rows = Array.isArray(dadosParaExibir) ? dadosParaExibir : dadosParaExibir ? [dadosParaExibir] : [];
        if (rows.length === 0) {
            return (
                <div className="p-8 text-center text-slate-600 bg-slate-50 rounded-lg border border-slate-200">
                    Nenhum dado encontrado para os filtros selecionados.
                </div>
            );
        }
        const columns = Object.keys(rows[0]);

        // Simple auto-formatting for currency/dates
        const formatCell = (key: string, value: any) => {
            if (key.includes('centavos') && typeof value === 'number') {
                return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
            }
            if ((key.includes('data') || key.includes('created_at')) && typeof value === 'string' && value.length > 10) {
                return new Date(value).toLocaleDateString('pt-BR');
            }
            if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
            if (typeof value === 'object') return JSON.stringify(value); // Fallback for nested objects
            return value;
        };

        return (
            <div className="space-y-6">
                {deptoColKey && deptoOpcoes.length > 1 && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-sm text-slate-600 shrink-0">
                            Refinar por <span className="text-slate-900">{deptoColKey.replace(/_/g, ' ')}</span>
                        </span>
                        <select
                            value={resultDeptoVal}
                            onChange={(e) => setResultDeptoVal(e.target.value)}
                            className="max-w-md bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">Todos</option>
                            {deptoOpcoes.map((op) => (
                                <option key={op} value={op}>
                                    {op}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <RelatorioResultDashboard dados={dadosParaExibir} relatorio={relatorio!} />
                <div>
                    {vizPlan.showDashboard && (
                        <h4 className="text-sm font-medium text-slate-600 mb-2">Dados detalhados</h4>
                    )}
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-sm text-left text-slate-700">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                                <tr>
                                    {columns.map(col => (
                                        <th key={col} className="px-6 py-3 font-medium whitespace-nowrap">
                                            {col.replace(/_/g, ' ')}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, idx) => (
                                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                        {columns.map(col => (
                                            <td key={col} className="px-6 py-4 whitespace-nowrap text-slate-700">
                                                {formatCell(col, row[col])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="p-3 bg-slate-50 text-xs text-slate-600 text-right border-t border-slate-200">
                            Mostrando {rows.length} registros
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (!relatorio) {
        return <div className="p-8 text-slate-700">Carregando configuração...</div>;
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
            <div className="mb-6">
                <button
                    onClick={() => navigate('/relatorios')}
                    className="flex items-center text-slate-600 hover:text-slate-900 transition-colors mb-4"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar para Lista
                </button>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">{relatorio.nome}</h1>
                        {relatorio.descricao && (
                            <p className="text-sm text-slate-600 mt-1 max-w-3xl">{relatorio.descricao}</p>
                        )}
                    </div>
                    {currentResult?.status === 'sucesso' && (
                        <div className="flex flex-wrap gap-2 shrink-0">
                            <Button
                                variant="outline"
                                onClick={handleExportPDF}
                                className="flex items-center gap-2 border-slate-300 text-slate-700 hover:bg-slate-100"
                            >
                                <Printer className="h-4 w-4" />
                                PDF
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleExportExcel}
                                className="flex items-center gap-2 border-slate-300 text-slate-700 hover:bg-slate-100"
                            >
                                <Download className="h-4 w-4" />
                                Excel
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar Filters */}
                <div className="lg:col-span-1 space-y-4">
                    <Card className="p-4 sticky top-6">
                        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            Filtros
                        </h3>

                        <div className="space-y-4">
                            {relatorio.parametros?.map((param: RelatorioParamSpec) => (
                                <div key={param.name}>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        {param.label || param.name.replace(/_/g, ' ')}
                                        {param.optional ? (
                                            <span className="text-slate-500 font-normal"> (opcional)</span>
                                        ) : null}
                                    </label>
                                    {param.type === 'date' ? (
                                        <input
                                            type="date"
                                            value={params[param.name] || ''}
                                            onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                                            className="w-full bg-white border border-slate-300 rounded p-2 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    ) : param.type === 'number' ? (
                                        <input
                                            type="number"
                                            value={params[param.name] || ''}
                                            onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                                            className="w-full bg-white border border-slate-300 rounded p-2 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    ) : param.type === 'uuid' && param.pickFrom ? (
                                        <select
                                            value={params[param.name] || ''}
                                            onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                                            className="w-full bg-white border border-slate-300 rounded p-2 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="">
                                                {param.optional ? 'Todas as opções' : 'Selecione…'}
                                            </option>
                                            {(pickOptions[param.name] || []).map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={params[param.name] || ''}
                                            onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                                            className="w-full bg-white border border-slate-300 rounded p-2 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder={`Informe ${param.name}`}
                                        />
                                    )}
                                </div>
                            ))}

                            {(!relatorio.parametros || relatorio.parametros.length === 0) && (
                                <p className="text-sm text-slate-500 italic">
                                    Este relatório não possui filtros configuráveis.
                                </p>
                            )}

                            <Button
                                onClick={handleExecute}
                                className="w-full flex justify-center items-center gap-2 mt-4"
                                disabled={executing}
                            >
                                {executing ? 'Gerando...' : 'Gerar Relatório'}
                                {!executing && <CheckCircle className="h-4 w-4" />}
                            </Button>
                        </div>
                    </Card>
                </div>

                {/* Results Area */}
                <div className="lg:col-span-3">
                    <Card className="min-h-[500px] p-0 overflow-hidden">
                        {currentResult && (
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <div className="text-xs text-slate-600">
                                    Gerado em: {new Date(currentResult.gerado_em).toLocaleString()}
                                </div>
                                {/* Future: Refresh interval toggle */}
                            </div>
                        )}
                        <div className="p-4">
                            {renderResult()}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
