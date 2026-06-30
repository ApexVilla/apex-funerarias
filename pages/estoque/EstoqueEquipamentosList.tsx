import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Plus, Edit, RefreshCw, Trash2, Settings, History, UserPlus, X, Search, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, DropdownMenuContent, DropdownMenuItem, Input, Label } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { escapeHtml } from '../../lib/escapeHtml';

type Equipamento = {
    id: string;
    nome: string;
    codigo: string;
    numero_serie: string;
    marca: string;
    modelo: string;
    status: 'ativo' | 'manutencao' | 'baixado';
    localizacao: string;
    responsavel?: string;
    data_aquisicao: string;
};

export const EstoqueEquipamentosList: React.FC = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
    const [loading, setLoading] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
    const [vincularModalOpen, setVincularModalOpen] = useState(false);
    const [vincularId, setVincularId] = useState<string | null>(null);
    const [responsavelName, setResponsavelName] = useState('');

    // Filters and Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;

    const loadEquipamentos = useCallback(async () => {
        if (!empresaIdOperacao) return;
        setLoading(true);
        const empresaIds = empresaIdsFiltro;
        const { data, error } = await supabase
            .from('estoque_equipamentos')
            .select('*')
            .in('empresa_id', empresaIds)
            .is('deleted_at', null)
            .order('nome', { ascending: true });

        if (error) {
            showToast(`Erro ao carregar equipamentos: ${error.message}`, 'error');
        } else {
            setEquipamentos((data as Equipamento[]) || []);
        }
        setLoading(false);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, showToast]);

    useEffect(() => {
        loadEquipamentos();
    }, [loadEquipamentos]);

    const openRowMenu = (id: string, event: React.MouseEvent) => {
        setSelectedId(id);
        setOpenMenuId(id);
        setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
    };

    const equipamentosView = useMemo(() => {
        let filtered = [...equipamentos];
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(e => 
                e.nome.toLowerCase().includes(lower) || 
                e.codigo?.toLowerCase().includes(lower) ||
                e.responsavel?.toLowerCase().includes(lower) ||
                e.marca?.toLowerCase().includes(lower) ||
                e.modelo?.toLowerCase().includes(lower)
            );
        }
        return filtered;
    }, [equipamentos, searchTerm]);

    const totalPages = Math.ceil(equipamentosView.length / PAGE_SIZE);
    const paginatedEquipamentos = equipamentosView.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [searchTerm]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ativo': return <Badge variant="success">Ativo</Badge>;
            case 'manutencao': return <Badge variant="warning">Em Manutenção</Badge>;
            case 'baixado': return <Badge variant="danger">Baixado</Badge>;
            default: return <Badge>{status}</Badge>;
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este equipamento?')) return;

        const { error } = await supabase
            .from('estoque_equipamentos')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        } else {
            showToast('Equipamento excluído com sucesso');
            loadEquipamentos();
        }
    };

    const openVincularModal = (id: string, currentResponsavel: string = '') => {
        setVincularId(id);
        setResponsavelName(currentResponsavel);
        setVincularModalOpen(true);
        setOpenMenuId(null);
    };

    const handleVincular = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!vincularId) return;

        setLoading(true);
        const { error } = await supabase
            .from('estoque_equipamentos')
            .update({ responsavel: responsavelName })
            .eq('id', vincularId);

        if (error) {
            showToast(`Erro ao vincular: ${error.message}`, 'error');
        } else {
            showToast('Responsável vinculado com sucesso!');
            setVincularModalOpen(false);
            loadEquipamentos();
        }
        setLoading(false);
    };

    const handlePrintEtiqueta = (equipamento: Equipamento) => {
        const codigo = escapeHtml(equipamento.codigo || 'SEM-CODIGO');
        const nome = escapeHtml(equipamento.nome || '-');
        const serie = escapeHtml(equipamento.numero_serie || '-');
        const marcaModelo = escapeHtml([equipamento.marca, equipamento.modelo].filter(Boolean).join(' / ') || '-');

        const printWindow = window.open('', '_blank', 'width=420,height=620');
        if (!printWindow) {
            showToast('Não foi possível abrir a janela de impressão.', 'warning');
            return;
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Etiqueta ${codigo}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 12px; }
                    .etiqueta {
                        width: 320px;
                        border: 2px solid #111827;
                        border-radius: 8px;
                        padding: 12px;
                    }
                    .titulo { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
                    .codigo {
                        font-size: 24px;
                        font-weight: 800;
                        text-align: center;
                        border: 1px dashed #111827;
                        border-radius: 6px;
                        padding: 10px 8px;
                        margin-bottom: 10px;
                        letter-spacing: 1px;
                    }
                    .linha { font-size: 12px; margin: 4px 0; }
                    .rodape { margin-top: 10px; font-size: 10px; color: #4b5563; }
                </style>
            </head>
            <body>
                <div class="etiqueta">
                    <div class="titulo">Etiqueta de Identificação de Equipamento</div>
                    <div class="codigo">${codigo}</div>
                    <div class="linha"><strong>Equipamento:</strong> ${nome}</div>
                    <div class="linha"><strong>Série:</strong> ${serie}</div>
                    <div class="linha"><strong>Marca/Modelo:</strong> ${marcaModelo}</div>
                    <div class="rodape">Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
                </div>
                <script>
                    window.onload = function () {
                        window.print();
                        window.onafterprint = function () { window.close(); };
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setOpenMenuId(null);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Equipamentos"
                subtitle="Controle de ativos e equipamentos da empresa"
                actionButton={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={loadEquipamentos} loading={loading}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Atualizar
                        </Button>
                        <Button onClick={() => navigate('/estoque/equipamentos/novo')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Equipamento
                        </Button>
                    </div>
                }
            />

            {/* Filtros */}
            <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar por nome, código, marca, modelo ou responsável..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </Card>

            <div className="list-table-shell">
                <div className="overflow-x-auto">
                    <table className="list-table">
                        <thead>
                            <tr>
                                <th>Cód. Patrimônio</th>
                                <th>Equipamento</th>
                                <th>Marca/Modelo</th>
                                <th>Departamento</th>
                                <th>Responsável</th>
                                <th>Série</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedEquipamentos.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-gray-500">
                                        Nenhum equipamento encontrado.
                                    </td>
                                </tr>
                            ) : (
                                paginatedEquipamentos.map((item) => (
                                    <tr 
                                        key={item.id}
                                        onClick={() => setSelectedId(item.id)}
                                        onDoubleClick={() => navigate(`/estoque/equipamentos/${item.id}/editar`)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            openRowMenu(item.id, e);
                                        }}
                                        className={`transition-all cursor-pointer ${selectedId === item.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-gray-50'}`}
                                    >
                                        <td className="font-mono text-xs font-bold text-blue-600">
                                            {item.codigo || '-'}
                                        </td>
                                        <td className="relative font-medium text-slate-900">
                                            {item.nome}
                                            {openMenuId === item.id && (
                                                <DropdownMenuContent 
                                                    isOpen={true} 
                                                    onClose={() => setOpenMenuId(null)}
                                                    position={menuPosition}
                                                >
                                                    <DropdownMenuItem onClick={() => navigate(`/estoque/equipamentos/${item.id}/editar`)}>
                                                        <Edit className="h-4 w-4 mr-2" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openVincularModal(item.id, item.responsavel)}>
                                                        <UserPlus className="h-4 w-4 mr-2" /> Vincular a Pessoa
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handlePrintEtiqueta(item)}>
                                                        <Printer className="h-4 w-4 mr-2" /> Imprimir Etiqueta
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => {/* manutenção */}}>
                                                        <Settings className="h-4 w-4 mr-2" /> Registrar Manutenção
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => {/* histórico */}}>
                                                        <History className="h-4 w-4 mr-2" /> Histórico
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem variant="danger" onClick={() => handleDelete(item.id)}>
                                                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            )}
                                        </td>
                                        <td>{item.marca} {item.modelo}</td>
                                        <td>{item.localizacao || '-'}</td>
                                        <td className="font-medium text-slate-800">{item.responsavel || '-'}</td>
                                        <td className="text-xs font-mono">{item.numero_serie || '-'}</td>
                                        <td>{getStatusBadge(item.status)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t bg-gray-50/50 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, equipamentosView.length)} de {equipamentosView.length} resultados
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                            </Button>
                            <span className="text-sm font-medium text-gray-700 px-2">{page} / {totalPages}</span>
                            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                                Próximo <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <Card className="p-5 border-dashed">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                    <Monitor className="h-5 w-5 text-gray-400" />
                    Utilize este módulo para controlar computadores, impressoras, móveis e outros ativos fixos da empresa.
                </div>
            </Card>

            {/* Modal de Vinculação */}
            {vincularModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                                <UserPlus className="h-5 w-5 text-blue-600" />
                                Vincular Equipamento
                            </h3>
                            <button 
                                onClick={() => setVincularModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X className="h-4 w-4 text-slate-500" />
                            </button>
                        </div>
                        <form onSubmit={handleVincular}>
                            <div className="p-4 space-y-4">
                                <div>
                                    <Label htmlFor="responsavel">Nome do Responsável / Usuário</Label>
                                    <Input
                                        id="responsavel"
                                        placeholder="Ex: João Silva"
                                        value={responsavelName}
                                        onChange={(e) => setResponsavelName(e.target.value)}
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        Digite o nome da pessoa que ficará responsável ou utilizará este equipamento.
                                    </p>
                                </div>
                            </div>
                            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                                <Button variant="outline" type="button" onClick={() => setVincularModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" loading={loading}>
                                    Salvar Vínculo
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
