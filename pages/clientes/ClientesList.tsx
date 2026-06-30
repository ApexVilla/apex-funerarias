import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Eye, Edit, Plus, Users, UserCheck, UserX, AlertTriangle,
  Star, Download, Filter, ChevronLeft, ChevronRight, MoreVertical,
  Phone, Mail, Crown, MessageCircle, FileText, Archive, CreditCard, Clock
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Button, Input, Select, Card, Badge, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { ApexLoader } from '../../components/ui/ApexLoader';
import { useClienteStore } from '../../lib/ClienteStore';
import { useFilial } from '../../lib/FilialContext';
import { filtrarQueryPorEmpresaIds, useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { validarWhatsapp, obterUrlWhatsapp } from '../../lib/whatsappValidacao';
import { clienteMatchBusca } from '../../lib/buscaCliente';
import { supabase } from '../../lib/supabase';
import type { DependenteCompletudeInput } from '../../lib/clienteCompletudeCadastro';
import { calcularCompletudeCadastroCliente } from '../../lib/clienteCompletudeCadastro';
import { dataHojeIsoLocal, formatarDataIsoPtBr } from '../../lib/contratoDatas';
import { CLIENTES_LIST_SELECT, CLIENTES_LIST_TABLE } from '../../lib/clientesListQuery';
import { ContratoStatusIndicador } from '../../components/clientes/ContratoStatusIndicador';
import {
  escolherAssinaturaPrincipal,
  resolverStatusContratoExibicao,
  type AssinaturaResumoLista,
} from '../../lib/contratoStatusUi';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000, 5000];

/** Início/fim do dia local em ISO (para filtrar created_at). */
function intervaloCadastroHojeLocal(): { inicio: string; fim: string } {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const fim = new Date(base);
  fim.setDate(fim.getDate() + 1);
  return { inicio: base.toISOString(), fim: fim.toISOString() };
}

export const ClientesList: React.FC = () => {
  const navigate = useNavigate();
  const { buscarClientes } = useClienteStore();
  const { empresaIdsFiltro, aguardandoContexto, dataRevisionEmpresa } = useEmpresaIdsOperacao();
  const { dataRevision: dataRevisionFilial } = useFilial();

  const [searchTerm, setSearchTerm] = useState('');
  const [buscaRemota, setBuscaRemota] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [codigoFilter, setCodigoFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<{ status: string[]; tipo: string[]; vipOnly: boolean }>({
    status: [],
    tipo: [],
    vipOnly: false,
  });
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [filterMenuColumn, setFilterMenuColumn] = useState<string | null>(null);
  const [filterMenuPosition, setFilterMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [dependentesPorCliente, setDependentesPorCliente] = useState<Record<string, DependenteCompletudeInput[]>>({});
  const [assinaturasPorCliente, setAssinaturasPorCliente] = useState<Record<string, AssinaturaResumoLista[]>>({});

  // Local state for paginated/on-demand data
  const [localClientes, setLocalClientes] = useState<any[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

  // Local lightweight counts
  const [stats, setStats] = useState({
    total: 0,
    ativos: 0,
    inadimplentes: 0,
    prospects: 0,
    vips: 0,
    cadastradosHoje: 0,
  });

  const hojeIso = dataHojeIsoLocal();

  const empresaIdsKey = useMemo(
    () => empresaIdsFiltro.map((id) => id.trim()).filter(Boolean).join(','),
    [empresaIdsFiltro],
  );

  const openRowMenu = (id: string, event: React.MouseEvent) => {
    setSelectedId(id);
    setOpenMenuId(id);
    setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
  };

  // Fetch lightweight counts using parallel head-only count queries
  useEffect(() => {
    if (aguardandoContexto) return;
    const ids = empresaIdsFiltro;
    if (ids.length === 0) return;

    let cancelado = false;
    const fetchStats = async () => {
      try {
        const { inicio, fim } = intervaloCadastroHojeLocal();
        const mk = (extra?: (q: any) => any) => {
          let q = supabase.from(CLIENTES_LIST_TABLE).select('id', { count: 'exact', head: true }).is('deleted_at', null);
          q = filtrarQueryPorEmpresaIds(q, ids);
          if (extra) q = extra(q);
          return q;
        };

        const [totalRes, ativosRes, inadimplentesRes, prospectsRes, vipsRes, hojeRes] = await Promise.all([
          mk(),
          mk((q) => q.eq('status', 'ativo')),
          mk((q) => q.eq('status', 'inadimplente')),
          mk((q) => q.eq('tipo_cliente', 'prospect')),
          mk((q) => q.eq('cliente_vip', true)),
          mk((q) => q.gte('created_at', inicio).lt('created_at', fim)),
        ]);

        if (cancelado) return;

        setStats({
          total: totalRes.count || 0,
          ativos: ativosRes.count || 0,
          inadimplentes: inadimplentesRes.count || 0,
          prospects: prospectsRes.count || 0,
          vips: vipsRes.count || 0,
          cadastradosHoje: hojeRes.count || 0,
        });
      } catch (err) {
        console.error('Erro ao buscar estatísticas de clientes:', err);
      }
    };

    fetchStats();
    return () => {
      cancelado = true;
    };
  }, [aguardandoContexto, empresaIdsKey, dataRevisionEmpresa, dataRevisionFilial, empresaIdsFiltro]);

  // Load paginated data when search term is empty or too short
  useEffect(() => {
    const ids = empresaIdsFiltro;
    const termo = searchTerm.trim();
    if (termo.length >= 2) {
      setLocalLoading(false);
      return;
    }
    if (aguardandoContexto) {
      setLocalLoading(true);
      return;
    }
    if (ids.length === 0) {
      setLocalClientes([]);
      setTotalRecords(0);
      setLocalLoading(false);
      setListLoadError(null);
      return;
    }

    let cancelado = false;
    const loadPaginado = async () => {
      setLocalLoading(true);
      setListLoadError(null);
      try {
        let q = supabase
          .from(CLIENTES_LIST_TABLE)
          .select(CLIENTES_LIST_SELECT, { count: 'exact' })
          .is('deleted_at', null);

        q = filtrarQueryPorEmpresaIds(q, ids);

        if (columnFilters.status.length === 1) {
          q = q.eq('status', columnFilters.status[0]);
        } else if (columnFilters.status.length > 1) {
          q = q.in('status', columnFilters.status);
        }
        if (columnFilters.tipo.length === 1) {
          q = q.eq('tipo_cliente', columnFilters.tipo[0]);
        } else if (columnFilters.tipo.length > 1) {
          q = q.in('tipo_cliente', columnFilters.tipo);
        }
        if (columnFilters.vipOnly) {
          q = q.eq('cliente_vip', true);
        }

        if (codigoFilter) {
          q = q.ilike('codigo', `%${codigoFilter}%`);
        }

        q = q.order('nome', { ascending: true });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        q = q.range(from, to);

        const { data, count, error } = await q;
        if (cancelado) return;
        if (error) throw error;

        setLocalClientes((data as any[]) || []);
        setTotalRecords(count || 0);
      } catch (err) {
        if (cancelado) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('aborted') || msg.includes('AbortError')) return;
        console.error('Erro ao carregar clientes paginados:', err);
        setListLoadError(msg);
        setLocalClientes([]);
        setTotalRecords(0);
      } finally {
        if (!cancelado) setLocalLoading(false);
      }
    };

    loadPaginado();
    return () => {
      cancelado = true;
    };
  }, [
    aguardandoContexto,
    empresaIdsKey,
    empresaIdsFiltro,
    page,
    pageSize,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    columnFilters.status.join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    columnFilters.tipo.join(','),
    columnFilters.vipOnly,
    codigoFilter,
    searchTerm,
    dataRevisionEmpresa,
    dataRevisionFilial,
  ]);

  // Debounced search for detailed un-paginated remote search results
  useEffect(() => {
    const termo = searchTerm.trim();
    if (termo.length < 2) {
      setBuscaRemota([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const timer = window.setTimeout(() => {
      buscarClientes(termo).then((rows) => {
        setBuscaRemota(rows);
        setBuscando(false);
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [searchTerm, buscarClientes]);

  // Filter search results locally (up to 100 rows from search store)
  const filteredBusca = useMemo(() => {
    const termo = searchTerm.trim();
    if (termo.length < 2) return [];
    return buscaRemota.filter((c) => {
      const matchSearch = clienteMatchBusca(c, termo);
      const matchStatus = columnFilters.status.length === 0 || columnFilters.status.includes(c.status);
      const matchTipo = columnFilters.tipo.length === 0 || columnFilters.tipo.includes(c.tipo_cliente || '');
      const matchCodigo = !codigoFilter || (c.codigo || '').toLowerCase().includes(codigoFilter.toLowerCase());
      const matchVip = !columnFilters.vipOnly || Boolean(c.cliente_vip);
      return matchSearch && matchStatus && matchTipo && matchCodigo && matchVip;
    });
  }, [buscaRemota, searchTerm, columnFilters.status, columnFilters.tipo, columnFilters.vipOnly, codigoFilter]);

  const isBuscaAtiva = searchTerm.trim().length >= 2;

  const totalPages = useMemo(() => {
    if (isBuscaAtiva) {
      return Math.ceil(filteredBusca.length / pageSize);
    }
    return Math.ceil(totalRecords / pageSize);
  }, [isBuscaAtiva, filteredBusca.length, totalRecords, pageSize]);

  const paginated = useMemo(() => {
    if (isBuscaAtiva) {
      return filteredBusca.slice((page - 1) * pageSize, page * pageSize);
    }
    return localClientes;
  }, [isBuscaAtiva, filteredBusca, localClientes, page, pageSize]);

  const totalFilteredCount = useMemo(() => {
    if (isBuscaAtiva) {
      return filteredBusca.length;
    }
    return totalRecords;
  }, [isBuscaAtiva, filteredBusca.length, totalRecords]);

  const showingFrom =
    totalFilteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo =
    totalFilteredCount === 0 ? 0 : Math.min(page * pageSize, totalFilteredCount);

  const paginatedIdsKey = useMemo(
    () => paginated.map((c) => c.id).join(','),
    [paginated],
  );

  useEffect(() => {
    setPage(1);
  }, [
    searchTerm,
    columnFilters.status.join(','),
    columnFilters.tipo.join(','),
    columnFilters.vipOnly,
    codigoFilter,
    dataRevisionFilial,
    empresaIdsKey,
  ]);

  const temFiltrosListaAtivos =
    columnFilters.status.length > 0 ||
    columnFilters.tipo.length > 0 ||
    columnFilters.vipOnly ||
    Boolean(codigoFilter.trim());

  useEffect(() => {
    const ids = paginatedIdsKey ? paginatedIdsKey.split(',').filter(Boolean) : [];
    if (ids.length === 0) {
      setDependentesPorCliente({});
      return;
    }
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from('beneficiarios')
        .select('cliente_id, nome, parentesco, data_nascimento, data_inclusao, cpf, rg_numero')
        .in('cliente_id', ids)
        .is('deleted_at', null);
      if (cancelado || error) return;
      const map: Record<string, DependenteCompletudeInput[]> = {};
      (data || []).forEach((row: DependenteCompletudeInput & { cliente_id: string }) => {
        const cid = row.cliente_id;
        if (!map[cid]) map[cid] = [];
        map[cid].push({
          nome: row.nome,
          parentesco: row.parentesco,
          data_nascimento: row.data_nascimento,
          data_inclusao: row.data_inclusao,
          cpf: row.cpf,
          rg_numero: row.rg_numero,
        });
      });
      setDependentesPorCliente(map);
    })();
    return () => {
      cancelado = true;
    };
  }, [paginatedIdsKey]);

  useEffect(() => {
    const ids = paginatedIdsKey ? paginatedIdsKey.split(',').filter(Boolean) : [];
    if (ids.length === 0) {
      setAssinaturasPorCliente({});
      return;
    }
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from('assinaturas')
        .select('id, cliente_id, codigo, status, data_contratacao')
        .in('cliente_id', ids)
        .order('data_contratacao', { ascending: false });
      if (cancelado || error) return;
      const map: Record<string, AssinaturaResumoLista[]> = {};
      (data || []).forEach((row: AssinaturaResumoLista & { cliente_id: string }) => {
        const cid = row.cliente_id;
        if (!map[cid]) map[cid] = [];
        map[cid].push({
          id: row.id,
          codigo: row.codigo,
          status: row.status,
          data_contratacao: row.data_contratacao,
        });
      });
      setAssinaturasPorCliente(map);
    })();
    return () => {
      cancelado = true;
    };
  }, [paginatedIdsKey]);

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      ativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      inadimplente: 'bg-red-50 text-red-700 border-red-200',
      suspenso: 'bg-amber-50 text-amber-700 border-amber-200',
      cancelado: 'bg-gray-100 text-gray-600 border-gray-200',
      prospect: 'bg-blue-50 text-blue-700 border-blue-200',
      lead: 'bg-violet-50 text-violet-700 border-violet-200',
    };
    return map[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const getInitialBg = (nome: string) => {
    const colors = [
      'from-blue-500 to-blue-600', 'from-emerald-500 to-emerald-600',
      'from-violet-500 to-violet-600', 'from-amber-500 to-amber-600',
      'from-rose-500 to-rose-600', 'from-cyan-500 to-cyan-600',
    ];
    const idx = nome.charCodeAt(0) % colors.length;
    return colors[idx];
  };

  const getCodigoNumerico = (codigo?: string) => {
    const onlyDigits = (codigo || '').replace(/\D/g, '');
    return onlyDigits || '-';
  };

  const COLUMN_OPTIONS: Record<string, { value: string; label: string }[]> = {
    status: [
      { value: 'ativo', label: 'Ativo' },
      { value: 'inadimplente', label: 'Inadimplente' },
      { value: 'suspenso', label: 'Suspenso' },
      { value: 'cancelado', label: 'Cancelado' },
      { value: 'lead', label: 'Lead' },
      { value: 'prospect', label: 'Prospect' },
    ],
    tipo: [
      { value: 'titular', label: 'Titular' },
      { value: 'prospect', label: 'Prospect' },
      { value: 'lead', label: 'Lead' },
    ],
  };

  const COLUMN_LABELS: Record<string, string> = {
    status: 'Status',
    tipo: 'Tipo',
  };

  const handleOpenFilterMenu = (columnKey: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (filterMenuColumn === columnKey) {
      setFilterMenuColumn(null);
      setFilterMenuPosition(undefined);
      setDropdownSearch('');
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const popupWidth = 256;
      let left = rect.left;
      if (rect.left + popupWidth > window.innerWidth) {
        left = Math.max(8, rect.right - popupWidth);
      }
      setFilterMenuPosition({ x: left, y: rect.bottom + 4 });
      setFilterMenuColumn(columnKey);
      setDropdownSearch('');
    }
  };

  const handleToggleColumnFilter = (columnKey: 'status' | 'tipo', value: string) => {
    setColumnFilters((prev) => {
      const current = prev[columnKey];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [columnKey]: updated };
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        subtitle={`${stats.total} clientes cadastrados`}
        actionButton={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/clientes/oportunidades')}>
              Pipeline CRM
            </Button>
            <Button onClick={() => navigate('/clientes/novo')}>
              <Plus className="h-4 w-4 mr-1" /> Novo Cliente
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => setColumnFilters({ status: [], tipo: [], vipOnly: false })}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total</p>
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => setColumnFilters({ status: ['ativo'], tipo: [], vipOnly: false })}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <UserCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Ativos</p>
              <p className="text-xl font-bold text-emerald-600">{stats.ativos}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => setColumnFilters({ status: ['inadimplente'], tipo: [], vipOnly: false })}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Inadimpl.</p>
              <p className="text-xl font-bold text-red-600">{stats.inadimplentes}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => setColumnFilters({ status: [], tipo: ['prospect'], vipOnly: false })}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <UserX className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Prospects</p>
              <p className="text-xl font-bold text-violet-600">{stats.prospects}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => setColumnFilters({ status: [], tipo: [], vipOnly: true })}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">VIP</p>
              <p className="text-xl font-bold text-amber-600">{stats.vips}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Cadastrados hoje</p>
              <p className="text-xl font-bold text-indigo-600 tabular-nums">{stats.cadastradosHoje}</p>
              <p className="text-[10px] text-indigo-500 leading-tight">{formatarDataIsoPtBr(hojeIso)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome, CPF, código, telefone ou nº contrato (mín. 2 letras)..."
              className="pl-9 normal-case"
              autoComplete="off"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <div className="w-40">
              <Select
                value={columnFilters.status.length === 1 ? columnFilters.status[0] : ''}
                onChange={(e) => setColumnFilters(prev => ({ ...prev, status: e.target.value ? [e.target.value] : [], tipo: [], vipOnly: false }))}
              >
                <option value="">Status: Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inadimplente">Inadimplente</option>
                <option value="suspenso">Suspenso</option>
                <option value="cancelado">Cancelado</option>
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
              </Select>
            </div>
            <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t">
            <Input
              value={codigoFilter}
              onChange={(e) => setCodigoFilter(e.target.value)}
              placeholder="Código do cliente"
              className="max-w-xs"
            />
          </div>
        )}
      </Card>

      {/* Table */}
      <div className="list-table-shell">
        {localLoading && searchTerm.trim().length < 2 ? (
          <ApexLoader
            className="py-20"
            words={['Clientes', 'Contratos', 'Cadastros', 'Financeiro', 'Clientes']}
            subtitle={aguardandoContexto ? 'Carregando unidade...' : 'Carregando clientes...'}
          />
        ) : buscando && searchTerm.trim().length >= 2 ? (
          <ApexLoader
            className="py-16"
            words={['Clientes', 'Contratos', 'Cadastros', 'Financeiro', 'Clientes']}
            subtitle="Pesquisando..."
          />
        ) : totalFilteredCount === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">Nenhum cliente encontrado</p>
            <p className="text-sm mt-1">
              {listLoadError
                ? `Erro ao carregar a lista: ${listLoadError}`
                : searchTerm.trim().length >= 2
                  ? 'Tente outro nome, CPF ou e-mail'
                  : temFiltrosListaAtivos
                    ? 'Nenhum cliente corresponde aos filtros aplicados. Limpe os filtros ou cadastre um novo cliente.'
                    : stats.total > 0
                      ? 'A lista não carregou. Atualize a página ou tente buscar por nome (mín. 2 letras).'
                      : 'Cadastre o primeiro cliente da unidade ou refine a busca.'}
            </p>
            {temFiltrosListaAtivos && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setColumnFilters({ status: [], tipo: [], vipOnly: false })}
              >
                Limpar filtros
              </Button>
            )}
            <Button className="mt-4" onClick={() => navigate('/clientes/novo')}>
              <Plus className="h-4 w-4 mr-1" /> Novo Cliente
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-visible">
            <table className="list-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>Contrato</th>
                  <th>
                    <div className="flex items-center gap-1 select-none">
                      <span>Status</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('status', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.status.length > 0
                            ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-100'
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                        title="Filtrar Status"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                  <th>
                    <div className="flex items-center gap-1 select-none">
                      <span>Tipo</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('tipo', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.tipo.length > 0
                            ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-100'
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                        title="Filtrar Tipo"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                  <th className="text-center text-xs leading-tight max-w-[5.5rem]" title="Quantidade de dados pendentes (titular e dependentes)">
                    Quant. dado pend.
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((cliente) => (
                  <tr 
                    key={cliente.id} 
                    onClick={() => {
                      setSelectedId(cliente.id);
                      setOpenMenuId(null);
                    }}
                    onDoubleClick={() => navigate(`/clientes/${cliente.id}`)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openRowMenu(cliente.id, e);
                    }}
                    className={`transition-all cursor-pointer ${openMenuId === cliente.id || selectedId === cliente.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-gray-50'}`}
                  >
                    <td>
                      <span className="inline-flex items-center text-xs font-mono text-gray-600 bg-gray-100 border border-gray-200 rounded px-2 py-0.5">
                        {getCodigoNumerico(cliente.codigo)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-3 relative">
                        <div 
                          className={`h-10 w-10 rounded-full bg-gradient-to-br ${getInitialBg(cliente.nome)} flex items-center justify-center text-white font-semibold text-sm shadow-sm cursor-pointer hover:scale-105 transition-transform`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/clientes/${cliente.id}`);
                          }}
                        >
                          {cliente.nome.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span 
                              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/clientes/${cliente.id}`);
                              }}
                            >
                              {cliente.nome}
                            </span>
                            {cliente.cliente_vip && (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            )}
                          </div>
                        </div>

                        {openMenuId === cliente.id && (
                          <DropdownMenuContent 
                            isOpen={true} 
                            onClose={() => setOpenMenuId(null)}
                            position={menuPosition}
                          >
                            <DropdownMenuItem onClick={() => { navigate(`/clientes/${cliente.id}`); setOpenMenuId(null); }}>
                              <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { navigate(`/clientes/${cliente.id}/editar`); setOpenMenuId(null); }}>
                              <Edit className="h-4 w-4 mr-2" /> Editar Cadastro
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              disabled={!validarWhatsapp(cliente.telefone_principal)}
                              onClick={() => { 
                                if (validarWhatsapp(cliente.telefone_principal)) {
                                  window.open(obterUrlWhatsapp(cliente.telefone_principal), '_blank');
                                }
                                setOpenMenuId(null); 
                              }}
                            >
                              <MessageCircle className={`h-4 w-4 mr-2 ${validarWhatsapp(cliente.telefone_principal) ? 'text-emerald-500 font-medium' : 'text-gray-400'}`} /> WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="danger" onClick={() => { /* desativar */ setOpenMenuId(null); }}>
                              <Archive className="h-4 w-4 mr-2" /> Desativar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-gray-600 text-xs">
                          <Mail className="h-3 w-3" /> {cliente.email || '-'}
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-600 text-xs">
                          {validarWhatsapp(cliente.telefone_principal) ? (
                            <a
                              href={obterUrlWhatsapp(cliente.telefone_principal)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-medium transition-colors cursor-pointer"
                              title="Clique para abrir no WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" /> {cliente.telefone_principal}
                            </a>
                          ) : (
                            <>
                              <Phone className="h-3 w-3 text-gray-400" /> {cliente.telefone_principal || '-'}
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const assinaturas = assinaturasPorCliente[cliente.id] || [];
                        const principal = escolherAssinaturaPrincipal(assinaturas);
                        const statusContrato = resolverStatusContratoExibicao(principal, {
                          bloqueado: cliente.bloqueado,
                          origem_canal: cliente.origem_canal,
                          status: cliente.status,
                        });
                        return (
                          <ContratoStatusIndicador
                            status={statusContrato}
                            codigoContrato={principal?.codigo}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/clientes/${cliente.id}`);
                            }}
                          />
                        );
                      })()}
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(cliente.status)}`}>
                        {cliente.status}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-gray-600 capitalize">{cliente.tipo_cliente || '-'}</span>
                    </td>
                    <td className="text-center whitespace-nowrap">
                      {(() => {
                        const resumo = calcularCompletudeCadastroCliente(
                          cliente,
                          dependentesPorCliente[cliente.id] || [],
                        );
                        const n = resumo.pendentes;
                        return (
                          <span
                            className={`inline-flex min-w-[2rem] justify-center items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums border ${
                              n === 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                            }`}
                            title={
                              n === 0
                                ? 'Cadastro completo'
                                : resumo.itensPendentes
                                    .map((i) => (i.dependente ? `${i.dependente}: ` : '') + i.label)
                                    .join(', ')
                            }
                          >
                            {n}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-6 py-4 border-t bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">
              Mostrando {showingFrom} a {showingTo} de {totalFilteredCount} resultados
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">Itens por página:</span>
              <select 
                value={pageSize} 
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="text-xs border rounded px-1 py-0.5 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
              >
                {PAGE_SIZE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <span className="text-sm font-medium text-gray-700 px-4">
              Página <span className="text-blue-600">{page}</span> de {totalPages || 1}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {filterMenuColumn && filterMenuPosition && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => {
              setFilterMenuColumn(null);
              setFilterMenuPosition(undefined);
              setDropdownSearch('');
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: `${filterMenuPosition.y}px`,
              left: `${filterMenuPosition.x}px`,
            }}
            className="z-50 w-64 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 p-3 max-h-80 overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Filtro: {COLUMN_LABELS[filterMenuColumn]}
              </span>
              {(columnFilters as any)[filterMenuColumn]?.length > 0 && (
                <button
                  onClick={() => setColumnFilters((prev) => ({ ...prev, [filterMenuColumn]: [] }))}
                  className="text-xs text-red-600 hover:underline font-semibold"
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1 text-xs border border-gray-200 rounded bg-gray-50 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 py-1 max-h-48 border-t border-gray-100">
              {(COLUMN_OPTIONS[filterMenuColumn] || [])
                .filter((opt) => !dropdownSearch || opt.label.toLowerCase().includes(dropdownSearch.toLowerCase()))
                .map((opt) => {
                  const isChecked = ((columnFilters as any)[filterMenuColumn] || []).includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-xs select-none transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => (filterMenuColumn === 'status' || filterMenuColumn === 'tipo') && handleToggleColumnFilter(filterMenuColumn, opt.value)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};