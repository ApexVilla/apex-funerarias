import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User, Save, ArrowLeft, DollarSign, MapPin, Building2, Pencil, Check, Landmark } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { empresaIdsConsultaCobradores } from '../../lib/cobradorEmpresaScope';
import {
    deduplicarFiliaisUnidadeOrigemCobrador,
    unidadeNomeCurto,
} from '../../lib/contextoUnidadeLabels';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import {
    COBRADOR_REGIAO_PRESET_OUTRA,
    COBRADOR_REGIOES_ATUACAO_OPCOES,
    cobradorRegiaoEhPreset,
} from '../../lib/cobradorRegioesPresets';
import { extrairTermoBuscaCidade, parseBairrosAtuacaoJsonb } from '../../lib/cobradorBairrosAtuacao';
import {
    bairrosPresetBrunoCatalao,
    cobradorNomeEhBrunoCatalao,
    COBRADOR_BRUNO_CATALAO_BAIRROS,
} from '../../lib/cobradorBairrosPresets';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import {
  buscarPessoaDuplicadaPorCpf,
  mensagemPessoaDuplicadaCpf,
  validarCpfObrigatorioColaborador,
} from '../../lib/colaboradorDuplicidade';
import { podeVerVisaoConsolidadaGrupo } from '../../lib/perfisContexto';
import {
    carregarContasCobrador,
    salvarContasCobrador,
} from '../../lib/cobradorContasBancarias';

/** PostgREST quando coluna ainda não existe no projeto remoto (migrations pendentes). */
function supabasePareceErroColunaAusente(message: string): boolean {
    const m = message.toLowerCase();
    return (
        m.includes('schema cache') ||
        m.includes('could not find') ||
        m.includes('unknown column') ||
        /\bcolumn\b.*\bdoes not exist\b/.test(m)
    );
}

interface CobradorFormData {
    nome: string;
    cpf: string;
    telefone: string;
    email: string;
    status: 'ativo' | 'inativo' | 'ferias' | 'afastado';
    /** Filial/unidade (Aparecida, Catalão, Ipameri… cadastradas em Filiais). */
    filial_id: string;
    area_atuacao: string;
    comissao_percentual: number;
    comissao_por_metodo: {
        dinheiro: number;
        pix: number;
        cartao: number;
        boleto: number;
        transferencia: number;
    };
    data_admissao: string;
}

const initialData: CobradorFormData = {
    nome: '',
    cpf: '',
    telefone: '',
    email: '',
    status: 'ativo',
    filial_id: '',
    area_atuacao: '',
    comissao_percentual: 5,
    comissao_por_metodo: {
        dinheiro: 5,
        pix: 5,
        cartao: 5,
        boleto: 5,
        transferencia: 5,
    },
    data_admissao: new Date().toISOString().slice(0, 10),
};

export const CobradorForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();
    const {
        empresaIdEfetivo,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        podeAlternarEmpresa,
        empresaIdsParaFiltro,
        dataRevisionEmpresa,
    } = useEmpresaContextoAtivo();
    const empresaId = (empresaIdEfetivo || user?.empresa_id || '').trim();
    const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
    const tokenUnidadeGrupo = useMemo(() => {
        if (!multiEmpresa || visaoTodasEmpresasGrupo) return '';
        const nome = empresasDoGrupo.find((e) => e.id === empresaId)?.nome || '';
        return unidadeNomeCurto(nome);
    }, [multiEmpresa, visaoTodasEmpresasGrupo, empresasDoGrupo, empresaId]);

    const empresaIdsParaFiliaisOrigem = useMemo(() => {
        if (multiEmpresa && visaoTodasEmpresasGrupo) {
            return empresasDoGrupo.map((e) => e.id).filter(Boolean);
        }
        if (empresaId) return [empresaId];
        return empresaIdsParaFiltro?.length ? empresaIdsParaFiltro : [];
    }, [
        multiEmpresa,
        visaoTodasEmpresasGrupo,
        empresasDoGrupo,
        empresaId,
        empresaIdsParaFiltro,
    ]);

    const empresaIdsGrupoQuery = useMemo(
        () =>
            empresaIdsConsultaCobradores({
                empresaIdsParaFiltro: (empresaIdsParaFiltro || []).length
                    ? empresaIdsParaFiltro
                    : empresaId
                      ? [empresaId]
                      : [],
                empresasDoGrupo,
                visaoTodasEmpresasGrupo,
                multiEmpresa,
                tokenUnidadeGrupo,
            }),
        [
            empresaIdsParaFiltro,
            empresaId,
            empresasDoGrupo,
            visaoTodasEmpresasGrupo,
            multiEmpresa,
            tokenUnidadeGrupo,
        ],
    );
    const { showToast } = useToast();
    const [formData, setFormData] = useState<CobradorFormData>(initialData);
    /** Lista fixa + "Outra"; valor gravado é o texto da opção ou o campo livre. */
    const [regiaoSelect, setRegiaoSelect] = useState<string>('');
    const [regiaoOutro, setRegiaoOutro] = useState('');
    const [filiais, setFiliais] = useState<Array<{ id: string; nome: string; rotulo: string }>>([]);
    const [bairrosSugeridos, setBairrosSugeridos] = useState<string[]>([]);
    const [bairrosSelecionados, setBairrosSelecionados] = useState<string[]>([]);
    const [bairroManual, setBairroManual] = useState('');
    const [bairroEditando, setBairroEditando] = useState<string | null>(null);
    const [bairroEditValor, setBairroEditValor] = useState('');
    const [loadingBairros, setLoadingBairros] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [usuarioIdVinculo, setUsuarioIdVinculo] = useState('');
    const [usuariosCobrador, setUsuariosCobrador] = useState<{ id: string; nome: string; email: string }[]>([]);
    const [contasCaixaDisponiveis, setContasCaixaDisponiveis] = useState<
        { id: string; nome: string; tipo: string; empresaNome?: string }[]
    >([]);
    const [contasCaixaSelecionadas, setContasCaixaSelecionadas] = useState<string[]>([]);
    const [contaCaixaPadraoId, setContaCaixaPadraoId] = useState('');
    const [cobradorEmpresaId, setCobradorEmpresaId] = useState('');
    const [erroCarregar, setErroCarregar] = useState<string | null>(null);

    const isEditing = !!id;
    const empresaIdOperacao = (cobradorEmpresaId || empresaId).trim();
    const empresaIdsFiliaisQuery = useMemo(() => {
        if (isEditing && cobradorEmpresaId) return [cobradorEmpresaId];
        return empresaIdsParaFiliaisOrigem;
    }, [isEditing, cobradorEmpresaId, empresaIdsParaFiliaisOrigem]);

    const areaAtuacaoFinal = useMemo(
        () =>
            regiaoSelect === COBRADOR_REGIAO_PRESET_OUTRA ? regiaoOutro.trim() : regiaoSelect.trim(),
        [regiaoSelect, regiaoOutro],
    );

    const todasOpcoesBairros = useMemo(() => {
        const u = new Set([
            ...bairrosSugeridos,
            ...bairrosSelecionados,
            ...COBRADOR_BRUNO_CATALAO_BAIRROS,
        ]);
        return Array.from(u).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [bairrosSugeridos, bairrosSelecionados]);

    const exibirPresetBrunoCatalao = useMemo(() => {
        const area = areaAtuacaoFinal.toLowerCase();
        return (
            cobradorNomeEhBrunoCatalao(formData.nome) &&
            (area.includes('catalão') || area.includes('catalao'))
        );
    }, [formData.nome, areaAtuacaoFinal]);

    const aplicarPresetBrunoCatalao = () => {
        setBairrosSelecionados(bairrosPresetBrunoCatalao());
        showToast(
            `${COBRADOR_BRUNO_CATALAO_BAIRROS.length} bairros da rota Catalão aplicados. Salve o cadastro para gravar.`,
            'success',
        );
    };

    useEffect(() => {
        const ids = empresaIdsFiliaisQuery;
        if (ids.length === 0) {
            setFiliais([]);
            return;
        }
        void (async () => {
            const { data, error } = await supabase
                .from('filiais')
                .select('id, nome, empresa_id')
                .in('empresa_id', ids)
                .eq('ativo', true)
                .order('nome');
            if (error) {
                console.error('[CobradorForm] filiais', error);
                setFiliais([]);
                return;
            }
            const empresasPorId = Object.fromEntries(empresasDoGrupo.map((e) => [e.id, e.nome]));
            const brutas = (data || []) as { id: string; nome: string; empresa_id?: string }[];
            const rows =
                ids.length > 1
                    ? deduplicarFiliaisUnidadeOrigemCobrador(brutas, empresasPorId, empresaId)
                    : brutas.map((f) => ({ ...f, rotulo: f.nome.trim() || f.id }));
            setFiliais(rows.map((f) => ({ id: f.id, nome: f.nome, rotulo: f.rotulo })));
        })();
    }, [empresaId, empresaIdsFiliaisQuery, dataRevisionEmpresa, empresasDoGrupo]);

    useEffect(() => {
        let cancelled = false;
        const ids = empresaIdsGrupoQuery.length > 0 ? empresaIdsGrupoQuery : empresaId ? [empresaId] : [];
        if (ids.length === 0 || !areaAtuacaoFinal) {
            setBairrosSugeridos([]);
            return;
        }
        const termo = extrairTermoBuscaCidade(areaAtuacaoFinal);
        if (!termo) {
            setBairrosSugeridos([]);
            return;
        }

        void (async () => {
            setLoadingBairros(true);
            try {
                const pattern = `%${termo}%`;
                let q1 = supabase
                    .from('clientes')
                    .select('endereco_bairro')
                    .is('deleted_at', null)
                    .ilike('endereco_cidade', pattern)
                    .limit(5000);
                let q2 = supabase
                    .from('clientes')
                    .select('endereco_cob_bairro')
                    .is('deleted_at', null)
                    .ilike('endereco_cob_cidade', pattern)
                    .limit(5000);
                if (ids.length === 1) {
                    q1 = q1.eq('empresa_id', ids[0]);
                    q2 = q2.eq('empresa_id', ids[0]);
                } else {
                    q1 = q1.in('empresa_id', ids);
                    q2 = q2.in('empresa_id', ids);
                }
                const [r1, r2] = await Promise.all([q1, q2]);

                if (cancelled) return;
                const set = new Set<string>();
                (r1.data || []).forEach((row: { endereco_bairro?: string | null }) => {
                    const b = row.endereco_bairro?.trim();
                    if (b) set.add(b);
                });
                (r2.data || []).forEach((row: { endereco_cob_bairro?: string | null }) => {
                    const b = row.endereco_cob_bairro?.trim();
                    if (b) set.add(b);
                });
                setBairrosSugeridos(Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            } catch {
                if (!cancelled) setBairrosSugeridos([]);
            } finally {
                if (!cancelled) setLoadingBairros(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [empresaId, empresaIdsGrupoQuery, areaAtuacaoFinal, dataRevisionEmpresa]);

    useEffect(() => {
        const loadData = async () => {
            if (!isEditing || !id) return;
            if (!user?.id) return;

            setLoading(true);
            setErroCarregar(null);
            try {
                const { data, error } = await supabase
                    .from('cobradores')
                    .select(
                        'id, empresa_id, nome, cpf, telefone, email, status, filial_id, area_atuacao, bairros_atuacao, comissao_percentual, comissao_por_metodo, data_admissao, usuario_id',
                    )
                    .eq('id', id)
                    .maybeSingle();

                if (error) {
                    setErroCarregar(error.message || 'Erro ao buscar cobrador.');
                    return;
                }
                if (!data) {
                    setErroCarregar(
                        'Cobrador não encontrado ou sem permissão para esta unidade. Troque a unidade no topo (ex.: mesma empresa do cadastro) e tente de novo.',
                    );
                    return;
                }

                const empRegistro = String(data.empresa_id || '').trim();
                if (empRegistro) setCobradorEmpresaId(empRegistro);

                const areaRaw = (data.area_atuacao || '').trim();
                if (cobradorRegiaoEhPreset(areaRaw)) {
                    setRegiaoSelect(areaRaw);
                    setRegiaoOutro('');
                } else if (areaRaw) {
                    setRegiaoSelect(COBRADOR_REGIAO_PRESET_OUTRA);
                    setRegiaoOutro(areaRaw);
                } else {
                    setRegiaoSelect('');
                    setRegiaoOutro('');
                }

                setFormData({
                    nome: data.nome || '',
                    cpf: data.cpf || '',
                    telefone: data.telefone || '',
                    email: data.email || '',
                    status: data.status || 'ativo',
                    filial_id: data.filial_id || FILIAL_TODAS_ID,
                    area_atuacao: areaRaw,
                    comissao_percentual: Number(data.comissao_percentual || 5),
                    comissao_por_metodo: {
                        dinheiro: Number(data.comissao_por_metodo?.dinheiro ?? data.comissao_percentual ?? 5),
                        pix: Number(data.comissao_por_metodo?.pix ?? data.comissao_percentual ?? 5),
                        cartao: Number(data.comissao_por_metodo?.cartao ?? data.comissao_percentual ?? 5),
                        boleto: Number(data.comissao_por_metodo?.boleto ?? data.comissao_percentual ?? 5),
                        transferencia: Number(data.comissao_por_metodo?.transferencia ?? data.comissao_percentual ?? 5),
                    },
                    data_admissao: data.data_admissao || '',
                });
                setBairrosSelecionados(parseBairrosAtuacaoJsonb(data.bairros_atuacao));
                setUsuarioIdVinculo(data.usuario_id ? String(data.usuario_id) : '');
                try {
                    const vinculos = await carregarContasCobrador(String(data.id));
                    const ids = vinculos.map((v) => v.conta_bancaria_id);
                    setContasCaixaSelecionadas(ids);
                    const padrao = vinculos.find((v) => v.principal)?.conta_bancaria_id || ids[0] || '';
                    setContaCaixaPadraoId(padrao);
                } catch {
                    setContasCaixaSelecionadas([]);
                    setContaCaixaPadraoId('');
                }
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Erro ao carregar cobrador', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id, isEditing, user?.id, dataRevisionEmpresa]);

    // IDs de empresas para buscar caixas: sempre inclui a empresa do cobrador (ao editar)
    // E a empresa ativa do usuário, mais todo o grupo disponível.
    const empresaIdsCaixaQuery = useMemo(() => {
        const ids = new Set<string>(empresaIdsParaFiliaisOrigem.filter(Boolean));
        // Garante que a empresa do cobrador (ex.: Catalão) está incluída mesmo quando
        // o contexto ativo é outra unidade (ex.: Aparecida).
        if (cobradorEmpresaId) ids.add(cobradorEmpresaId);
        if (empresaId) ids.add(empresaId);
        return Array.from(ids);
    }, [empresaIdsParaFiliaisOrigem, cobradorEmpresaId, empresaId]);

    useEffect(() => {
        const ids = empresaIdsCaixaQuery;
        if (ids.length === 0) {
            setContasCaixaDisponiveis([]);
            return;
        }
        void (async () => {
            let q = supabase
                .from('fin_contas_bancarias')
                .select('id, nome, tipo, empresa_id')
                .eq('ativo', true)
                .order('nome');
            if (ids.length === 1) {
                q = q.eq('empresa_id', ids[0]);
            } else {
                q = q.in('empresa_id', ids);
            }
            const { data, error } = await q;
            if (error) {
                console.error('[CobradorForm] contas caixa', error);
                setContasCaixaDisponiveis([]);
                return;
            }
            const empresasById = Object.fromEntries(
                empresasDoGrupo.map((e) => [e.id, e.nome]),
            );
            const multiUnidade = ids.length > 1;
            const caixas = (data || []).filter((c: { tipo?: string }) =>
                ['caixa', 'corrente'].includes(String(c.tipo || '').toLowerCase()),
            );
            setContasCaixaDisponiveis(
                caixas.map((c: { id: string; nome: string; tipo: string; empresa_id?: string }) => ({
                    id: String(c.id),
                    nome: String(c.nome || ''),
                    tipo: String(c.tipo || ''),
                    empresaNome: multiUnidade && c.empresa_id
                        ? (empresasById[c.empresa_id] || undefined)
                        : undefined,
                })),
            );
        })();
    }, [empresaIdsCaixaQuery, empresasDoGrupo, dataRevisionEmpresa]);

    useEffect(() => {
        const empUsers = empresaIdOperacao || empresaId;
        if (!empUsers) return;
        void (async () => {
            const { data, error } = await supabase
                .from('users')
                .select('id, nome, email')
                .eq('empresa_id', empUsers)
                .eq('role', 'cobrador')
                .order('nome');
            if (!error && data) {
                setUsuariosCobrador(
                    data.map((u) => ({
                        id: String(u.id),
                        nome: String(u.nome || ''),
                        email: String(u.email || ''),
                    })),
                );
            }
        })();
    }, [empresaIdOperacao, empresaId, dataRevisionEmpresa]);

    const toggleBairro = (nome: string) => {
        setBairrosSelecionados((prev) => {
            const idx = prev.findIndex((x) => x.toLowerCase() === nome.toLowerCase());
            if (idx >= 0) return prev.filter((_, i) => i !== idx);
            return [...prev, nome];
        });
    };

    const addBairroManual = () => {
        const t = bairroManual.trim();
        if (!t) return;
        setBairrosSelecionados((prev) => {
            if (prev.some((x) => x.toLowerCase() === t.toLowerCase())) return prev;
            return [...prev, t];
        });
        setBairroManual('');
    };

    const removeBairroChip = (nome: string) => {
        setBairrosSelecionados((prev) => prev.filter((x) => x.toLowerCase() !== nome.toLowerCase()));
        if (bairroEditando?.toLowerCase() === nome.toLowerCase()) {
            setBairroEditando(null);
            setBairroEditValor('');
        }
    };

    const iniciarEdicaoBairroChip = (nome: string) => {
        setBairroEditando(nome);
        setBairroEditValor(nome);
    };

    const salvarEdicaoBairroChip = () => {
        const antigo = (bairroEditando || '').trim();
        const novo = bairroEditValor.trim();
        if (!antigo || !novo) {
            setBairroEditando(null);
            setBairroEditValor('');
            return;
        }
        if (antigo.toLowerCase() === novo.toLowerCase()) {
            cancelarEdicaoBairroChip();
            return;
        }
        setBairrosSelecionados((prev) =>
            prev.map((x) => (x.toLowerCase() === antigo.toLowerCase() ? novo : x)),
        );
        setBairrosSugeridos((prev) =>
            prev.map((x) => (x.toLowerCase() === antigo.toLowerCase() ? novo : x)),
        );
        cancelarEdicaoBairroChip();
    };

    const cancelarEdicaoBairroChip = () => {
        setBairroEditando(null);
        setBairroEditValor('');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'comissao_percentual') {
            const percentual = Number(value || 0);
            setFormData(prev => ({
                ...prev,
                comissao_percentual: percentual,
                comissao_por_metodo: {
                    dinheiro: percentual,
                    pix: percentual,
                    cartao: percentual,
                    boleto: percentual,
                    transferencia: percentual,
                },
            }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleComissaoMetodoChange = (metodo: keyof CobradorFormData['comissao_por_metodo'], value: string) => {
        setFormData((prev) => ({
            ...prev,
            comissao_por_metodo: {
                ...prev.comissao_por_metodo,
                [metodo]: Number(value || 0),
            },
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const empresaSalvar = (isEditing ? cobradorEmpresaId || empresaId : empresaId).trim();
        if (!empresaSalvar) {
            showToast('Selecione a unidade no topo da tela antes de salvar.', 'warning');
            return;
        }

        if (!formData.nome.trim()) {
            showToast('Informe o nome do cobrador.', 'warning');
            return;
        }

        if (!formData.filial_id?.trim()) {
            showToast(
                'Selecione a unidade de origem ou "Todas as unidades" se o cobrador atua em qualquer filial.',
                'warning',
            );
            return;
        }

        const areaFinal =
            regiaoSelect === COBRADOR_REGIAO_PRESET_OUTRA ? regiaoOutro.trim() : regiaoSelect.trim();

        if (!regiaoSelect) {
            showToast('Selecione a cidade ou região de atuação na lista.', 'warning');
            return;
        }
        if (regiaoSelect === COBRADOR_REGIAO_PRESET_OUTRA && !regiaoOutro.trim()) {
            showToast('Informe a cidade ou região no campo “Outra”.', 'warning');
            return;
        }

        const cpfMsg = validarCpfObrigatorioColaborador(formData.cpf);
        if (cpfMsg) {
            showToast(cpfMsg, 'warning');
            return;
        }

        const dupCpf = await buscarPessoaDuplicadaPorCpf({
            cpf: formData.cpf,
            excluirCobradorId: isEditing ? id : null,
            excluirUsuarioId: usuarioIdVinculo.trim() || null,
        });
        if (dupCpf) {
            showToast(mensagemPessoaDuplicadaCpf(dupCpf), 'warning');
            return;
        }

        setSaving(true);
        try {
            const payloadFull = {
                empresa_id: empresaSalvar,
                nome: formData.nome.trim(),
                cpf: formData.cpf.trim() || null,
                telefone: formData.telefone.trim() || null,
                email: formData.email.trim() || null,
                status: formData.status,
                filial_id:
                    formData.filial_id.trim() === FILIAL_TODAS_ID
                        ? null
                        : formData.filial_id.trim() || null,
                area_atuacao: areaFinal || null,
                bairros_atuacao: bairrosSelecionados,
                comissao_percentual: formData.comissao_percentual,
                comissao_por_metodo: formData.comissao_por_metodo,
                data_admissao: formData.data_admissao || null,
                usuario_id: usuarioIdVinculo.trim() || null,
                updated_at: new Date().toISOString(),
            };

            const persist = async (body: typeof payloadFull) => {
                if (isEditing && id) {
                    return supabase.from('cobradores').update(body).eq('id', id);
                }
                return supabase.from('cobradores').insert(body).select('id').single();
            };

            let result = await persist(payloadFull);

            /** Tenta salvar mesmo com migrations incompletas: primeiro só sem bairros (mantém filial). */
            if (result.error && supabasePareceErroColunaAusente(result.error.message || '')) {
                const retries: { omit: ('filial_id' | 'bairros_atuacao' | 'usuario_id')[]; hint: string }[] = [
                    {
                        omit: ['usuario_id'],
                        hint: 'O vínculo com usuário do sistema não foi gravado (coluna usuario_id).',
                    },
                    {
                        omit: ['bairros_atuacao'],
                        hint: 'Os bairros da rota não foram gravados (coluna bairros_atuacao). A unidade foi mantida no salvamento.',
                    },
                    {
                        omit: ['filial_id'],
                        hint: 'A unidade não foi gravada (coluna filial_id). Os demais dados foram salvos.',
                    },
                    {
                        omit: ['filial_id', 'bairros_atuacao'],
                        hint: 'Unidade e bairros da rota não foram gravados (faltam filial_id e bairros_atuacao no Supabase).',
                    },
                ];

                for (const step of retries) {
                    const body = { ...payloadFull };
                    step.omit.forEach((k) => {
                        delete (body as Record<string, unknown>)[k];
                    });
                    result = await persist(body as typeof payloadFull);
                    if (!result.error) {
                        showToast(
                            `${step.hint} Cole no SQL Editor o arquivo supabase/snippets/cobradores_filial_bairros.sql (ou as migrations 20260521130000 e 20260521140000).`,
                            'warning',
                        );
                        navigate('/cobradores/lista');
                        return;
                    }
                    if (!supabasePareceErroColunaAusente(result.error.message || '')) {
                        break;
                    }
                }
            }

            if (result.error) throw result.error;

            const cobradorSalvoId =
                isEditing && id
                    ? id
                    : String((result.data as { id?: string } | null)?.id || '');
            if (cobradorSalvoId && contasCaixaSelecionadas.length > 0) {
                try {
                    await salvarContasCobrador({
                        cobradorId: cobradorSalvoId,
                        contaIds: contasCaixaSelecionadas,
                        contaPadraoId: contaCaixaPadraoId || contasCaixaSelecionadas[0],
                        usuarioId: usuarioIdVinculo.trim() || null,
                    });
                } catch (errVinc) {
                    showToast(
                        errVinc instanceof Error
                            ? `Cobrador salvo, mas falhou ao vincular caixas: ${errVinc.message}`
                            : 'Cobrador salvo, mas falhou ao vincular caixas.',
                        'warning',
                    );
                    navigate('/cobradores/lista');
                    return;
                }
            } else if (cobradorSalvoId && contasCaixaSelecionadas.length === 0 && isEditing) {
                try {
                    await salvarContasCobrador({
                        cobradorId: cobradorSalvoId,
                        contaIds: [],
                        contaPadraoId: null,
                        usuarioId: usuarioIdVinculo.trim() || null,
                    });
                } catch {
                    /* limpar vínculos opcional */
                }
            }

            showToast(isEditing ? 'Cobrador atualizado com sucesso!' : 'Cobrador cadastrado com sucesso!', 'success');
            navigate('/cobradores/lista');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar cobrador', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (isEditing && erroCarregar) {
        return (
            <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-4">
                <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm leading-relaxed">
                    {erroCarregar}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={() => navigate('/cobradores/lista')}>
                        Voltar à lista
                    </Button>
                    <Button
                        onClick={() => {
                            setErroCarregar(null);
                            setLoading(true);
                            window.setTimeout(() => window.location.reload(), 50);
                        }}
                    >
                        Tentar novamente
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <PageHeader
                title={isEditing ? 'Editar Cobrador' : 'Novo Cobrador'}
                subtitle="Informe a unidade de origem (Aparecida, Catalão, Ipameri…) e a região onde ele cobra — assim dá para organizar carteira e rotas."
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/cobradores/lista')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-2 border-b pb-2">
                        <User className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">Informações Pessoais</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Nome Completo *" name="nome" value={formData.nome} onChange={handleChange} required />
                        <Input label="CPF *" name="cpf" value={formData.cpf} onChange={handleChange} required />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Telefone *" name="telefone" value={formData.telefone} onChange={handleChange} required />
                        <Input label="E-mail" name="email" type="email" value={formData.email} onChange={handleChange} />
                    </div>

                    <div>
                        <Select
                            label="Usuário do sistema (login)"
                            value={usuarioIdVinculo}
                            onChange={(e) => setUsuarioIdVinculo(e.target.value)}
                        >
                            <option value="">Nenhum / vincular depois</option>
                            {usuariosCobrador.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.nome} ({u.email})
                                </option>
                            ))}
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                            Vincule o login com perfil <strong>cobrador</strong> para filtrar automaticamente a carteira em
                            Cobranças Pendentes. O e-mail do cadastro também pode ser usado como fallback.
                        </p>
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-900">
                            <Landmark className="h-4 w-4 shrink-0 opacity-90" />
                            <span className="text-xs font-bold uppercase tracking-wide">
                                Caixas / conta de destino
                            </span>
                        </div>
                        <p className="text-sm text-gray-700 leading-snug">
                            Marque o(s) caixa(s) deste cobrador. Na <strong>baixa em campo</strong>, a conta de destino
                            será sempre uma delas (padrão com estrela). Ao salvar, o usuário vinculado ganha permissão de
                            operador nesses caixas.
                        </p>
                        {contasCaixaDisponiveis.length === 0 ? (
                            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                Nenhum caixa ativo encontrado. Cadastre em{' '}
                                <strong>Financeiro → Contas bancárias</strong>.
                            </p>
                        ) : (
                            <ul className="space-y-2 max-h-56 overflow-y-auto rounded-lg border border-emerald-100 bg-white p-2">
                                {contasCaixaDisponiveis.map((conta) => {
                                    const marcada = contasCaixaSelecionadas.includes(conta.id);
                                    return (
                                        <li
                                            key={conta.id}
                                            className="flex flex-wrap items-center gap-2 text-sm py-1.5 px-1 border-b border-gray-50 last:border-0"
                                        >
                                            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={marcada}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setContasCaixaSelecionadas((prev) => {
                                                            if (checked) {
                                                                const next = [...prev, conta.id];
                                                                if (!contaCaixaPadraoId) setContaCaixaPadraoId(conta.id);
                                                                return next;
                                                            }
                                                            const next = prev.filter((x) => x !== conta.id);
                                                            if (contaCaixaPadraoId === conta.id) {
                                                                setContaCaixaPadraoId(next[0] || '');
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                    className="rounded border-gray-300 text-emerald-600"
                                                />
                                                <span className="truncate font-medium text-gray-800">
                                                    {conta.nome}
                                                </span>
                                                <span className="text-[10px] text-gray-400 uppercase">
                                                    {conta.tipo}
                                                </span>
                                                {conta.empresaNome && (
                                                    <span className="text-[10px] text-blue-500 font-medium shrink-0">
                                                        {conta.empresaNome}
                                                    </span>
                                                )}
                                            </label>
                                            {marcada ? (
                                                <label className="inline-flex items-center gap-1 text-[11px] text-emerald-800 cursor-pointer shrink-0">
                                                    <input
                                                        type="radio"
                                                        name="conta_caixa_padrao"
                                                        checked={contaCaixaPadraoId === conta.id}
                                                        onChange={() => setContaCaixaPadraoId(conta.id)}
                                                        className="text-emerald-600"
                                                    />
                                                    Padrão na baixa
                                                </label>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-indigo-900">
                            <Building2 className="h-4 w-4 shrink-0 opacity-90" />
                            <span className="text-xs font-bold uppercase tracking-wide">Unidade de origem</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-snug">
                            Escolha a <strong>cidade-base</strong> do cobrador (Aparecida, Catalão, Ipameri, Matriz…) ou{' '}
                            <strong>Todas as unidades</strong> se ele pode cobrar em qualquer filial. Com várias empresas
                            Fênix no topo, a lista mostra cada cidade uma vez só.
                        </p>
                        <Select
                            label="De qual unidade é este cobrador? *"
                            name="filial_id"
                            value={formData.filial_id}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Selecione a unidade…</option>
                            <option value={FILIAL_TODAS_ID}>Todas as unidades (qualquer filial)</option>
                            {filiais.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.rotulo}
                                </option>
                            ))}
                        </Select>
                        {filiais.length === 0 ? (
                            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                Nenhuma filial ativa encontrada. Cadastre unidades em{' '}
                                <strong>Estoque → Filiais e depósitos</strong> antes de registrar cobradores.
                            </p>
                        ) : (
                            <p className="text-[11px] text-gray-500 ml-1">
                                {podeVerVisaoConsolidadaGrupo(user?.role)
                                    ? 'Perfis master/admin: no topo da tela use também "Todas as filiais" para ver cobranças de todas as unidades.'
                                    : 'Unidade fixa restringe listagens por filial; "Todas as unidades" libera o cobrador em qualquer filial da empresa.'}
                            </p>
                        )}
                    </div>
                </Card>

                <Card className="p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-1 border-b pb-2">
                        <MapPin className="h-5 w-5 text-indigo-600 shrink-0" />
                        <h3 className="text-lg font-semibold text-gray-900">Onde este cobrador atua</h3>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed -mt-1">
                        Escolha a <strong>cidade ou região principal</strong> da rota (por exemplo <em>Catalão — GO</em>). Os{' '}
                        <strong>bairros</strong> são sugeridos a partir dos clientes já cadastrados nessa cidade; você pode marcar os da rota deste cobrador e{' '}
                        <strong>incluir outros manualmente</strong>. Alterar a cidade na lista limpa a seleção de bairros para não misturar regiões.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select label="Status *" name="status" value={formData.status} onChange={handleChange} required>
                            <option value="ativo">Ativo</option>
                            <option value="ferias">Férias</option>
                            <option value="afastado">Afastado</option>
                            <option value="inativo">Inativo</option>
                        </Select>
                        <div className="md:col-span-2 space-y-1.5">
                            <Select
                                label="Cidade / região de atuação *"
                                value={regiaoSelect}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v !== regiaoSelect) {
                                        setBairrosSelecionados([]);
                                    }
                                    setRegiaoSelect(v);
                                    if (v !== COBRADOR_REGIAO_PRESET_OUTRA) {
                                        setRegiaoOutro('');
                                    }
                                }}
                                required
                            >
                                <option value="">Selecione...</option>
                                {COBRADOR_REGIOES_ATUACAO_OPCOES.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt}
                                    </option>
                                ))}
                                <option value={COBRADOR_REGIAO_PRESET_OUTRA}>Outra cidade ou região…</option>
                            </Select>
                            <p className="text-[11px] text-gray-400 ml-1">
                                Sugestões de bairro usam o nome da cidade nos cadastros de clientes (residencial ou cobrança).
                            </p>
                            {regiaoSelect === COBRADOR_REGIAO_PRESET_OUTRA && (
                                <Input
                                    label="Especifique *"
                                    value={regiaoOutro}
                                    onChange={(e) => setRegiaoOutro(e.target.value)}
                                    placeholder="Ex: Cristalina — GO ou Zona Sul — Goiânia"
                                    required
                                />
                            )}
                        </div>
                    </div>

                    {areaAtuacaoFinal ? (
                        <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-900">Bairros nesta rota</span>
                                <div className="flex flex-wrap items-center gap-2">
                                    {exibirPresetBrunoCatalao ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={aplicarPresetBrunoCatalao}
                                        >
                                            Carregar rota Bruno ({COBRADOR_BRUNO_CATALAO_BAIRROS.length} bairros)
                                        </Button>
                                    ) : null}
                                    {loadingBairros ? (
                                        <span className="text-xs text-gray-500">Carregando sugestões…</span>
                                    ) : null}
                                </div>
                            </div>

                            {bairrosSelecionados.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {[...bairrosSelecionados]
                                        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                                        .map((b) =>
                                            bairroEditando?.toLowerCase() === b.toLowerCase() ? (
                                                <span
                                                    key={b}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2 py-1"
                                                >
                                                    <input
                                                        type="text"
                                                        className="normal-case text-xs w-28 min-w-[80px] border-0 p-0 focus:ring-0 text-indigo-900"
                                                        value={bairroEditValor}
                                                        onChange={(e) => setBairroEditValor(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                salvarEdicaoBairroChip();
                                                            }
                                                            if (e.key === 'Escape') cancelarEdicaoBairroChip();
                                                        }}
                                                        autoFocus
                                                    />
                                                    <button
                                                        type="button"
                                                        className="text-emerald-700"
                                                        title="Salvar"
                                                        onClick={salvarEdicaoBairroChip}
                                                    >
                                                        <Check className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="text-gray-500"
                                                        title="Cancelar"
                                                        onClick={cancelarEdicaoBairroChip}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ) : (
                                                <span
                                                    key={b}
                                                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-900"
                                                >
                                                    {b}
                                                    <button
                                                        type="button"
                                                        className="rounded-full p-0.5 hover:bg-indigo-200/80 text-indigo-800"
                                                        title="Editar nome do bairro"
                                                        onClick={() => iniciarEdicaoBairroChip(b)}
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded-full p-0.5 hover:bg-indigo-200/80 leading-none text-indigo-800"
                                                        aria-label={`Remover ${b}`}
                                                        onClick={() => removeBairroChip(b)}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ),
                                        )}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">
                                    Nenhum bairro selecionado ainda — marque na lista abaixo ou adicione manualmente.
                                </p>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                                <div className="flex-1">
                                    <Input
                                        label="Incluir ou corrigir bairro manualmente"
                                        className="normal-case"
                                        value={bairroManual}
                                        onChange={(e) => setBairroManual(e.target.value)}
                                        placeholder="Nome do bairro"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addBairroManual();
                                            }
                                        }}
                                    />
                                </div>
                                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addBairroManual}>
                                    Adicionar
                                </Button>
                            </div>

                            {!loadingBairros && todasOpcoesBairros.length === 0 ? (
                                <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    Não encontramos bairros nos clientes para esta cidade. Cadastre endereços nos clientes ou use o campo acima para anexar bairros à rota.
                                </p>
                            ) : null}

                            <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                                {todasOpcoesBairros.map((b) => {
                                    const marcado = bairrosSelecionados.some(
                                        (x) => x.toLowerCase() === b.toLowerCase(),
                                    );
                                    return (
                                        <label
                                            key={b}
                                            className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer select-none"
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={marcado}
                                                onChange={() => toggleBairro(b)}
                                            />
                                            <span>{b}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </Card>

                <Card className="p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-2 border-b pb-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        <h3 className="text-lg font-semibold text-gray-900">Comissão e admissão</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Comissão (%) *"
                            name="comissao_percentual"
                            type="number"
                            value={formData.comissao_percentual}
                            onChange={handleChange}
                            required
                            min="0"
                            max="100"
                            step="0.1"
                        />
                        <Input label="Data de Admissão" name="data_admissao" type="date" value={formData.data_admissao} onChange={handleChange} />
                    </div>

                    <div className="pt-2">
                        <p className="text-sm font-medium text-gray-700 mb-2">Comissão por método de pagamento (%)</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input label="Dinheiro" type="number" min="0" max="100" step="0.1" value={formData.comissao_por_metodo.dinheiro} onChange={(e) => handleComissaoMetodoChange('dinheiro', e.target.value)} />
                            <Input label="PIX" type="number" min="0" max="100" step="0.1" value={formData.comissao_por_metodo.pix} onChange={(e) => handleComissaoMetodoChange('pix', e.target.value)} />
                            <Input label="Cartão" type="number" min="0" max="100" step="0.1" value={formData.comissao_por_metodo.cartao} onChange={(e) => handleComissaoMetodoChange('cartao', e.target.value)} />
                            <Input label="Boleto" type="number" min="0" max="100" step="0.1" value={formData.comissao_por_metodo.boleto} onChange={(e) => handleComissaoMetodoChange('boleto', e.target.value)} />
                            <Input label="Transferência" type="number" min="0" max="100" step="0.1" value={formData.comissao_por_metodo.transferencia} onChange={(e) => handleComissaoMetodoChange('transferencia', e.target.value)} />
                        </div>
                    </div>
                </Card>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/cobradores/lista')}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Salvar Alterações' : 'Cadastrar Cobrador'}
                    </Button>
                </div>
            </form>
        </div>
    );
};
