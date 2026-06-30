import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, User, Heart, Package, DollarSign, FileText, ClipboardList, CheckSquare, Truck, MapPin, Navigation, FileDown } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, Textarea } from '../../components/ui/Components';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { useServicoStore, type ProdutoItem, type ServicoItem } from '../../lib/ServicoStore';
import { useClienteStore, type ClienteSB } from '../../lib/ClienteStore';
import { useAuth } from '../../lib/AuthContext';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { useToast } from '../../lib/ToastStore';
import { frotaInsertViagem, frotaListMotoristas, frotaListVeiculos } from '../../lib/frotaSupabase';
import { gerarOrdemServicoAtendimentoPdf } from '../../lib/AtendimentoOrdemServicoPdf';
import { DocumentosAtendimentoModal } from '../../components/atendimentos/DocumentosAtendimentoModal';
import { carregarItensKit, listarKitsEmpresa } from '../../lib/kitPlanoService';
import { registrarFalecimentoBeneficiario } from '../../lib/beneficiarioFalecimento';
import {
  buscarTitularAtendimento,
  clienteMatchBusca,
  contratosClienteExibicao,
  telefoneClienteExibicao,
  type ResultadoBuscaTitularAtendimento,
} from '../../lib/buscaCliente';
import { ColaboradorSearchSelect } from '../../components/common/ColaboradorSearchSelect';
import { OpcaoSearchSelect } from '../../components/common/OpcaoSearchSelect';
import { RELIGIOES, textoExibicaoReligiao } from '../../lib/religioes';
import {
  buscarColaboradoresGrupo,
  ROLES_AGENTE_FUNERARIO,
  ROLES_ATENDENTE,
  type ColaboradorResumoDto,
} from '../../lib/comissaoAtendenteService';

type Tab = 'identificacao' | 'falecido' | 'corpo' | 'servicos' | 'resumo';
type ResponsavelAtendimentoTipo = 'titular' | 'beneficiario' | 'outro';
/** novo = cadastro manual; contrato = titular/dependente do plano; historico = registro anterior em ser_falecidos */
type ModoFalecido = 'novo' | 'contrato' | 'historico';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'identificacao', label: 'Responsável', icon: User },
  { id: 'falecido',      label: 'Falecido',    icon: Heart },
  { id: 'corpo',         label: 'Corpo',       icon: ClipboardList },
  { id: 'servicos',      label: 'Serviços',    icon: Package },
  { id: 'resumo',        label: 'Resumo',      icon: DollarSign },
];

const fmt = (c: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100);
const parseMoedaToCentavos = (v: string) => {
  const txt = (v || '').replace(/\./g, '').replace(',', '.').trim();
  const n = Number(txt);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
};

export const AtendimentoForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { servicos, produtos, falecidos, loadCatalogos, loadFalecidos, salvarAtendimento, getAtendimento, error: storeError } = useServicoStore();
  const { clientes, loadClientes, createCliente, buscarClientes, loadClienteById } = useClienteStore();
  const { user, empresa } = useAuth();
  const { empresaIdEfetivo, empresaIdsParaFiltro, empresasDoGrupo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
  const { showToast } = useToast();

  const isEdit = !!id;
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('identificacao');

  const [form, setForm] = useState({
    cliente_id: '',
    falecido_id: '',
    data_servico: new Date().toISOString().split('T')[0],
    status: 'aguardando' as 'cancelado' | 'em_andamento' | 'concluido' | 'aguardando',
    tipo_atendimento: 'particular' as 'particular' | 'plano',
    observacoes: '',
    codigo: '',
    // Aspecto do Corpo
    inspecao_interna: false,
    inspecao_externa: false,
    coleta_material: false,
    orientacoes_tecnicas: '',
    observacoes_corpo: '',
    comentarios_falecido: '',
    autoriza_remocao: false,
    formulario_preparacao: '',
    local_velorio: '',
    local_sepultamento: '',
    religiao_falecido: '',
    data_falecido: '',
    data_nascimento_falecido: '',
    onde_corpo_se_encontra: '',
    motivo_morte: '',
    medico_nome_crm: '',
    declaracao_obito_certidao: '',
    representante_nome: '',
    representante_contato: '',
    atendente_id: '',
    agente_funerario_id: '',
  });

  const [pagamentos, setPagamentos] = useState<Array<{ forma: string; valor_centavos: number; valor_input?: string }>>([
    { forma: 'dinheiro', valor_centavos: 0, valor_input: '0,00' },
  ]);

  const [falecidoInline, setFalecidoInline] = useState({
    nome: '', data_falecimento: '', local_falecimento: '',
    data_nascimento: '', parentesco: '', cpf: '',
  });
  const [modoFalecido, setModoFalecido] = useState<ModoFalecido>('novo');
  const [contatoBusca, setContatoBusca] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState<ClienteSB[]>([]);
  const [resultadosBuscaPlano, setResultadosBuscaPlano] = useState<ResultadoBuscaTitularAtendimento[]>([]);
  const [buscaRealizada, setBuscaRealizada] = useState(false);
  const [modalCadastroRapido, setModalCadastroRapido] = useState(false);
  const [analisandoContato, setAnalisandoContato] = useState(false);
  const buscaSeqRef = useRef(0);
  const [planoDetectado, setPlanoDetectado] = useState<{ id: string; nome: string } | null>(null);
  const [contratoVinculado, setContratoVinculado] = useState<string | null>(null);
  const [beneficiariosAtivos, setBeneficiariosAtivos] = useState<
    Array<{ id: string; nome: string; parentesco?: string | null; cpf?: string | null; telefone?: string | null }>
  >([]);
  const [responsavelTipo, setResponsavelTipo] = useState<ResponsavelAtendimentoTipo>('titular');
  const [responsavelBeneficiarioId, setResponsavelBeneficiarioId] = useState('');
  const [responsavelOutro, setResponsavelOutro] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    parentesco: '',
  });
  const [falecidoContratoSelecionado, setFalecidoContratoSelecionado] = useState('');
  const [cadastroRapido, setCadastroRapido] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    email: '',
    data_nascimento: '',
  });

  const [selectedServices, setSelectedServices] = useState<{ servico_id: string; quantidade: number }[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<{ produto_id: string; quantidade: number }[]>([]);
  /** Produtos trazidos pelo kit que ainda não estão no catálogo do store. */
  const [produtosKitExtra, setProdutosKitExtra] = useState<ProdutoItem[]>([]);
  /** Serviços trazidos pelo kit que ainda não estão no catálogo do store. */
  const [servicosKitExtra, setServicosKitExtra] = useState<ServicoItem[]>([]);
  
  const [kits, setKits] = useState<any[]>([]);
  const [kitSelecionadoId, setKitSelecionadoId] = useState('');
  const [loadingKit, setLoadingKit] = useState(false);
  const [pdfGerando, setPdfGerando] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [descontoCentavos, setDescontoCentavos] = useState(0);
  const [descontoAutorizadoPor, setDescontoAutorizadoPor] = useState('');
  const [descontoInput, setDescontoInput] = useState('');
  const [modalDesconto, setModalDesconto] = useState(false);
  const [descontoPendenteCentavos, setDescontoPendenteCentavos] = useState(0);
  const [nomeAutorizadorDesconto, setNomeAutorizadorDesconto] = useState('');
  const [descontoTipo, setDescontoTipo] = useState<'valor' | 'porcentagem'>('valor');
  const [descontoPercentual, setDescontoPercentual] = useState<number | null>(null);
  const [descontoPercentualPendente, setDescontoPercentualPendente] = useState<number | null>(null);
  const [viagensVinculadas, setViagensVinculadas] = useState<Array<{ id: string; status: string; placa?: string | null; motorista_nome?: string | null; origem?: string | null; destino?: string | null }>>([]);

  // ── Viagem de remoção (buscar corpo) ──
  const [veiculosFrota, setVeiculosFrota] = useState<{ id: string; placa: string; modelo: string }[]>([]);
  const [motoristasFrota, setMotoristasFrota] = useState<{ id: string; nome: string }[]>([]);
  const [viagemRemocao, setViagemRemocao] = useState({
    gerar: false,
    veiculo_id: '',
    motorista_id: '',
    motorista_nome: '',
    origem: '',
    destino: '',
    data_saida: new Date().toISOString().slice(0, 10),
    hora_saida: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    km_saida: '',
    observacao: '',
  });

  const empresaIdsBusca = useMemo(() => {
    const ids = [...(empresaIdsParaFiltro || [])].map((id) => id.trim()).filter(Boolean);
    const fallback = (empresaIdEfetivo || empresa?.id || user?.empresa_id || '').trim();
    return ids.length > 0 ? ids : fallback ? [fallback] : [];
  }, [empresaIdsParaFiltro, empresaIdEfetivo, empresa?.id, user?.empresa_id]);

  const produtosParaUi = useMemo(() => {
    const map = new Map<string, ProdutoItem>();
    for (const p of produtos) map.set(p.id, p);
    for (const p of produtosKitExtra) map.set(p.id, p);
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [produtos, produtosKitExtra]);

  const servicosParaUi = useMemo(() => {
    const map = new Map<string, ServicoItem>();
    for (const s of servicos) map.set(s.id, s);
    for (const s of servicosKitExtra) map.set(s.id, s);
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [servicos, servicosKitExtra]);

  const produtosOpcoes = useMemo(() => {
    return produtosParaUi.map(p => ({
      value: p.id,
      label: `${p.nome} — ${fmt(p.preco_centavos)}`
    }));
  }, [produtosParaUi]);

  const servicosOpcoes = useMemo(() => {
    return servicosParaUi.map(s => ({
      value: s.id,
      label: `${s.nome} — ${fmt(s.preco_base_centavos)}`
    }));
  }, [servicosParaUi]);

  const resolveDisplayProduto = useCallback((id: string) => {
    const p = produtosParaUi.find(x => x.id === id);
    return p ? `${p.nome} — ${fmt(p.preco_centavos)}` : '';
  }, [produtosParaUi]);

  const resolveDisplayServico = useCallback((id: string) => {
    const s = servicosParaUi.find(x => x.id === id);
    return s ? `${s.nome} — ${fmt(s.preco_base_centavos)}` : '';
  }, [servicosParaUi]);

  const empresaIdsColaboradores = useMemo(() => {
    const idsGrupo = empresasDoGrupo.map((e) => e.id.trim()).filter(Boolean);
    if (idsGrupo.length > 0) return [...new Set(idsGrupo)];
    return empresaIdsBusca;
  }, [empresasDoGrupo, empresaIdsBusca]);

  const empresaNomePorId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of empresasDoGrupo) map[e.id] = e.nome;
    return map;
  }, [empresasDoGrupo]);

  const [colaboradoresGrupo, setColaboradoresGrupo] = useState<ColaboradorResumoDto[]>([]);

  const buscarColaboradoresRemoto = useCallback(
    (roles: readonly string[]) => (termo: string) =>
      buscarColaboradoresGrupo(empresaIdsColaboradores, {
        roles,
        termo,
        empresaNomePorId,
      }),
    [empresaIdsColaboradores, empresaNomePorId],
  );

  useEffect(() => {
    if (empresaIdsColaboradores.length === 0) return;
    let cancelado = false;
    void buscarColaboradoresGrupo(empresaIdsColaboradores, { empresaNomePorId }).then((rows) => {
      if (!cancelado) setColaboradoresGrupo(rows);
    });
    return () => {
      cancelado = true;
    };
  }, [empresaIdsColaboradores, empresaNomePorId, dataRevisionEmpresa]);

  useEffect(() => {
    const ids = [form.atendente_id, form.agente_funerario_id].filter(Boolean) as string[];
    if (ids.length === 0 || empresaIdsColaboradores.length === 0) return;

    let cancelado = false;
    void (async () => {
      const { data } = await supabase
        .from('users')
        .select('id, nome, email, role, ativo, empresa_id')
        .in('id', ids);
      if (cancelado || !data?.length) return;
      setColaboradoresGrupo((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        for (const u of data) {
          const empresaId = u.empresa_id ? String(u.empresa_id) : undefined;
          map.set(String(u.id), {
            id: String(u.id),
            nome: String(u.nome || ''),
            email: String(u.email || ''),
            role: String(u.role || ''),
            status: u.ativo ? 'ativo' : 'inativo',
            empresa_id: empresaId,
            empresa_nome: empresaId ? empresaNomePorId[empresaId] : undefined,
          });
        }
        return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      });
    })();

    return () => {
      cancelado = true;
    };
  }, [form.atendente_id, form.agente_funerario_id, empresaIdsColaboradores.length, empresaNomePorId]);

  useEffect(() => {
    loadCatalogos(empresaIdsBusca);
    loadClientes();

    void listarKitsEmpresa(empresaIdsBusca.length ? empresaIdsBusca : empresa?.id || user?.empresa_id)
      .then(setKits)
      .catch(() => setKits([]));

    if (id) {
      getAtendimento(id).then(atd => {
        if (!atd) return;
        setForm({ 
          cliente_id: atd.cliente_id, 
          falecido_id: atd.falecido_id || '', 
          data_servico: atd.data_servico, 
          status: atd.status, 
          observacoes: atd.observacoes || '', 
          codigo: atd.codigo,
          inspecao_interna: atd.inspecao_interna || false,
          inspecao_externa: atd.inspecao_externa || false,
          coleta_material: atd.coleta_material || false,
          orientacoes_tecnicas: atd.orientacoes_tecnicas || '',
          observacoes_corpo: atd.observacoes_corpo || '',
          comentarios_falecido: atd.comentarios_falecido || '',
          autoriza_remocao: atd.autoriza_remocao || false,
          tipo_atendimento: atd.tipo_atendimento || 'particular',
          formulario_preparacao: (atd as any).formulario_preparacao || '',
          local_velorio: (atd as any).local_velorio || '',
          local_sepultamento: (atd as any).local_sepultamento || '',
          religiao_falecido: (atd as any).religiao_falecido || '',
          data_falecido: (atd as any).data_falecido || '',
          data_nascimento_falecido: (atd as any).data_nascimento_falecido || '',
          onde_corpo_se_encontra: (atd as any).onde_corpo_se_encontra || '',
          motivo_morte: (atd as any).motivo_morte || '',
          medico_nome_crm: (atd as any).medico_nome_crm || '',
          declaracao_obito_certidao: (atd as any).declaracao_obito_certidao || '',
          representante_nome: (atd as any).representante_nome || '',
          representante_contato: (atd as any).representante_contato || '',
          atendente_id: (atd as any).atendente_id || '',
          agente_funerario_id: (atd as any).agente_funerario_id || '',
        });
        setPagamentos(
          Array.isArray((atd as any).pagamentos_divididos) && (atd as any).pagamentos_divididos.length > 0
            ? (atd as any).pagamentos_divididos.map((p: any) => ({
                forma: p.forma,
                valor_centavos: p.valor_centavos,
                valor_input: (Number(p.valor_centavos || 0) / 100).toFixed(2).replace('.', ',')
              }))
            : [{
                forma: 'dinheiro',
                valor_centavos: Number((atd as any).valor_pago_centavos || 0),
                valor_input: (Number((atd as any).valor_pago_centavos || 0) / 100).toFixed(2).replace('.', ',')
              }]
        );
        setSelectedServices(atd.itens_servicos.map((s: any) => ({ servico_id: s.servico_id, quantidade: s.quantidade })));
        setSelectedProducts(atd.itens_produtos.map((p: any) => ({ produto_id: p.produto_id, quantidade: p.quantidade })));
        const descCents = Math.max(0, Number((atd as any).valor_desconto_centavos || 0));
        setDescontoCentavos(descCents);
        setDescontoAutorizadoPor(String((atd as any).desconto_autorizado_por || '').trim());
        setDescontoInput(descCents > 0 ? (descCents / 100).toFixed(2).replace('.', ',') : '');
        setModoFalecido(atd.falecido_id ? 'historico' : atd.tipo_atendimento === 'plano' ? 'contrato' : 'novo');
      });
    }
  }, [id, empresaIdEfetivo, dataRevisionEmpresa, empresa?.id, user?.empresa_id, empresaIdsBusca]);

  /** Veículos e motoristas em chamadas separadas: se motoristas falhar (RLS etc.), o catálogo de veículos ainda carrega. */
  useEffect(() => {
    if (!empresaIdEfetivo) {
      setVeiculosFrota([]);
      setMotoristasFrota([]);
      return;
    }
    if (skipUntilGrupoCarrega) return;
    let cancelled = false;
    (async () => {
      try {
        const veicRows = await frotaListVeiculos(empresaIdEfetivo, {}, frotaOpts);
        if (!cancelled) {
          setVeiculosFrota((veicRows || []).map((v: any) => ({ id: v.id, placa: v.placa, modelo: v.modelo })));
        }
      } catch (e) {
        console.error('[AtendimentoForm] Frota veículos:', e);
        if (!cancelled) {
          setVeiculosFrota([]);
          showToast('Não foi possível carregar o catálogo de veículos da frota.', 'warning');
        }
      }
      try {
        const motRows = await frotaListMotoristas(empresaIdEfetivo, {}, frotaOpts);
        if (!cancelled) {
          setMotoristasFrota((motRows || []).map((m: any) => ({ id: m.id, nome: m.nome })));
        }
      } catch (e) {
        console.error('[AtendimentoForm] Frota motoristas:', e);
        if (!cancelled) {
          setMotoristasFrota([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega, showToast]);

  // Carrega viagens já vinculadas a este atendimento (quando editando)
  useEffect(() => {
    if (!id) {
      setViagensVinculadas([]);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const { data: vs, error } = await supabase
          .from('frota_viagens')
          .select('id, status, origem, destino, veiculo_id, motorista_id')
          .eq('atendimento_id', id);
        if (cancelado || error || !vs) return;

        const veiculoIds = [...new Set(vs.map((v: any) => v.veiculo_id).filter(Boolean))];
        const motoristaIds = [...new Set(vs.map((v: any) => v.motorista_id).filter(Boolean))];
        const [vRes, mRes] = await Promise.all([
          veiculoIds.length
            ? supabase.from('frota_veiculos').select('id, placa').in('id', veiculoIds)
            : Promise.resolve({ data: [] as any[] }),
          motoristaIds.length
            ? supabase.from('frota_motoristas').select('id, nome').in('id', motoristaIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const vMap: Record<string, string> = {};
        const mMap: Record<string, string> = {};
        (vRes.data || []).forEach((v: any) => { vMap[v.id] = v.placa || ''; });
        (mRes.data || []).forEach((m: any) => { mMap[m.id] = m.nome || ''; });
        if (cancelado) return;
        setViagensVinculadas(
          vs.map((v: any) => ({
            id: v.id,
            status: v.status,
            origem: v.origem,
            destino: v.destino,
            placa: v.veiculo_id ? vMap[v.veiculo_id] : null,
            motorista_nome: v.motorista_id ? mMap[v.motorista_id] : null,
          }))
        );
      } catch (err) {
        console.warn('[AtendimentoForm] Falha ao carregar viagens vinculadas:', err);
      }
    })();
    return () => { cancelado = true; };
  }, [id]);

  // Auto-preenche origem/destino da viagem com base nos dados do atendimento
  useEffect(() => {
    setViagemRemocao((prev) => ({
      ...prev,
      origem: prev.origem || form.onde_corpo_se_encontra || '',
      destino: prev.destino || form.local_velorio || '',
      data_saida: prev.data_saida || form.data_servico || new Date().toISOString().slice(0, 10),
    }));
  }, [form.onde_corpo_se_encontra, form.local_velorio, form.data_servico]);

  const [currentPlanId, setCurrentPlanId] = useState<string>('');
  const normalizeDigits = (v: string) => (v || '').replace(/\D/g, '');

  const planoIdAtivo = currentPlanId || planoDetectado?.id || '';

  const kitsParaSelecao = useMemo(() => {
    return [...kits].sort((a, b) => {
      if (planoIdAtivo) {
        if (a.plano_id === planoIdAtivo && b.plano_id !== planoIdAtivo) return -1;
        if (b.plano_id === planoIdAtivo && a.plano_id !== planoIdAtivo) return 1;
      }
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
  }, [kits, planoIdAtivo]);

  useEffect(() => {
    if (kitSelecionadoId || kits.length === 0) return;
    const kitPlano = planoIdAtivo ? kits.find((k) => k.plano_id === planoIdAtivo) : null;
    if (kitPlano) setKitSelecionadoId(kitPlano.id);
    else if (kits.length === 1) setKitSelecionadoId(kits[0].id);
  }, [kits, planoIdAtivo, kitSelecionadoId]);


  const clienteTemContratoAtivo = useCallback(async (clienteId: string) => {
    const { data } = await supabase
      .from('assinaturas')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('status', 'ativo')
      .maybeSingle();
    return !!data?.id;
  }, []);

  const limparVinculoCliente = useCallback(() => {
    setForm((p) => ({ ...p, cliente_id: '', falecido_id: '' }));
    setResponsavelTipo('titular');
    setResponsavelBeneficiarioId('');
    setContratoVinculado(null);
    setPlanoDetectado(null);
    setBeneficiariosAtivos([]);
    setFalecidoContratoSelecionado('');
  }, []);

  const alterarTipoAtendimento = (tipo: 'particular' | 'plano') => {
    if (form.tipo_atendimento === tipo) return;
    setForm((p) => ({ ...p, tipo_atendimento: tipo, cliente_id: '', falecido_id: '' }));
    setContatoBusca('');
    setClientesEncontrados([]);
    setResultadosBuscaPlano([]);
    setBuscaRealizada(false);
    setResponsavelTipo('titular');
    setResponsavelBeneficiarioId('');
    setContratoVinculado(null);
    setPlanoDetectado(null);
    setBeneficiariosAtivos([]);
    setFalecidoContratoSelecionado('');
    setCurrentPlanId('');
    setModoFalecido(tipo === 'particular' ? 'novo' : 'contrato');
    setFalecidoInline({
      nome: '',
      data_falecimento: '',
      local_falecimento: '',
      data_nascimento: '',
      parentesco: '',
      cpf: '',
    });
  };

  const falecidoInlineVazio = () => ({
    nome: '',
    data_falecimento: '',
    local_falecimento: '',
    data_nascimento: '',
    parentesco: '',
    cpf: '',
  });

  const mudarModoFalecido = (modo: ModoFalecido) => {
    setModoFalecido(modo);
    setForm((p) => ({ ...p, falecido_id: '' }));
    if (modo !== 'contrato') setFalecidoContratoSelecionado('');
    if (modo === 'novo') setFalecidoInline(falecidoInlineVazio());
  };

  useEffect(() => {
    const fetchClientPlan = async () => {
      if (!form.cliente_id) {
        setCurrentPlanId('');
        return;
      }

      try {
        const { data } = await supabase
          .from('assinaturas')
          .select('plano_id')
          .eq('cliente_id', form.cliente_id)
          .eq('status', 'ativo')
          .maybeSingle();

        setCurrentPlanId(data?.plano_id || '');
      } catch (err) {
        console.error('Error fetching client plan:', err);
        setCurrentPlanId('');
      }
    };

    void fetchClientPlan();
    if (form.cliente_id) loadFalecidos(form.cliente_id);
  }, [form.cliente_id, loadFalecidos]);

  useEffect(() => {
    if (!form.cliente_id) {
      setPlanoDetectado(null);
      setBeneficiariosAtivos([]);
      setFalecidoContratoSelecionado('');
      return;
    }

    const loadContrato = async () => {
      const { data: assinatura } = await supabase
        .from('assinaturas')
        .select('id, codigo, plano_id, planos(nome)')
        .eq('cliente_id', form.cliente_id)
        .eq('status', 'ativo')
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (!assinatura?.id) {
        setPlanoDetectado(null);
        setContratoVinculado(null);
        setBeneficiariosAtivos([]);
        setFalecidoContratoSelecionado('');
        return;
      }

      setContratoVinculado(assinatura.codigo || null);
      setPlanoDetectado({
        id: assinatura.plano_id,
        nome: (assinatura as any).planos?.nome || 'Plano ativo',
      });

      const { data: beneficiarios } = await supabase
        .from('beneficiarios')
        .select('id, nome, parentesco, cpf, telefone, status')
        .eq('cliente_id', form.cliente_id)
        .eq('assinatura_id', assinatura.id)
        .eq('status', 'ativo')
        .order('nome', { ascending: true });

      setBeneficiariosAtivos(
        (beneficiarios || []) as Array<{
          id: string;
          nome: string;
          parentesco?: string | null;
          cpf?: string | null;
          telefone?: string | null;
        }>,
      );
    };

    void loadContrato();
  }, [form.cliente_id]);

  const titularSelecionado = useMemo(
    () => clientes.find((c) => c.id === form.cliente_id) || null,
    [clientes, form.cliente_id],
  );

  /** Cadastro inline já inclui datas — evita repetir na seção complementar. */
  const mostraCadastroFalecidoInline = useMemo(() => {
    if (!form.cliente_id) return false;
    if (form.tipo_atendimento === 'particular') {
      return !(isEdit && modoFalecido === 'historico' && form.falecido_id);
    }
    return modoFalecido === 'novo' || modoFalecido === 'contrato';
  }, [form.cliente_id, form.tipo_atendimento, form.falecido_id, isEdit, modoFalecido]);

  const aplicarPessoaContratoComoFalecido = (value: string) => {
    setFalecidoContratoSelecionado(value);
    setForm((p) => ({ ...p, falecido_id: '' }));
    if (!value) return;
    if (value === '__titular__') {
      const titular = titularSelecionado || clientes.find((c) => c.id === form.cliente_id);
      if (titular) {
        setFalecidoInline((p) => ({
          ...p,
          nome: titular.nome || '',
          cpf: titular.cpf || '',
          parentesco: 'Titular',
        }));
      }
      return;
    }
    const beneficiario = beneficiariosAtivos.find((b) => b.id === value);
    if (beneficiario) {
      setFalecidoInline((p) => ({
        ...p,
        nome: beneficiario.nome || '',
        cpf: beneficiario.cpf || '',
        parentesco: beneficiario.parentesco || 'Dependente',
      }));
    }
  };

  const aplicarResponsavelTitular = (cliente: ClienteSB) => {
    const tel = telefoneClienteExibicao(cliente);
    setForm((p) => ({
      ...p,
      representante_nome: cliente.nome || '',
      representante_contato: tel !== '—' ? tel : p.representante_contato,
    }));
  };

  const aplicarResponsavelBeneficiario = (b: {
    id: string;
    nome: string;
    telefone?: string | null;
    cpf?: string | null;
    parentesco?: string | null;
  }) => {
    setResponsavelBeneficiarioId(b.id);
    setForm((p) => ({
      ...p,
      representante_nome: b.nome || '',
      representante_contato: (b.telefone || '').trim() || p.representante_contato,
    }));
  };

  const preencherCadastroRapidoDaBusca = useCallback((termo: string) => {
    const qDigits = normalizeDigits(termo);
    setCadastroRapido((p) => ({
      ...p,
      nome: qDigits.length >= 10 ? p.nome : termo.trim(),
      telefone: qDigits.length >= 10 ? termo.trim() : p.telefone,
      cpf: qDigits.length >= 11 ? termo.trim() : p.cpf,
    }));
  }, []);

  const vincularTitularContrato = async (clienteId: string, nomeExibicao?: string) => {
    let cliente = clientes.find((c) => c.id === clienteId) || null;
    if (!cliente || cliente.nome === 'Cliente do contrato' || cliente.nome === 'Titular do contrato') {
      const loaded = await loadClienteById(clienteId);
      if (loaded) cliente = loaded;
    }
    setForm((p) => ({ ...p, cliente_id: clienteId, falecido_id: '' }));
    setContatoBusca(nomeExibicao || cliente?.nome || '');
    setClientesEncontrados([]);
    setBuscaRealizada(false);
    setResponsavelTipo('titular');
    setResponsavelBeneficiarioId('');
    if (cliente) aplicarResponsavelTitular(cliente);
  };

  useEffect(() => {
    const q = contatoBusca.trim();
    if (q.length < 2) {
      setClientesEncontrados([]);
      setResultadosBuscaPlano([]);
      setBuscaRealizada(false);
      setAnalisandoContato(false);
      return;
    }

    setBuscaRealizada(true);
    preencherCadastroRapidoDaBusca(q);

    const seq = ++buscaSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setAnalisandoContato(true);

        if (form.tipo_atendimento === 'plano') {
          const resultados = await buscarTitularAtendimento(empresaIdsBusca, q, buscarClientes).catch(
            () => [] as ResultadoBuscaTitularAtendimento[],
          );
          if (seq !== buscaSeqRef.current) return;
          setResultadosBuscaPlano(resultados);
          setClientesEncontrados([]);
        } else {
          const local = clientes.filter((c) => clienteMatchBusca(c, q)).slice(0, 8);
          setClientesEncontrados(local);
          setResultadosBuscaPlano([]);

          if (local.length < 8) {
            const fromDb = await buscarClientes(q).catch(() => [] as ClienteSB[]);
            if (seq !== buscaSeqRef.current) return;
            const seen = new Set(local.map((c) => c.id));
            const extra = fromDb.filter((c) => !seen.has(c.id));
            if (extra.length > 0) {
              setClientesEncontrados([...local, ...extra].slice(0, 8));
            }
          }
        }

        if (seq === buscaSeqRef.current) setAnalisandoContato(false);
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    contatoBusca,
    clientes,
    buscarClientes,
    preencherCadastroRapidoDaBusca,
    form.tipo_atendimento,
    empresaIdsBusca,
  ]);

  const abrirCadastroRapido = () => {
    preencherCadastroRapidoDaBusca(contatoBusca);
    setModalCadastroRapido(true);
  };

  const selecionarClienteEncontrado = async (cliente: ClienteSB) => {
    if (form.tipo_atendimento === 'plano') {
      const temContrato = await clienteTemContratoAtivo(cliente.id);
      if (!temContrato) {
        showToast('Este cliente não possui contrato ativo. Verifique os dados ou altere para Particular.', 'warning');
        return;
      }
    }
    await vincularTitularContrato(cliente.id, cliente.nome);
  };

  const selecionarResultadoPlano = async (resultado: ResultadoBuscaTitularAtendimento) => {
    if (resultado.tipo === 'beneficiario') {
      const temContrato = await clienteTemContratoAtivo(resultado.cliente_id);
      if (!temContrato) {
        showToast('Beneficiário sem contrato ativo vinculado.', 'warning');
        return;
      }
      await vincularTitularContrato(resultado.cliente_id, resultado.beneficiario.cliente_nome || undefined);
      const b = resultado.beneficiario;
      setResponsavelTipo('beneficiario');
      setResponsavelBeneficiarioId(b.id);
      setForm((p) => ({
        ...p,
        representante_nome: b.nome || '',
        representante_contato: (b.telefone || '').trim() || p.representante_contato,
      }));
      return;
    }
    await selecionarClienteEncontrado(resultado.cliente);
  };

  const cadastrarClienteRapido = async () => {
    if (!cadastroRapido.nome.trim() || !cadastroRapido.cpf.trim() || !cadastroRapido.telefone.trim() || !cadastroRapido.data_nascimento) {
      alert('Preencha nome, CPF/CNPJ, telefone e data de nascimento para cadastrar o cliente.');
      return;
    }

    const payload = {
      nome: cadastroRapido.nome.trim(),
      cpf: cadastroRapido.cpf.trim(),
      telefone_principal: cadastroRapido.telefone.trim(),
      celular: cadastroRapido.telefone.trim(),
      whatsapp: cadastroRapido.telefone.trim(),
      email: cadastroRapido.email.trim() || null,
      data_nascimento: cadastroRapido.data_nascimento,
      origem_canal: 'atendimento',
      ativo: true,
      // Endereço pendente — cadastro rápido no atendimento particular (NOT NULL no banco).
      endereco_cep: '',
      endereco_logradouro: '',
      endereco_numero: '',
      endereco_bairro: '',
      endereco_cidade: '',
      endereco_estado: '',
      usa_endereco_residencial_cobranca: true,
    };

    const { data, error, existingId } = await createCliente(payload as any);
    if (error && existingId) {
      alert(error || 'Já existe um cliente com este CPF. Não é permitido cadastrar outro.');
      return;
    }
    if (error || !data?.id) {
      alert(error || 'Não foi possível cadastrar cliente rapidamente.');
      return;
    }
    await loadClientes();
    await vincularTitularContrato(data.id, cadastroRapido.nome);
    setModalCadastroRapido(false);
    showToast('Cliente cadastrado e selecionado.', 'success');
  };

  const totals = useMemo(() => {
    const srv = selectedServices.reduce((s, i) => { const x = servicosParaUi.find(v => v.id === i.servico_id); return s + (x ? x.preco_base_centavos * i.quantidade : 0); }, 0);
    const prd = selectedProducts.reduce((s, i) => { const x = produtosParaUi.find(v => v.id === i.produto_id); return s + (x ? x.preco_centavos * i.quantidade : 0); }, 0);
    const subtotal = srv + prd;
    const desconto = Math.min(Math.max(0, descontoCentavos), subtotal);
    return { srv, prd, subtotal, desconto, total: subtotal - desconto };
  }, [selectedServices, selectedProducts, servicosParaUi, produtosParaUi, descontoCentavos]);


  const solicitarDesconto = () => {
    let valorCentavos = 0;
    let pct: number | null = null;

    if (descontoTipo === 'porcentagem') {
      const pctInput = Number(descontoInput.replace(',', '.'));
      if (Number.isNaN(pctInput) || pctInput < 0 || pctInput > 100) {
        showToast('Porcentagem inválida (deve ser entre 0 e 100).', 'error');
        return;
      }
      if (pctInput === 0) {
        removerDesconto();
        showToast('Desconto removido.', 'info');
        return;
      }
      valorCentavos = Math.round((totals.subtotal * pctInput) / 100);
      pct = pctInput;
    } else {
      valorCentavos = parseMoedaToCentavos(descontoInput);
      if (valorCentavos <= 0) {
        removerDesconto();
        showToast('Desconto removido.', 'info');
        return;
      }
    }

    if (valorCentavos > totals.subtotal) {
      showToast('O desconto não pode ser maior que o subtotal do atendimento.', 'error');
      return;
    }

    setDescontoPendenteCentavos(valorCentavos);
    setDescontoPercentualPendente(pct);
    setNomeAutorizadorDesconto(descontoAutorizadoPor);
    setModalDesconto(true);
  };

  const confirmarDesconto = () => {
    const nome = nomeAutorizadorDesconto.trim();
    if (!nome) {
      showToast('Informe quem autorizou o desconto.', 'error');
      return;
    }
    setDescontoCentavos(descontoPendenteCentavos);
    setDescontoPercentual(descontoPercentualPendente);
    setDescontoAutorizadoPor(nome);
    if (descontoPercentualPendente !== null) {
      setDescontoInput(String(descontoPercentualPendente).replace('.', ','));
    } else {
      setDescontoInput((descontoPendenteCentavos / 100).toFixed(2).replace('.', ','));
    }
    setModalDesconto(false);
    showToast('Desconto registrado.', 'success');
  };

  const removerDesconto = () => {
    setDescontoCentavos(0);
    setDescontoPercentual(null);
    setDescontoPercentualPendente(null);
    setDescontoAutorizadoPor('');
    setDescontoInput('');
    setDescontoPendenteCentavos(0);
    setNomeAutorizadorDesconto('');
    setModalDesconto(false);
  };

  // Recalcula o desconto se o subtotal mudar e for desconto percentual
  useEffect(() => {
    if (descontoPercentual !== null) {
      const novoValor = Math.round((totals.subtotal * descontoPercentual) / 100);
      setDescontoCentavos(novoValor);
    }
  }, [totals.subtotal, descontoPercentual]);
  const totalPagamentos = pagamentos.reduce((acc, p) => acc + Number(p.valor_centavos || 0), 0);
  const recalcularDivisaoAutomatica = () => {
    const ativos = pagamentos.filter((p) => p.forma);
    if (ativos.length === 0) return;
    const base = Math.floor(totals.total / ativos.length);
    let resto = totals.total - base * ativos.length;

    const atualizados = ativos.map((p) => {
      const extra = resto > 0 ? 1 : 0;
      resto -= extra;
      const vCents = base + extra;
      return {
        ...p,
        valor_centavos: vCents,
        valor_input: (vCents / 100).toFixed(2).replace('.', ',')
      };
    });
    setPagamentos(atualizados);
  };

  const ajustarPagamentosOnChange = (idx: number, eVal: string) => {
    const novoValorCents = parseMoedaToCentavos(eVal);
    setPagamentos((prev) => {
      const temp = prev.map((p, i) =>
        i === idx ? { ...p, valor_centavos: novoValorCents, valor_input: eVal } : p
      );

      if (temp.length <= 1) {
        return temp;
      }

      // O item de ajuste será o último, exceto se estivermos alterando o próprio último, aí será o anterior
      const ajusteIdx = idx === temp.length - 1 ? temp.length - 2 : temp.length - 1;

      let somaOutros = 0;
      for (let i = 0; i < temp.length; i++) {
        if (i !== ajusteIdx) {
          somaOutros += temp[i].valor_centavos;
        }
      }

      const novoValorAjuste = Math.max(0, totals.total - somaOutros);

      return temp.map((p, i) =>
        i === ajusteIdx
          ? {
              ...p,
              valor_centavos: novoValorAjuste,
              valor_input: (novoValorAjuste / 100).toFixed(2).replace('.', ','),
            }
          : p
      );
    });
  };

  // Ajusta automaticamente as formas de pagamento quando o total do atendimento muda
  useEffect(() => {
    if (pagamentos.length === 0) return;

    if (pagamentos.length === 1) {
      setPagamentos((prev) => [
        {
          ...prev[0],
          valor_centavos: totals.total,
          valor_input: (totals.total / 100).toFixed(2).replace('.', ','),
        },
      ]);
      return;
    }

    const somaPrimeiros = pagamentos.slice(0, -1).reduce((acc, p) => acc + p.valor_centavos, 0);
    const novoUltimoValor = Math.max(0, totals.total - somaPrimeiros);

    setPagamentos((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      copy[copy.length - 1] = {
        ...copy[copy.length - 1],
        valor_centavos: novoUltimoValor,
        valor_input: (novoUltimoValor / 100).toFixed(2).replace('.', ','),
      };
      return copy;
    });
  }, [totals.total]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_id) {
      alert(
        form.tipo_atendimento === 'plano'
          ? 'Busque e selecione o titular do plano (telefone, CPF, nº do contrato ou nome).'
          : 'Busque ou cadastre o responsável pelo atendimento.',
      );
      setActiveTab('identificacao');
      return;
    }
    if (form.tipo_atendimento === 'plano' && !currentPlanId) {
      alert('O cliente selecionado não possui plano ativo. Altere para Particular ou busque outro titular.');
      setActiveTab('identificacao');
      return;
    }
    if (modoFalecido === 'historico' && !form.falecido_id) {
      alert('Selecione o falecido já registrado para este cliente.');
      setActiveTab('falecido');
      return;
    }
    if (modoFalecido === 'contrato' && form.tipo_atendimento === 'plano' && !falecidoContratoSelecionado) {
      alert('Selecione o titular ou dependente do plano que faleceu.');
      setActiveTab('falecido');
      return;
    }
    if ((modoFalecido === 'novo' || modoFalecido === 'contrato') && !falecidoInline.nome.trim()) {
      alert('Informe o nome completo do falecido.');
      setActiveTab('falecido');
      return;
    }
    if (
      (modoFalecido === 'novo' || modoFalecido === 'contrato') &&
      !falecidoInline.data_falecimento.trim() &&
      !form.data_falecido.trim()
    ) {
      alert('Informe a data de falecimento.');
      setActiveTab('falecido');
      return;
    }
    if (!form.representante_nome.trim() || !form.representante_contato.trim()) {
      alert('Informe quem é o responsável pelo atendimento (titular, beneficiário ou outra pessoa).');
      setActiveTab('identificacao');
      return;
    }
    if (selectedServices.length === 0 && selectedProducts.length === 0) { alert('Adicione pelo menos um serviço ou produto.'); setActiveTab('servicos'); return; }
    if (totals.desconto > 0 && !descontoAutorizadoPor.trim()) {
      alert('Informe quem autorizou o desconto.');
      setDescontoPendenteCentavos(totals.desconto);
      setNomeAutorizadorDesconto('');
      setModalDesconto(true);
      setActiveTab('resumo');
      return;
    }
    if (form.status === 'concluido') {
      if (!form.representante_nome.trim() || !form.representante_contato.trim()) {
        alert('Informe nome e contato do representante para fechar o atendimento.');
        setActiveTab('resumo');
        return;
      }
      if (pagamentos.length === 0) {
        alert('Adicione ao menos uma forma de pagamento.');
        setActiveTab('resumo');
        return;
      }
      if (totalPagamentos !== totals.total) {
        alert('A soma das formas de pagamento deve ser igual ao valor total do atendimento.');
        setActiveTab('resumo');
        return;
      }
    }
    if (viagemRemocao.gerar) {
      if (!viagemRemocao.veiculo_id) {
        alert('Selecione um veículo para a viagem de remoção.');
        setActiveTab('corpo');
        return;
      }
      if (!viagemRemocao.origem.trim() || !viagemRemocao.destino.trim()) {
        alert('Informe origem e destino da viagem de remoção.');
        setActiveTab('corpo');
        return;
      }
    }
    setSaving(true);
    const payload = {
      ...form, id: id || undefined,
      valor_total_centavos: totals.total,
      valor_desconto_centavos: totals.desconto,
      desconto_autorizado_por: totals.desconto > 0 ? descontoAutorizadoPor.trim() : null,
      valor_pago_centavos: form.status === 'concluido' ? totalPagamentos : 0,
      falecido_inline: modoFalecido === 'novo' || modoFalecido === 'contrato' ? falecidoInline : null,
      itens_servicos: selectedServices.map(s => { const c = servicosParaUi.find(x => x.id === s.servico_id); return { ...s, preco_unitario_centavos: c?.preco_base_centavos || 0, subtotal_centavos: (c?.preco_base_centavos || 0) * s.quantidade }; }),
      itens_produtos: selectedProducts.map(p => { const c = produtosParaUi.find(x => x.id === p.produto_id); return { ...p, preco_unitario_centavos: c?.preco_centavos || 0, subtotal_centavos: (c?.preco_centavos || 0) * p.quantidade }; }),
      
      // Aspecto do corpo
      inspecao_interna: form.inspecao_interna,
      inspecao_externa: form.inspecao_externa,
      coleta_material: form.coleta_material,
      orientacoes_tecnicas: form.orientacoes_tecnicas,
      observacoes_corpo: form.observacoes_corpo,
      comentarios_falecido: form.comentarios_falecido,
      autoriza_remocao: form.autoriza_remocao,
      formulario_preparacao: form.formulario_preparacao,
      local_velorio: form.local_velorio,
      local_sepultamento: form.local_sepultamento,
      religiao_falecido: form.religiao_falecido,
      data_falecido: form.data_falecido,
      data_nascimento_falecido: form.data_nascimento_falecido,
      onde_corpo_se_encontra: form.onde_corpo_se_encontra,
      motivo_morte: form.motivo_morte,
      medico_nome_crm: form.medico_nome_crm,
      declaracao_obito_certidao: form.declaracao_obito_certidao,
      representante_nome: form.representante_nome || null,
      representante_contato: form.representante_contato || null,
      pagamentos_divididos: pagamentos
        .filter((p) => p.forma && Number(p.valor_centavos) > 0)
        .map((p) => ({ forma: p.forma, valor_centavos: Number(p.valor_centavos || 0) })),
    };
    const result = await salvarAtendimento(payload);

    if (!result) {
      setSaving(false);
      showToast(storeError || 'Erro ao salvar o atendimento. Verifique os campos ou as permissões.', 'error');
      return;
    }

    if (result && form.tipo_atendimento === 'plano') {
      const dataObito = (form.data_falecido || falecidoInline.data_falecimento || '').trim().slice(0, 10);
      if (
        dataObito &&
        falecidoContratoSelecionado &&
        falecidoContratoSelecionado !== '__titular__' &&
        falecidoContratoSelecionado !== ''
      ) {
        const baixa = await registrarFalecimentoBeneficiario({
          beneficiarioId: falecidoContratoSelecionado,
          dataFalecimento: dataObito,
          motivo: form.motivo_morte || 'Registrado pelo atendimento funerário',
          origem: 'atendimento',
          atendimentoId: result,
        });
        if (!baixa.ok) {
          showToast(`Atendimento salvo, mas não foi possível baixar o dependente no plano: ${(baixa as any).error}`, 'warning');
        } else if (!baixa.jaRegistrado) {
          showToast('Dependente do plano marcado como falecido (baixa registrada).', 'info');
        }
      }
    }

    // Após salvar, gera a viagem de remoção (se solicitado e for cadastro novo)
    if (result && viagemRemocao.gerar && !isEdit && empresaIdEfetivo) {
      try {
        const driverName = viagemRemocao.motorista_id
          ? motoristasFrota.find((m) => m.id === viagemRemocao.motorista_id)?.nome
          : viagemRemocao.motorista_nome;

        await frotaInsertViagem(empresaIdEfetivo, {
          veiculo_id: viagemRemocao.veiculo_id,
          motorista_id: viagemRemocao.motorista_id || null,
          tipo: 'servico',
          status: 'agendada',
          origem: viagemRemocao.origem,
          destino: viagemRemocao.destino,
          data_saida: viagemRemocao.data_saida,
          hora_saida: viagemRemocao.hora_saida,
          km_saida: viagemRemocao.km_saida ? Number(viagemRemocao.km_saida) : 0,
          passageiros: 0,
          observacao: [
            'Remoção do corpo - Atendimento ' + (form.codigo || result),
            driverName ? `Motorista: ${driverName}` : null,
            viagemRemocao.observacao,
          ].filter(Boolean).join(' | '),
          atendimento_id: result,
        });
        showToast('Atendimento salvo e viagem de remoção agendada na frota.', 'success');
      } catch (err) {
        showToast(
          err instanceof Error
            ? `Atendimento salvo, porém houve erro ao agendar a viagem: ${err.message}`
            : 'Atendimento salvo, porém houve erro ao agendar a viagem.',
          'error'
        );
      }
    }

    if (result) {
      try {
        await gerarOrdemServicoAtendimentoPdf(result);
      } catch (e) {
        console.error(e);
        showToast(
          'Atendimento salvo. O PDF não foi gerado automaticamente — use "Baixar OS (PDF)" na edição ou na lista.',
          'warning'
        );
      }
    }

    setSaving(false);
    if (result) navigate('/atendimentos');
  };

  const tabComplete: Record<Tab, boolean> = {
    identificacao:
      !!form.cliente_id &&
      !!form.data_servico &&
      !!form.representante_nome.trim() &&
      !!form.representante_contato.trim(),
    falecido: true,
    corpo: true,
    servicos: selectedServices.length > 0 || selectedProducts.length > 0,
    resumo: true,
  };

  const handleAddKit = async (kitId: string, kitNome?: string) => {
    if (!kitId) return;
    setLoadingKit(true);
    try {
      const data = await carregarItensKit(kitId);
      if (data.length > 0) {
        const extrasProdutos: ProdutoItem[] = [];
        const extrasServicos: ServicoItem[] = [];
        const newProducts: typeof selectedProducts = [];
        const newServices: typeof selectedServices = [];

        const isService = (name: string) => {
          const norm = (name || '').toLowerCase().trim();
          return (
            norm.includes('remoção') ||
            norm.includes('remocao') ||
            norm.includes('cortejo') ||
            norm.includes('tanatopraxia') ||
            norm.includes('sala de velório') ||
            norm.includes('sala de velorio') ||
            norm.includes('coroa de flores') ||
            norm.includes('flores ornamentais') ||
            norm.includes('clínica') ||
            norm.includes('clinica') ||
            norm.includes('dentista')
          );
        };

        for (const item of data) {
          const p = item.produto;
          if (!p?.id) continue;

          if (isService(p.nome)) {
            // Tenta encontrar o serviço correspondente no catálogo de serviços local
            let matchingService = servicos.find((s) => {
              const sName = s.nome.toLowerCase().trim();
              const pName = p.nome.toLowerCase().trim();
              return sName === pName || sName.includes(pName) || pName.includes(sName);
            });

            // Se não encontrou no catálogo local de servicos, busca no banco geral de ser_servicos por nome
            if (!matchingService) {
              try {
                const { data: dbSvcs } = await supabase
                  .from('ser_servicos')
                  .select('*')
                  .eq('ativo', true)
                  .ilike('nome', p.nome.trim());

                if (dbSvcs && dbSvcs.length > 0) {
                  matchingService = dbSvcs[0] as ServicoItem;
                } else {
                  // Tenta busca parcial se não achou exata
                  const { data: dbSvcsPart } = await supabase
                    .from('ser_servicos')
                    .select('*')
                    .eq('ativo', true)
                    .ilike('nome', `%${p.nome.trim()}%`);
                  if (dbSvcsPart && dbSvcsPart.length > 0) {
                    matchingService = dbSvcsPart[0] as ServicoItem;
                  }
                }
              } catch (dbErr) {
                console.error('Erro ao buscar servico correspondente no banco', dbErr);
              }
            }

            if (matchingService) {
              if (!servicos.some((x) => x.id === matchingService!.id) && !extrasServicos.some((x) => x.id === matchingService!.id)) {
                extrasServicos.push(matchingService);
              }
              newServices.push({ servico_id: matchingService.id, quantidade: Number(item.quantidade) || 1 });
              continue;
            }
          }

          // Caso contrário, trata como produto. Registra nos extras se não estiver no catálogo local.
          if (!produtos.some((x) => x.id === p.id) && !extrasProdutos.some((x) => x.id === p.id)) {
            extrasProdutos.push({
              id: p.id,
              nome: p.nome,
              preco_centavos: Number(p.preco_centavos) || 0,
              estoque_atual: 0,
              ativo: p.ativo !== false,
            });
          }
          newProducts.push({ produto_id: p.id, quantidade: Number(item.quantidade) || 1 });
        }

        if (extrasProdutos.length > 0) {
          setProdutosKitExtra((prev) => {
            const map = new Map(prev.map((x) => [x.id, x]));
            for (const p of extrasProdutos) map.set(p.id, p);
            return Array.from(map.values());
          });
        }
        if (extrasServicos.length > 0) {
          setServicosKitExtra((prev) => {
            const map = new Map(prev.map((x) => [x.id, x]));
            for (const s of extrasServicos) map.set(s.id, s);
            return Array.from(map.values());
          });
        }

        if (newProducts.length > 0) {
          setSelectedProducts((prev) => [
            ...prev.filter((row) => row.produto_id),
            ...newProducts,
          ]);
        }
        if (newServices.length > 0) {
          setSelectedServices((prev) => [
            ...prev.filter((row) => row.servico_id),
            ...newServices,
          ]);
        }

        showToast(
          `Kit "${kitNome || 'selecionado'}" adicionado: ${newProducts.length} produto(s) e ${newServices.length} serviço(s).`,
          'success'
        );
      } else {
        showToast('Este kit não possui itens cadastrados.', 'warning');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar itens do kit.', 'error');
    } finally {
      setLoadingKit(false);
    }
  };

  const handleCarregarKitSelecionado = async () => {
    if (!kitSelecionadoId) {
      showToast('Selecione um kit antes de carregar.', 'warning');
      return;
    }
    const kit = kits.find((k) => k.id === kitSelecionadoId);
    await handleAddKit(kitSelecionadoId, kit?.nome);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? `Editar Atendimento` : 'Novo Atendimento'}
        subtitle={isEdit ? `Código: ${form.codigo}` : 'Registre um novo serviço funerário'}
        actionButton={
          <Button variant="outline" onClick={() => navigate('/atendimentos')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-16">
        {/* ── Main ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Tab Nav */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {TABS.map((t) => {
              const Icon = t.icon;
              const done = tabComplete[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === t.id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">{t.label}</span>
                  {done && activeTab !== t.id && <span className="h-1.5 w-1.5 rounded-full bg-green-400" />}
                </button>
              );
            })}
          </div>

          {/* ── Tab: Identificação ── */}
          {activeTab === 'identificacao' && (
            <Card className="p-6 space-y-5">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <span className="h-6 w-1 bg-blue-600 rounded-full inline-block" />
                Dados do Responsável
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Atendimento</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => alterarTipoAtendimento('particular')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${form.tipo_atendimento === 'particular' ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}
                    >
                      <DollarSign className={`h-5 w-5 ${form.tipo_atendimento === 'particular' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div className="text-left">
                        <div className="font-bold text-sm">Particular</div>
                        <div className="text-[10px] opacity-70">Venda avulsa / direta</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => alterarTipoAtendimento('plano')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${form.tipo_atendimento === 'plano' ? 'bg-purple-50 border-purple-600 text-purple-700' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}
                    >
                      <FileText className={`h-5 w-5 ${form.tipo_atendimento === 'plano' ? 'text-purple-600' : 'text-gray-400'}`} />
                      <div className="text-left">
                        <div className="font-bold text-sm">Plano</div>
                        <div className="text-[10px] opacity-70">Desconto conforme contrato</div>
                      </div>
                    </button>
                  </div>
                </div>

                {!form.cliente_id && (
                  <div className="md:col-span-2 border rounded-xl p-3 bg-gray-50 space-y-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 min-w-0">
                      <Input
                        label={
                          form.tipo_atendimento === 'plano'
                            ? 'Buscar titular do plano (telefone, CPF, nº contrato ou nome)'
                            : 'Buscar responsável (telefone, CPF/CNPJ ou nome)'
                        }
                        value={contatoBusca}
                        onChange={(e) => {
                          setContatoBusca(e.target.value);
                          if (!e.target.value.trim()) setBuscaRealizada(false);
                        }}
                        placeholder={
                          form.tipo_atendimento === 'plano'
                            ? 'Digite telefone, CPF, código do contrato ou nome do titular/dependente'
                            : 'Digite telefone, CPF ou nome do responsável'
                        }
                      />
                    </div>
                    {form.tipo_atendimento === 'particular' &&
                      buscaRealizada &&
                      clientesEncontrados.length === 0 &&
                      contatoBusca.trim().length >= 2 &&
                      !analisandoContato &&
                      !form.cliente_id && (
                      <button
                        type="button"
                        onClick={abrirCadastroRapido}
                        title="Cadastrar cliente rápido"
                        className="shrink-0 h-11 w-11 mb-0.5 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-500 transition-colors"
                      >
                        <Plus className="h-6 w-6" />
                      </button>
                    )}
                  </div>

                  {analisandoContato && clientesEncontrados.length === 0 && resultadosBuscaPlano.length === 0 && (
                    <p className="text-xs text-gray-500">Buscando…</p>
                  )}

                  {form.tipo_atendimento === 'particular' && clientesEncontrados.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase">Responsáveis encontrados</p>
                      {clientesEncontrados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => void selecionarClienteEncontrado(c)}
                          className="w-full text-left px-3 py-2 rounded-lg border bg-white hover:bg-blue-50 transition-colors"
                        >
                          <div className="font-medium text-gray-900">{c.nome}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {c.cpf || '—'} • {telefoneClienteExibicao(c)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {form.tipo_atendimento === 'plano' && resultadosBuscaPlano.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase">Titulares e dependentes encontrados</p>
                      {resultadosBuscaPlano.map((r) => {
                        if (r.tipo === 'beneficiario') {
                          const b = r.beneficiario;
                          return (
                            <button
                              key={`b-${b.id}`}
                              type="button"
                              onClick={() => void selecionarResultadoPlano(r)}
                              className="w-full text-left px-3 py-2 rounded-lg border bg-white hover:bg-purple-50 transition-colors"
                            >
                              <div className="font-medium text-gray-900">{b.nome}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Dependente{b.parentesco ? ` (${b.parentesco})` : ''} • {b.cpf || '—'}
                              </div>
                              <div className="text-xs text-purple-700 mt-0.5">
                                Titular: {b.cliente_nome || '—'}
                                {b.contrato_codigo ? ` • Contrato: ${b.contrato_codigo}` : ''}
                              </div>
                            </button>
                          );
                        }
                        const c = r.cliente;
                        const contratos = contratosClienteExibicao(c);
                        return (
                          <button
                            key={`c-${c.id}`}
                            type="button"
                            onClick={() => void selecionarResultadoPlano(r)}
                            className="w-full text-left px-3 py-2 rounded-lg border bg-white hover:bg-purple-50 transition-colors"
                          >
                            <div className="font-medium text-gray-900">{c.nome}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {c.cpf || '—'} • {telefoneClienteExibicao(c)}
                            </div>
                            {contratos && (
                              <div className="text-xs text-purple-700 mt-0.5">Contrato: {contratos}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {buscaRealizada &&
                    contatoBusca.trim().length >= 2 &&
                    !analisandoContato &&
                    !form.cliente_id &&
                    ((form.tipo_atendimento === 'particular' && clientesEncontrados.length === 0) ||
                      (form.tipo_atendimento === 'plano' && resultadosBuscaPlano.length === 0)) && (
                    <p className="text-xs text-gray-600">
                      {form.tipo_atendimento === 'plano' ? (
                        <>Nenhum titular ou dependente com contrato encontrado. Tente outro telefone, CPF ou número do contrato.</>
                      ) : (
                        <>Nenhum responsável encontrado. Toque no <strong>+</strong> para cadastrar rapidamente.</>
                      )}
                    </p>
                  )}
                  </div>
                )}

                <Modal
                  isOpen={modalCadastroRapido}
                  onClose={() => setModalCadastroRapido(false)}
                  title="Cadastrar cliente rápido"
                  size="md"
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Nome *" value={cadastroRapido.nome} onChange={(e) => setCadastroRapido((p) => ({ ...p, nome: e.target.value }))} />
                      <Input label="CPF/CNPJ *" value={cadastroRapido.cpf} onChange={(e) => setCadastroRapido((p) => ({ ...p, cpf: e.target.value }))} />
                      <Input label="Telefone *" value={cadastroRapido.telefone} onChange={(e) => setCadastroRapido((p) => ({ ...p, telefone: e.target.value }))} />
                      <Input label="E-mail" type="email" value={cadastroRapido.email} onChange={(e) => setCadastroRapido((p) => ({ ...p, email: e.target.value }))} />
                      <Input label="Data de nascimento *" type="date" value={cadastroRapido.data_nascimento} onChange={(e) => setCadastroRapido((p) => ({ ...p, data_nascimento: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setModalCadastroRapido(false)}>
                        Cancelar
                      </Button>
                      <Button type="button" onClick={() => void cadastrarClienteRapido()}>
                        Cadastrar e selecionar
                      </Button>
                    </div>
                  </div>
                </Modal>

                {form.cliente_id ? (
                  <div className="md:col-span-2 space-y-4">
                    <div className={`rounded-xl border p-4 space-y-2 ${form.tipo_atendimento === 'plano' ? 'border-purple-100 bg-purple-50/50' : 'border-blue-100 bg-blue-50/50'}`}>
                      <p className={`text-xs font-semibold uppercase ${form.tipo_atendimento === 'plano' ? 'text-purple-800' : 'text-blue-800'}`}>
                        {form.tipo_atendimento === 'plano' ? 'Titular do contrato' : 'Responsável pelo atendimento'}
                      </p>
                      <p className="font-semibold text-gray-900">{titularSelecionado?.nome || contatoBusca || '—'}</p>
                      <p className="text-sm text-gray-600">
                        {titularSelecionado?.cpf || '—'} • {titularSelecionado ? telefoneClienteExibicao(titularSelecionado) : '—'}
                      </p>
                      {form.tipo_atendimento === 'plano' && (contratoVinculado || contratosClienteExibicao(titularSelecionado || ({} as ClienteSB))) && (
                        <p className="text-sm text-purple-800">
                          Contrato: {contratoVinculado || contratosClienteExibicao(titularSelecionado!)}
                          {planoDetectado ? ` • ${planoDetectado.nome}` : ''}
                        </p>
                      )}
                      {form.tipo_atendimento === 'particular' && (
                        <p className="text-xs text-blue-700/80 pt-1">
                          Este cliente será registrado como responsável pelo atendimento.
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-1"
                        onClick={() => {
                          limparVinculoCliente();
                          setContatoBusca('');
                          setClientesEncontrados([]);
                          setResultadosBuscaPlano([]);
                          setBuscaRealizada(false);
                        }}
                      >
                        {form.tipo_atendimento === 'plano' ? 'Trocar contrato/titular' : 'Trocar responsável'}
                      </Button>
                    </div>

                    {form.tipo_atendimento === 'plano' && (
                      <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4">
                        <div>
                          <p className="text-sm font-bold text-gray-900">Quem autoriza o atendimento? *</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Pode ser o titular, um dependente do contrato ou outra pessoa.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {(
                            [
                              { id: 'titular' as const, label: 'Titular do contrato' },
                              { id: 'beneficiario' as const, label: 'Beneficiário do contrato' },
                              { id: 'outro' as const, label: 'Outra pessoa' },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setResponsavelTipo(opt.id);
                                if (opt.id === 'titular' && titularSelecionado) aplicarResponsavelTitular(titularSelecionado);
                                if (opt.id === 'beneficiario' && responsavelBeneficiarioId) {
                                  const b = beneficiariosAtivos.find((x) => x.id === responsavelBeneficiarioId);
                                  if (b) aplicarResponsavelBeneficiario(b);
                                }
                              }}
                              className={`flex-1 py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                                responsavelTipo === opt.id
                                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                                  : 'border-gray-100 text-gray-600 hover:border-gray-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {responsavelTipo === 'titular' && (
                          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5">
                            O titular acima será o responsável pelo atendimento.
                          </p>
                        )}

                        {responsavelTipo === 'beneficiario' && (
                          beneficiariosAtivos.length === 0 ? (
                            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
                              Não há beneficiários ativos neste contrato. Use &quot;Titular&quot; ou &quot;Outra pessoa&quot;.
                            </p>
                          ) : (
                            <>
                              <Select
                                label="Selecione o beneficiário"
                                value={responsavelBeneficiarioId}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  setResponsavelBeneficiarioId(id);
                                  const b = beneficiariosAtivos.find((x) => x.id === id);
                                  if (b) aplicarResponsavelBeneficiario(b);
                                }}
                              >
                                <option value="">Escolha quem representa o atendimento...</option>
                                {beneficiariosAtivos.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.nome} {b.parentesco ? `(${b.parentesco})` : ''}
                                  </option>
                                ))}
                              </Select>
                              {responsavelBeneficiarioId && form.representante_nome.trim() && (
                                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5">
                                  <span className="font-medium text-gray-800">{form.representante_nome}</span>
                                  {form.representante_contato.trim() ? ` • ${form.representante_contato}` : ''}
                                </p>
                              )}
                            </>
                          )
                        )}

                        {responsavelTipo === 'outro' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input
                              label="Nome do responsável *"
                              value={responsavelOutro.nome}
                              onChange={(e) => {
                                const nome = e.target.value;
                                setResponsavelOutro((p) => ({ ...p, nome }));
                                setForm((f) => ({ ...f, representante_nome: nome }));
                              }}
                            />
                            <Input
                              label="CPF (opcional)"
                              value={responsavelOutro.cpf}
                              onChange={(e) => setResponsavelOutro((p) => ({ ...p, cpf: e.target.value }))}
                            />
                            <Input
                              label="Telefone / WhatsApp *"
                              value={responsavelOutro.telefone}
                              onChange={(e) => {
                                const telefone = e.target.value;
                                setResponsavelOutro((p) => ({ ...p, telefone }));
                                setForm((f) => ({ ...f, representante_contato: telefone }));
                              }}
                            />
                            <Input
                              label="Vínculo (ex.: filho, vizinho)"
                              value={responsavelOutro.parentesco}
                              onChange={(e) => setResponsavelOutro((p) => ({ ...p, parentesco: e.target.value }))}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}

                {form.tipo_atendimento === 'plano' && planoDetectado && !form.cliente_id && (
                  <div className="md:col-span-2 rounded-lg border border-purple-100 bg-purple-50/60 px-3 py-2">
                    <p className="text-sm text-purple-800">
                      Plano ativo: <span className="font-semibold">{planoDetectado.nome}</span>
                      {contratoVinculado ? ` • Contrato ${contratoVinculado}` : ''}
                    </p>
                  </div>
                )}

                {form.tipo_atendimento === 'plano' && form.cliente_id && (
                  <p className="md:col-span-2 text-xs text-purple-700">
                    Os dados de quem faleceu são preenchidos na aba <strong>Falecido</strong>.
                  </p>
                )}

                <Input
                  label="Data do Serviço *"
                  type="date"
                  required
                  value={form.data_servico}
                  onChange={(e) => setForm(p => ({ ...p, data_servico: e.target.value }))}
                />

                <Select
                  label="Status do Atendimento"
                  value={form.status}
                  onChange={(e) => setForm(p => ({ ...p, status: e.target.value as any }))}
                >
                  <option value="aguardando">Aguardando</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </Select>

                <ColaboradorSearchSelect
                  label="Atendente Responsável"
                  value={form.atendente_id}
                  onChange={(id) => setForm((p) => ({ ...p, atendente_id: id }))}
                  colaboradores={colaboradoresGrupo}
                  rolesPermitidos={ROLES_ATENDENTE}
                  buscarRemoto={buscarColaboradoresRemoto(ROLES_ATENDENTE)}
                  helperText="Todas as unidades do grupo — digite para buscar por nome, e-mail ou filial."
                  placeholder="Buscar atendente em todas as unidades…"
                />

                <ColaboradorSearchSelect
                  label="Agente Funerário Responsável"
                  value={form.agente_funerario_id}
                  onChange={(id) => setForm((p) => ({ ...p, agente_funerario_id: id }))}
                  colaboradores={colaboradoresGrupo}
                  rolesPermitidos={ROLES_AGENTE_FUNERARIO}
                  buscarRemoto={buscarColaboradoresRemoto(ROLES_AGENTE_FUNERARIO)}
                  helperText="Todas as unidades do grupo — digite para buscar por nome, e-mail ou filial."
                  placeholder="Buscar agente funerário em todas as unidades…"
                />
              </div>

              <Textarea
                label="Observações Internas"
                value={form.observacoes}
                onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Detalhes sobre ornamentação, traslados, horários..."
                rows={3}
              />

              <div className="flex justify-end">
                <Button type="button" onClick={() => setActiveTab('falecido')}>
                  Próximo: Falecido →
                </Button>
              </div>
            </Card>
          )}

          {/* ── Tab: Falecido ── */}
          {activeTab === 'falecido' && (
            <Card className="p-6 space-y-5">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <span className="h-6 w-1 bg-rose-500 rounded-full inline-block" />
                Dados do Falecido
              </h3>

              {!form.cliente_id ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Selecione o responsável na aba <strong>Responsável</strong> antes de informar quem faleceu.
                  <div className="mt-3">
                    <Button type="button" variant="outline" onClick={() => setActiveTab('identificacao')}>
                      Ir para Responsável
                    </Button>
                  </div>
                </div>
              ) : form.tipo_atendimento === 'particular' ? (
                <>
                  <p className="text-sm text-gray-600">
                    Atendimento particular: informe os dados de quem faleceu. O cadastro será criado neste atendimento.
                  </p>
                  {isEdit && modoFalecido === 'historico' && form.falecido_id ? (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      Falecido vinculado:{' '}
                      <strong>{falecidos.find((f) => f.id === form.falecido_id)?.nome || '—'}</strong>
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Nome Completo *"
                      value={falecidoInline.nome}
                      onChange={(e) => setFalecidoInline((p) => ({ ...p, nome: e.target.value }))}
                      placeholder="Nome do falecido"
                    />
                    <Input
                      label="CPF"
                      value={falecidoInline.cpf}
                      onChange={(e) => setFalecidoInline((p) => ({ ...p, cpf: e.target.value }))}
                      placeholder="000.000.000-00"
                    />
                    <Input
                      label="Data de Nascimento"
                      type="date"
                      value={falecidoInline.data_nascimento}
                      onChange={(e) => {
                        const data = e.target.value;
                        setFalecidoInline((p) => ({ ...p, data_nascimento: data }));
                        setForm((f) => ({ ...f, data_nascimento_falecido: data }));
                      }}
                    />
                    <Input
                      label="Data de Falecimento *"
                      type="date"
                      value={falecidoInline.data_falecimento}
                      onChange={(e) => {
                        const data = e.target.value;
                        setFalecidoInline((p) => ({ ...p, data_falecimento: data }));
                        setForm((f) => ({ ...f, data_falecido: data }));
                      }}
                    />
                    <Input
                      label="Local de Falecimento"
                      value={falecidoInline.local_falecimento}
                      onChange={(e) => setFalecidoInline((p) => ({ ...p, local_falecimento: e.target.value }))}
                      placeholder="Hospital, residência..."
                    />
                    <Select
                      label="Parentesco com o responsável"
                      value={falecidoInline.parentesco}
                      onChange={(e) => setFalecidoInline((p) => ({ ...p, parentesco: e.target.value }))}
                    >
                      <option value="">Selecione...</option>
                      {['Cônjuge', 'Pai', 'Mãe', 'Filho(a)', 'Irmão/Irmã', 'Avô/Avó', 'Tio(a)', 'Sobrinho(a)', 'Primo(a)', 'Outro'].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </Select>
                  </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Plano <span className="font-semibold">{planoDetectado?.nome || 'ativo'}</span>
                    {contratoVinculado ? ` • contrato ${contratoVinculado}` : ''}: indique quem faleceu.
                  </p>

                  {falecidos.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      {(
                        [
                          { id: 'contrato' as const, label: 'Titular ou dependente do plano' },
                          { id: 'historico' as const, label: 'Falecido já registrado' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => mudarModoFalecido(opt.id)}
                          className={`flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                            modoFalecido === opt.id
                              ? 'bg-purple-600 border-purple-600 text-white shadow'
                              : 'bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {modoFalecido === 'contrato' && (
                    <Select
                      label="Quem faleceu no plano *"
                      value={falecidoContratoSelecionado}
                      onChange={(e) => aplicarPessoaContratoComoFalecido(e.target.value)}
                    >
                      <option value="">Selecione titular ou dependente...</option>
                      <option value="__titular__">Titular do contrato</option>
                      {beneficiariosAtivos.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome} {b.parentesco ? `(${b.parentesco})` : ''}
                        </option>
                      ))}
                    </Select>
                  )}

                  {modoFalecido === 'historico' && (
                    <Select
                      label="Falecido já registrado neste cliente *"
                      value={form.falecido_id}
                      onChange={(e) => setForm((p) => ({ ...p, falecido_id: e.target.value }))}
                    >
                      <option value="">Selecione...</option>
                      {falecidos.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </Select>
                  )}

                  {(modoFalecido === 'novo' || modoFalecido === 'contrato') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Nome Completo *"
                        value={falecidoInline.nome}
                        onChange={(e) => setFalecidoInline((p) => ({ ...p, nome: e.target.value }))}
                        placeholder="Nome do falecido"
                        disabled={modoFalecido === 'contrato'}
                      />
                      <Input
                        label="CPF"
                        value={falecidoInline.cpf}
                        onChange={(e) => setFalecidoInline((p) => ({ ...p, cpf: e.target.value }))}
                        placeholder="000.000.000-00"
                        disabled={modoFalecido === 'contrato'}
                      />
                      <Input
                        label="Data de Nascimento"
                        type="date"
                        value={falecidoInline.data_nascimento}
                        onChange={(e) => {
                          const data = e.target.value;
                          setFalecidoInline((p) => ({ ...p, data_nascimento: data }));
                          setForm((f) => ({ ...f, data_nascimento_falecido: data }));
                        }}
                      />
                      <Input
                        label="Data de Falecimento *"
                        type="date"
                        value={falecidoInline.data_falecimento}
                        onChange={(e) => {
                          const data = e.target.value;
                          setFalecidoInline((p) => ({ ...p, data_falecimento: data }));
                          setForm((f) => ({ ...f, data_falecido: data }));
                        }}
                      />
                      <Input
                        label="Local de Falecimento"
                        value={falecidoInline.local_falecimento}
                        onChange={(e) => setFalecidoInline((p) => ({ ...p, local_falecimento: e.target.value }))}
                        placeholder="Hospital, residência..."
                      />
                      <Select
                        label="Parentesco"
                        value={falecidoInline.parentesco}
                        onChange={(e) => setFalecidoInline((p) => ({ ...p, parentesco: e.target.value }))}
                        disabled={modoFalecido === 'contrato'}
                      >
                        <option value="">Selecione...</option>
                        {['Titular', 'Cônjuge', 'Pai', 'Mãe', 'Filho(a)', 'Irmão/Irmã', 'Avô/Avó', 'Tio(a)', 'Sobrinho(a)', 'Primo(a)', 'Dependente', 'Outro'].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                        {falecidoInline.parentesco && !['Titular', 'Cônjuge', 'Pai', 'Mãe', 'Filho(a)', 'Irmão/Irmã', 'Avô/Avó', 'Tio(a)', 'Sobrinho(a)', 'Primo(a)', 'Dependente', 'Outro'].includes(falecidoInline.parentesco) && (
                          <option value={falecidoInline.parentesco}>{falecidoInline.parentesco}</option>
                        )}
                      </Select>
                    </div>
                  )}

                  {modoFalecido === 'contrato' &&
                    falecidoContratoSelecionado &&
                    falecidoContratoSelecionado !== '__titular__' && (
                    <p className="text-xs text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                      Ao salvar, o dependente será baixado automaticamente no plano (registro de óbito).
                    </p>
                  )}
                </>
              )}

              <div className="border-t pt-4 mt-2">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Informações Complementares do Óbito</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Local de Velório"
                    value={form.local_velorio}
                    onChange={(e) => setForm(p => ({ ...p, local_velorio: e.target.value }))}
                    placeholder="Capela, igreja, residência..."
                  />
                  <Input
                    label="Local de Sepultamento"
                    value={form.local_sepultamento}
                    onChange={(e) => setForm(p => ({ ...p, local_sepultamento: e.target.value }))}
                    placeholder="Cemitério e quadra/lote"
                  />
                  <OpcaoSearchSelect
                    label="Religião"
                    value={form.religiao_falecido}
                    onChange={(val) => setForm((p) => ({ ...p, religiao_falecido: val }))}
                    opcoes={RELIGIOES}
                    allowCustom
                    resolveDisplay={textoExibicaoReligiao}
                    placeholder="Buscar religião…"
                    helperText="Digite para filtrar (ex.: católica, evangélica) ou informe outra."
                    portalId="religiao-search-select-portal"
                  />
                  <Input
                    label="Onde o corpo se encontra"
                    value={form.onde_corpo_se_encontra}
                    onChange={(e) => setForm(p => ({ ...p, onde_corpo_se_encontra: e.target.value }))}
                    placeholder="Hospital, IML, residência..."
                  />
                  {!mostraCadastroFalecidoInline && form.cliente_id && (
                    <>
                      <Input
                        label="Data de Nascimento"
                        type="date"
                        value={form.data_nascimento_falecido}
                        onChange={(e) => setForm((p) => ({ ...p, data_nascimento_falecido: e.target.value }))}
                      />
                      <Input
                        label="Data de Falecimento *"
                        type="date"
                        value={form.data_falecido}
                        onChange={(e) => setForm((p) => ({ ...p, data_falecido: e.target.value }))}
                      />
                    </>
                  )}
                  <Input
                    label="Motivo da Morte"
                    value={form.motivo_morte}
                    onChange={(e) => setForm(p => ({ ...p, motivo_morte: e.target.value }))}
                    placeholder="Causa informada"
                  />
                  <Input
                    label="Nome do Médico / CRM"
                    value={form.medico_nome_crm}
                    onChange={(e) => setForm(p => ({ ...p, medico_nome_crm: e.target.value }))}
                    placeholder="Nome e número do CRM"
                  />
                </div>
                <div className="mt-4">
                  <Textarea
                    label="Declaração de Óbito / Certidão de Óbito"
                    value={form.declaracao_obito_certidao}
                    onChange={(e) => setForm(p => ({ ...p, declaracao_obito_certidao: e.target.value }))}
                    placeholder="Dados da declaração/certidão"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setActiveTab('identificacao')}>
                  ← Responsável
                </Button>
                <Button type="button" onClick={() => setActiveTab('corpo')}>
                  Próximo: Aspecto do Corpo →
                </Button>
              </div>
            </Card>
          )}

          {/* ── Tab: Corpo ── */}
          {activeTab === 'corpo' && (
            <Card className="p-6 space-y-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                <span className="h-6 w-1 bg-indigo-500 rounded-full inline-block" />
                Aspecto do Corpo e Orientação Técnica
              </h3>

              <div className="space-y-4">
                <Input
                  label="Formulário / Título"
                  value={form.formulario_preparacao}
                  onChange={(e) => setForm(p => ({ ...p, formulario_preparacao: e.target.value }))}
                  placeholder="Ex: Laudo de Preparação, Aspecto Geral..."
                />

                <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Orientação Técnica</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setForm(p => ({ ...p, inspecao_interna: !p.inspecao_interna }))}>
                      <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${form.inspecao_interna ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                        {form.inspecao_interna && <CheckSquare className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-sm text-gray-700">Inspeção Interna</span>
                    </div>

                    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setForm(p => ({ ...p, inspecao_externa: !p.inspecao_externa }))}>
                      <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${form.inspecao_externa ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                        {form.inspecao_externa && <CheckSquare className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-sm text-gray-700">Inspeção Externa</span>
                    </div>

                    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setForm(p => ({ ...p, coleta_material: !p.coleta_material }))}>
                      <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${form.coleta_material ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                        {form.coleta_material && <CheckSquare className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-sm text-gray-700">Coleta Material</span>
                    </div>
                  </div>
                </div>

                <Textarea
                  label="Orientações Técnicas"
                  value={form.orientacoes_tecnicas}
                  onChange={(e) => setForm(p => ({ ...p, orientacoes_tecnicas: e.target.value }))}
                  placeholder="Orientações técnicas detalhadas..."
                  rows={2}
                />

                <Textarea
                  label="Observações Gerais do Corpo"
                  value={form.observacoes_corpo}
                  onChange={(e) => setForm(p => ({ ...p, observacoes_corpo: e.target.value }))}
                  placeholder="Descreva o estado do corpo, lesões, etc..."
                  rows={2}
                />

                <Textarea
                  label="Observação / Comentários do Falecido"
                  value={form.comentarios_falecido}
                  onChange={(e) => setForm(p => ({ ...p, comentarios_falecido: e.target.value }))}
                  placeholder="Comentários adicionais sobre o falecido..."
                  rows={2}
                />

                <div className="flex items-center gap-2 cursor-pointer select-none p-3 bg-red-50 rounded-lg border border-red-100" onClick={() => setForm(p => ({ ...p, autoriza_remocao: !p.autoriza_remocao }))}>
                  <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${form.autoriza_remocao ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-red-300'}`}>
                    {form.autoriza_remocao && <CheckSquare className="h-3.5 w-3.5" />}
                  </div>
                  <span className="text-sm font-semibold text-red-700">Autoriza Remoção</span>
                </div>

                {/* ── Geração automática de viagem (busca do corpo) ── */}
                {form.autoriza_remocao && !isEdit && (
                  <div className="border-2 border-dashed border-emerald-200 rounded-xl p-4 bg-emerald-50/40 space-y-4">
                    <div
                      className="flex items-start gap-3 cursor-pointer select-none"
                      onClick={() => setViagemRemocao(p => ({ ...p, gerar: !p.gerar }))}
                    >
                      <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors mt-0.5 ${viagemRemocao.gerar ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-emerald-400'}`}>
                        {viagemRemocao.gerar && <CheckSquare className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          Gerar viagem para buscar o corpo
                        </p>
                        <p className="text-xs text-emerald-700/80 leading-relaxed">
                          Cria automaticamente uma viagem agendada no módulo de Frota,
                          já vinculada a este atendimento, para que o motorista realize a remoção.
                        </p>
                      </div>
                    </div>

                    {viagemRemocao.gerar && (
                      <div className="space-y-4 pt-2 border-t border-emerald-200/70">
                        {veiculosFrota.length === 0 && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                            Nenhum veículo cadastrado no módulo de Frota. Cadastre um veículo antes de gerar a viagem.
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Select
                            label="Veículo *"
                            value={viagemRemocao.veiculo_id}
                            onChange={(e) => setViagemRemocao(p => ({ ...p, veiculo_id: e.target.value }))}
                          >
                            <option value="">Selecione o veículo...</option>
                            {veiculosFrota.map(v => (
                              <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>
                            ))}
                          </Select>
                          <div className="space-y-1">
                            <Select
                              label="Motorista"
                              value={viagemRemocao.motorista_id}
                              onChange={(e) => setViagemRemocao(p => ({ ...p, motorista_id: e.target.value, motorista_nome: e.target.value ? '' : p.motorista_nome }))}
                            >
                              <option value="">Digitar manualmente / sem cadastro...</option>
                              {motoristasFrota.map(m => (
                                <option key={m.id} value={m.id}>{m.nome}</option>
                              ))}
                            </Select>
                            {!viagemRemocao.motorista_id && (
                              <Input
                                placeholder="Nome do motorista..."
                                value={viagemRemocao.motorista_nome || ''}
                                onChange={(e) => setViagemRemocao(p => ({ ...p, motorista_nome: e.target.value }))}
                              />
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            label="Origem (onde está o corpo) *"
                            value={viagemRemocao.origem}
                            onChange={(e) => setViagemRemocao(p => ({ ...p, origem: e.target.value }))}
                            placeholder="Hospital, IML, residência..."
                          />
                          <Input
                            label="Destino *"
                            value={viagemRemocao.destino}
                            onChange={(e) => setViagemRemocao(p => ({ ...p, destino: e.target.value }))}
                            placeholder="Capela, sede da funerária..."
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <Input
                            label="Data prevista"
                            type="date"
                            value={viagemRemocao.data_saida}
                            onChange={(e) => setViagemRemocao(p => ({ ...p, data_saida: e.target.value }))}
                          />
                          <Input
                            label="Hora prevista"
                            type="time"
                            value={viagemRemocao.hora_saida}
                            onChange={(e) => setViagemRemocao(p => ({ ...p, hora_saida: e.target.value }))}
                          />
                          <Input
                            label="KM saída"
                            type="number"
                            value={viagemRemocao.km_saida}
                            onChange={(e) => setViagemRemocao(p => ({ ...p, km_saida: e.target.value }))}
                            placeholder="Opcional"
                          />
                        </div>

                        <Textarea
                          label="Observação para o motorista"
                          value={viagemRemocao.observacao}
                          onChange={(e) => setViagemRemocao(p => ({ ...p, observacao: e.target.value }))}
                          placeholder="Contato no local, particularidades da remoção..."
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                )}

                {form.autoriza_remocao && isEdit && (
                  <div className="text-xs text-gray-500 italic bg-gray-50 border border-gray-200 rounded-lg p-3">
                    A viagem de remoção é gerada apenas no cadastro inicial do atendimento.
                    Para registrar uma nova viagem, vá até o módulo de Frota → Viagens.
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setActiveTab('falecido')}>
                  ← Falecido
                </Button>
                <Button type="button" onClick={() => setActiveTab('servicos')}>
                  Próximo: Serviços →
                </Button>
              </div>
            </Card>
          )}

          {/* ── Tab: Serviços ── */}
          {activeTab === 'servicos' && (
            <div className="space-y-4">
              <Card className="p-6 sm:p-8 border-2 border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/90 to-white shadow-sm">
                <div className="max-w-lg mx-auto flex flex-col items-center text-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-indigo-100 flex items-center justify-center shadow-inner">
                    <Package className="h-7 w-7 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">Carregar kit completo</h3>
                    <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                      Escolha o tipo de kit (Ônix, Fênix, particular…) para preencher{' '}
                      <strong>serviços</strong> e <strong>urnas/produtos</strong> automaticamente.
                    </p>
                    {planoDetectado?.nome && (
                      <p className="text-xs text-purple-700 mt-2 font-medium">
                        Plano do cliente: {planoDetectado.nome}
                      </p>
                    )}
                  </div>

                  {kitsParaSelecao.length === 0 ? (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 w-full">
                      Nenhum kit cadastrado nesta unidade. Cadastre em Estoque → Kits.
                    </p>
                  ) : (
                    <>
                      <div className="w-full text-left">
                        <Select
                          label="Tipo de kit"
                          value={kitSelecionadoId}
                          onChange={(e) => setKitSelecionadoId(e.target.value)}
                          disabled={loadingKit}
                          helperText={form.tipo_atendimento === 'particular' ? "Kits (inclusive de planos) estão liberados para uso em atendimentos particulares." : undefined}
                        >
                          <option value="">Selecione o kit...</option>
                          {kitsParaSelecao.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.nome}
                              {k.plano_nome ? ` · ${k.plano_nome}` : ''}
                              {planoIdAtivo && k.plano_id === planoIdAtivo ? ' ★' : ''}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {kitsParaSelecao.length <= 6 && (
                        <div className="flex flex-wrap justify-center gap-2 w-full">
                          {kitsParaSelecao.map((k) => {
                            const ativo = kitSelecionadoId === k.id;
                            return (
                              <button
                                key={k.id}
                                type="button"
                                disabled={loadingKit}
                                onClick={() => setKitSelecionadoId(k.id)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                                  ativo
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                    : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                                }`}
                              >
                                {k.nome}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <Button
                        type="button"
                        size="lg"
                        disabled={loadingKit || !kitSelecionadoId}
                        onClick={() => void handleCarregarKitSelecionado()}
                        className="min-w-[260px] shadow-md"
                      >
                        <Package className="h-5 w-5 mr-2" />
                        {loadingKit ? 'Carregando kit...' : 'Carregar serviços e produtos'}
                      </Button>
                    </>
                  )}
                </div>
              </Card>

              {/* Serviços */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <span className="h-6 w-1 bg-blue-600 rounded-full" />
                    Serviços Contratados
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedServices(p => [...p, { servico_id: '', quantidade: 1 }])}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                <div className="space-y-3">
                  {selectedServices.map((item, i) => {
                    const svc = servicosParaUi.find(x => x.id === item.servico_id);
                    return (
                      <div key={i} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg border">
                        <div className="flex-1">
                          <OpcaoSearchSelect
                            value={item.servico_id}
                            onChange={(val) => { const n = [...selectedServices]; n[i].servico_id = val; setSelectedServices(n); }}
                            opcoes={servicosOpcoes}
                            persistir="value"
                            resolveDisplay={resolveDisplayServico}
                            placeholder="Escolha um serviço..."
                            portalId={`servico-select-${i}`}
                          />
                        </div>
                        <div className="w-20">
                          <Input
                            type="number" min="1"
                            value={item.quantidade}
                            onChange={(e) => { const n = [...selectedServices]; n[i].quantidade = parseInt(e.target.value) || 1; setSelectedServices(n); }}
                          />
                        </div>
                        {svc && <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">{fmt(svc.preco_base_centavos * item.quantidade)}</span>}
                        <button type="button" onClick={() => setSelectedServices(p => p.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {selectedServices.length === 0 && (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center text-gray-400 text-sm">
                      Nenhum serviço adicionado
                    </div>
                  )}
                </div>
              </Card>

              {/* Produtos */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <span className="h-6 w-1 bg-purple-500 rounded-full" />
                    Urnas e Produtos
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedProducts(p => [...p, { produto_id: '', quantidade: 1 }])}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Produto
                  </Button>
                </div>
                <div className="space-y-3">
                  {selectedProducts.map((item, i) => {
                    const prd = produtosParaUi.find(x => x.id === item.produto_id);
                    return (
                      <div key={i} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg border">
                        <div className="flex-1">
                          <OpcaoSearchSelect
                            value={item.produto_id}
                            onChange={(val) => { const n = [...selectedProducts]; n[i].produto_id = val; setSelectedProducts(n); }}
                            opcoes={produtosOpcoes}
                            persistir="value"
                            resolveDisplay={resolveDisplayProduto}
                            placeholder="Escolha um produto..."
                            portalId={`produto-select-${i}`}
                          />
                        </div>
                        <div className="w-20">
                          <Input
                            type="number" min="1"
                            value={item.quantidade}
                            onChange={(e) => { const n = [...selectedProducts]; n[i].quantidade = parseInt(e.target.value) || 1; setSelectedProducts(n); }}
                          />
                        </div>
                        {prd && <span className="text-sm font-semibold text-purple-700 whitespace-nowrap">{fmt(prd.preco_centavos * item.quantidade)}</span>}
                        <button type="button" onClick={() => setSelectedProducts(p => p.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {selectedProducts.length === 0 && (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center text-gray-400 text-sm">
                      Nenhum produto adicionado
                    </div>
                  )}
                </div>
              </Card>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setActiveTab('falecido')}>← Falecido</Button>
                <Button type="button" onClick={() => setActiveTab('resumo')}>Ver Resumo →</Button>
              </div>
            </div>
          )}

          {/* ── Tab: Resumo ── */}
          {activeTab === 'resumo' && (
            <Card className="p-6 space-y-5">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <span className="h-6 w-1 bg-green-500 rounded-full" />
                Resumo do Atendimento
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${form.tipo_atendimento === 'plano' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                  {form.tipo_atendimento}
                </span>
              </h3>

              <div className="space-y-3">
                {selectedServices.map((item, i) => {
                  const s = servicosParaUi.find(x => x.id === item.servico_id);
                  if (!s) return null;
                  return (
                    <div key={i} className="flex justify-between text-sm py-2 border-b border-gray-100">
                      <span className="text-gray-700">{s.nome} × {item.quantidade}</span>
                      <span className="font-medium">{fmt(s.preco_base_centavos * item.quantidade)}</span>
                    </div>
                  );
                })}
                {selectedProducts.map((item, i) => {
                  const p = produtosParaUi.find(x => x.id === item.produto_id);
                  if (!p) return null;
                  return (
                    <div key={i} className="flex justify-between text-sm py-2 border-b border-gray-100">
                      <span className="text-gray-700">{p.nome} × {item.quantidade}</span>
                      <span className="font-medium">{fmt(p.preco_centavos * item.quantidade)}</span>
                    </div>
                  );
                })}
              </div>

              {(form.orientacoes_tecnicas || form.observacoes_corpo || form.autoriza_remocao) && (
                <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-100">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Aspecto do Corpo</span>
                  <div className="text-sm space-y-1">
                    {form.inspecao_interna && <div className="text-blue-600 flex items-center gap-1"><CheckSquare className="h-3 w-3" /> Inspeção Interna</div>}
                    {form.inspecao_externa && <div className="text-blue-600 flex items-center gap-1"><CheckSquare className="h-3 w-3" /> Inspeção Externa</div>}
                    {form.coleta_material && <div className="text-blue-600 flex items-center gap-1"><CheckSquare className="h-3 w-3" /> Coleta de Material</div>}
                    {form.autoriza_remocao && <div className="text-red-600 font-bold flex items-center gap-1"><CheckSquare className="h-3 w-3" /> Remoção Autorizada</div>}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2 text-sm text-gray-600">
                <span>Subtotal Serviços:</span><span>{fmt(totals.srv)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal Produtos:</span><span>{fmt(totals.prd)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal:</span><span>{fmt(totals.subtotal)}</span>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-semibold text-amber-900 text-sm">Desconto comercial</h4>
                  {totals.desconto > 0 && (
                    <Button type="button" variant="ghost" className="text-xs h-8 text-red-600" onClick={removerDesconto}>
                      Remover
                    </Button>
                  )}
                </div>

                <div className="flex gap-1 bg-amber-100/60 p-1 rounded-lg w-max text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setDescontoTipo('valor');
                      setDescontoInput('');
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      descontoTipo === 'valor'
                        ? 'bg-white text-amber-900 shadow-sm border border-amber-200/50'
                        : 'text-amber-800/80 hover:text-amber-900'
                    }`}
                  >
                    Valor (R$)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDescontoTipo('porcentagem');
                      setDescontoInput('');
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      descontoTipo === 'porcentagem'
                        ? 'bg-white text-amber-900 shadow-sm border border-amber-200/50'
                        : 'text-amber-800/80 hover:text-amber-900'
                    }`}
                  >
                    Porcentagem (%)
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-7">
                    <Input
                      label={descontoTipo === 'valor' ? "Valor do desconto (R$)" : "Porcentagem do desconto (%)"}
                      value={descontoInput}
                      onChange={(e) => setDescontoInput(e.target.value)}
                      placeholder={descontoTipo === 'valor' ? "0,00" : "0"}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); solicitarDesconto(); } }}
                    />
                  </div>
                  <div className="md:col-span-5">
                    <Button type="button" variant="outline" className="w-full" onClick={solicitarDesconto} disabled={totals.subtotal <= 0}>
                      {descontoTipo === 'porcentagem'
                        ? (Number(descontoInput.replace(',', '.')) > 0 ? 'Aplicar desconto' : 'Limpar desconto')
                        : (parseMoedaToCentavos(descontoInput) > 0 ? 'Aplicar desconto' : 'Limpar desconto')}
                    </Button>
                  </div>
                </div>

                {descontoTipo === 'porcentagem' && descontoInput && !Number.isNaN(Number(descontoInput.replace(',', '.'))) && (
                  <div className="text-xs text-amber-800/85 font-semibold ml-1">
                    Equivale a:{' '}
                    <span className="text-emerald-800">
                      {fmt(Math.round((totals.subtotal * Number(descontoInput.replace(',', '.'))) / 100))}
                    </span>
                  </div>
                )}
                {totals.desconto > 0 && (
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between text-emerald-800">
                      <span>Desconto aplicado:</span>
                      <strong>- {fmt(totals.desconto)}</strong>
                    </div>
                    <p className="text-xs text-amber-900/80">
                      Autorizado por: <strong>{descontoAutorizadoPor}</strong>
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-amber-800/70 leading-relaxed">
                  Ao informar um desconto, será solicitado o nome de quem autorizou. O registro fica salvo no atendimento.
                </p>
              </div>

              <div className="flex justify-between font-bold text-lg border-t pt-3 text-blue-700">
                <span>Total Geral:</span><span>{fmt(totals.total)}</span>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-gray-900">Fechamento Financeiro</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Representante (nome)"
                    value={form.representante_nome}
                    onChange={(e) => setForm((p) => ({ ...p, representante_nome: e.target.value }))}
                    placeholder="Nome de quem autorizou/recebeu"
                  />
                  <Input
                    label="Contato do representante"
                    value={form.representante_contato}
                    onChange={(e) => setForm((p) => ({ ...p, representante_contato: e.target.value }))}
                    placeholder="Telefone/WhatsApp"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={recalcularDivisaoAutomatica}
                      disabled={pagamentos.length === 0 || totals.total <= 0}
                    >
                      Recalcular divisão automática
                    </Button>
                  </div>
                  {pagamentos.map((pg, idx) => (
                    <div key={`pg-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                      <div className="md:col-span-5">
                        <Select
                          label={idx === 0 ? 'Forma de pagamento' : undefined}
                          value={pg.forma}
                          onChange={(e) =>
                            setPagamentos((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, forma: e.target.value } : p))
                            )
                          }
                        >
                          <option value="dinheiro">Dinheiro</option>
                          <option value="pix">PIX</option>
                          <option value="cartao_credito">Cartão de crédito</option>
                          <option value="cartao_debito">Cartão de débito</option>
                          <option value="boleto">Boleto</option>
                          <option value="transferencia">Transferência</option>
                          <option value="outro">Outro</option>
                        </Select>
                      </div>
                      <div className="md:col-span-5">
                         <Input
                          label={idx === 0 ? 'Valor (R$)' : undefined}
                          value={pg.valor_input !== undefined ? pg.valor_input : (Number(pg.valor_centavos || 0) / 100).toFixed(2).replace('.', ',')}
                          onChange={(e) => ajustarPagamentosOnChange(idx, e.target.value)}
                          onBlur={() =>
                            setPagamentos((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, valor_input: (Number(p.valor_centavos || 0) / 100).toFixed(2).replace('.', ',') } : p
                              )
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={pagamentos.length === 1}
                          onClick={() => setPagamentos((prev) => {
                            const filtrados = prev.filter((_, i) => i !== idx);
                            if (filtrados.length === 1) {
                              return [{ ...filtrados[0], valor_centavos: totals.total, valor_input: (totals.total / 100).toFixed(2).replace('.', ',') }];
                            } else if (filtrados.length > 1) {
                              const somaOutros = filtrados.slice(0, -1).reduce((acc, p) => acc + p.valor_centavos, 0);
                              const novoUltimoValor = Math.max(0, totals.total - somaOutros);
                              filtrados[filtrados.length - 1] = {
                                ...filtrados[filtrados.length - 1],
                                valor_centavos: novoUltimoValor,
                                valor_input: (novoUltimoValor / 100).toFixed(2).replace('.', ',')
                              };
                            }
                            return filtrados;
                          })}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPagamentos((prev) => {
                      const totalAtual = prev.reduce((acc, p) => acc + p.valor_centavos, 0);
                      const restante = Math.max(0, totals.total - totalAtual);
                      return [...prev, { forma: 'dinheiro', valor_centavos: restante, valor_input: (restante / 100).toFixed(2).replace('.', ',') }];
                    })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar forma de pagamento
                  </Button>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span>Total atendimento</span>
                    <strong>{fmt(totals.total)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total informado nas formas</span>
                    <strong className={totalPagamentos === totals.total ? 'text-green-700' : 'text-red-600'}>
                      {fmt(totalPagamentos)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setActiveTab('servicos')}>← Serviços</Button>
                <Button type="button" variant="ghost" onClick={() => setActiveTab('corpo')}>Ver Aspecto do Corpo</Button>
              </div>
            </Card>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="lg:col-span-1">
          <Card className="p-6 space-y-5 sticky top-24 shadow-lg border-blue-100">
            <h3 className="font-bold text-gray-900 border-b pb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Resumo Financeiro
              <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded uppercase font-black ${form.tipo_atendimento === 'plano' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {form.tipo_atendimento}
              </span>
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600"><span>Serviços:</span><span className="font-medium text-gray-800">{fmt(totals.srv)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Produtos:</span><span className="font-medium text-gray-800">{fmt(totals.prd)}</span></div>
              {totals.desconto > 0 && (
                <>
                  <div className="flex justify-between text-emerald-700"><span>Desconto:</span><span className="font-medium">- {fmt(totals.desconto)}</span></div>
                  <p className="text-[10px] text-gray-500 leading-snug">Autorizado por {descontoAutorizadoPor}</p>
                </>
              )}
              <div className="flex justify-between font-black text-lg text-blue-700 border-t pt-3 mt-2">
                <span>Total:</span><span>{fmt(totals.total)}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Button type="submit" className="w-full h-11 text-base shadow" loading={saving}>
                <Save className="h-4 w-4 mr-2" />
                {isEdit ? 'Salvar Alterações' : 'Confirmar Atendimento'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/atendimentos')}>
                Cancelar
              </Button>
              {isEdit && viagensVinculadas.length > 0 && (
                <div className="mt-2 border border-emerald-200 bg-emerald-50/40 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <Truck className="h-3.5 w-3.5" />
                    Viagens vinculadas ({viagensVinculadas.length})
                  </p>
                  <div className="space-y-1.5">
                    {viagensVinculadas.map((v) => {
                      const map: Record<string, { label: string; cls: string }> = {
                        agendada:     { label: 'Agendada',    cls: 'bg-blue-100 text-blue-700' },
                        em_andamento: { label: 'Em rota',     cls: 'bg-amber-100 text-amber-700' },
                        concluida:    { label: 'Concluída',   cls: 'bg-green-100 text-green-700' },
                        cancelada:    { label: 'Cancelada',   cls: 'bg-red-100 text-red-700' },
                      };
                      const s = map[v.status] || { label: v.status, cls: 'bg-gray-100 text-gray-700' };
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => navigate(`/frota/viagens/${v.id}`)}
                          className="w-full text-left bg-white rounded-md border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors px-2.5 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${s.cls}`}>
                              {s.label}
                            </span>
                            <span className="text-[11px] text-gray-500 truncate">
                              {v.placa || '—'} {v.motorista_nome ? `• ${v.motorista_nome}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-700 truncate">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            <span className="truncate">{v.origem || '—'}</span>
                            <span className="text-gray-300">→</span>
                            <Navigation className="h-3 w-3 text-gray-400" />
                            <span className="truncate">{v.destino || '—'}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {isEdit && id && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowDocsModal(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Documentos / Visualizar PDFs
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    loading={pdfGerando}
                    onClick={() => {
                      void (async () => {
                        setPdfGerando(true);
                        try {
                          const r = await gerarOrdemServicoAtendimentoPdf(id);
                          if (!r) showToast('Não foi possível gerar o PDF. Verifique a sessão.', 'error');
                          else showToast('PDF da ordem de serviço gerado.', 'success');
                        } catch (err) {
                          console.error(err);
                          showToast('Erro ao gerar PDF.', 'error');
                        } finally {
                          setPdfGerando(false);
                        }
                      })();
                    }}
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Baixar OS direta
                  </Button>
                </>
              )}
            </div>

            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 leading-relaxed">
              <strong>Dica:</strong> Após confirmar, você pode gerar o contrato e as ordens de serviço para a equipe.
            </div>
          </Card>
        </div>
      </form>

      {isEdit && id && (
        <DocumentosAtendimentoModal
          isOpen={showDocsModal}
          onClose={() => setShowDocsModal(false)}
          atendimento={{
            id,
            codigo: form.codigo,
            valor_pago_centavos: pagamentos.reduce((acc, p) => acc + Number(p.valor_centavos || 0), 0),
            valor_total_centavos: totals.total,
            valor_desconto_centavos: totals.desconto,
            desconto_autorizado_por: descontoAutorizadoPor || undefined,
            autoriza_remocao: form.autoriza_remocao,
            inspecao_interna: form.inspecao_interna,
            inspecao_externa: form.inspecao_externa,
            coleta_material: form.coleta_material,
            orientacoes_tecnicas: form.orientacoes_tecnicas,
            formulario_preparacao: form.formulario_preparacao,
          }}
        />
      )}

      <Modal
        isOpen={modalDesconto}
        onClose={() => setModalDesconto(false)}
        title="Autorização do desconto"
        size="sm"
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Desconto de{' '}
            <strong className="text-emerald-700">
              {fmt(descontoPendenteCentavos)}
              {descontoPercentualPendente !== null ? ` (${descontoPercentualPendente}%)` : ''}
            </strong>{' '}
            sobre o subtotal de <strong>{fmt(totals.subtotal)}</strong>. Informe quem autorizou este desconto — o registro ficará salvo no atendimento.
          </p>
          <Input
            label="Responsável pelo desconto"
            value={nomeAutorizadorDesconto}
            onChange={(e) => setNomeAutorizadorDesconto(e.target.value)}
            placeholder="Nome de quem autorizou"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarDesconto(); } }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalDesconto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarDesconto}>
              Confirmar desconto
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
