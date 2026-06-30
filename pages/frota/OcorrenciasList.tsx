import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, Plus, Search, RefreshCw, Car, Users, Calendar,
    FileText, Eye, Edit3, Trash2
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { useToast } from '../../lib/ToastStore';
import { frotaDeleteOcorrencia, frotaListOcorrencias } from '../../lib/frotaSupabase';

interface Ocorrencia {
    id: string;
    empresa_id?: string;
    veiculo_placa: string;
    veiculo_modelo: string;
    motorista_nome: string;
    tipo: 'acidente' | 'multa' | 'avaria' | 'outro';
    descricao: string;
    data_ocorrencia: string;
    gravidade: 'leve' | 'media' | 'grave';
    status: 'pendente' | 'em_analise' | 'resolvido';
}

const GravidadeBadge: React.FC<{ gravidade: string }> = ({ gravidade }) => {
    const map = {
        leve: { label: 'Leve', cls: 'bg-blue-100 text-blue-700' },
        media: { label: 'Média', cls: 'bg-amber-100 text-amber-700' },
        grave: { label: 'Grave', cls: 'bg-red-100 text-red-700' },
    };
    const { label, cls } = map[gravidade as keyof typeof map] || { label: gravidade, cls: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
};

export const OcorrenciasList: React.FC = () => {
    const navigate = useNavigate();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const loadData = async () => {
        if (!empresaIdEfetivo) return;
        if (skipUntilGrupoCarrega) return;
        setLoading(true);
        try {
            const rows = await frotaListOcorrencias(empresaIdEfetivo, frotaOpts);
            setOcorrencias(rows as Ocorrencia[]);
        } catch (error) {
            showToast('Erro ao carregar ocorrências', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega]);

    const handleDelete = async (id: string) => {
        const oc = ocorrencias.find((o) => o.id === id);
        const emp = oc?.empresa_id || empresaIdEfetivo;
        if (!emp || !confirm('Deseja realmente excluir esta ocorrência?')) return;
        try {
            await frotaDeleteOcorrencia(emp, id);
            showToast('Ocorrência excluída com sucesso', 'success');
            loadData();
        } catch (error) {
            showToast('Erro ao excluir ocorrência', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Ocorrências"
                subtitle="Registro de acidentes, multas e incidentes com a frota"
                actionButton={
                    <Button onClick={() => navigate('/frota/ocorrencias/nova')}>
                        <Plus className="h-4 w-4 mr-2" /> Nova Ocorrência
                    </Button>
                }
            />

            <div className="flex gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input 
                        placeholder="Buscar por placa, motorista ou descrição..." 
                        className="pl-9"
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                    />
                </div>
                <Button variant="outline" onClick={loadData}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                </Button>
            </div>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left p-4 font-semibold text-gray-600">Data</th>
                                <th className="text-left p-4 font-semibold text-gray-600">Veículo / Motorista</th>
                                <th className="text-left p-4 font-semibold text-gray-600">Tipo</th>
                                <th className="text-left p-4 font-semibold text-gray-600">Gravidade</th>
                                <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                                <th className="text-right p-4 font-semibold text-gray-600">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {ocorrencias.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-400 italic">
                                        Nenhuma ocorrência registrada.
                                    </td>
                                </tr>
                            ) : (
                                ocorrencias.map(o => (
                                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4">{new Date(o.data_ocorrencia + 'T00:00').toLocaleDateString('pt-BR')}</td>
                                        <td className="p-4">
                                            <p className="font-semibold">{o.veiculo_placa}</p>
                                            <p className="text-xs text-gray-500">{o.motorista_nome}</p>
                                        </td>
                                        <td className="p-4 uppercase text-xs font-bold text-gray-500">{o.tipo}</td>
                                        <td className="p-4"><GravidadeBadge gravidade={o.gravidade} /></td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                                                o.status === 'resolvido' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {o.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => navigate(`/frota/ocorrencias/${o.id}/editar`)}>
                                                    <Edit3 className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(o.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
