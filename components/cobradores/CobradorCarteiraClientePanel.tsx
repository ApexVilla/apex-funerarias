import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserCheck, UserMinus } from 'lucide-react';
import { Button, Card } from '../ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';
import {
  atribuirCobradorCarteiraCliente,
  cobradorAtualNaCarteiraCliente,
  loadCobradoresAtivosParaUnidade,
  removerClienteDaCarteira,
  type CobradorOpcao,
} from '../../lib/cobradorDisponiveis';
import { atribuirClienteCarteiraEscritorio, removerClienteDaCarteiraEscritorio } from '../../lib/carteiraEscritorio';
import { isCobradorEscritorio } from '../../lib/cobradorEscritorio';
import {
  loadCobradoresComBairrosAtivos,
  resolverCobradorSugeridoPorBairro,
  type CobradorComBairros,
} from '../../lib/cobradorSugestaoBairro';

type Props = {
  clienteId: string;
  empresaId: string;
  titulo?: string;
  /** Bairro de cobrança do cliente — usado para sugerir cobrador da rota. */
  bairroCobranca?: string;
};

export const CobradorCarteiraClientePanel: React.FC<Props> = ({
  clienteId,
  empresaId,
  titulo = 'Carteira do cobrador',
  bairroCobranca = '',
}) => {
  const { showToast } = useToast();
  const {
    empresasDoGrupo,
    visaoTodasEmpresasGrupo,
    podeAlternarEmpresa,
    empresaIdsParaFiltro,
  } = useEmpresaContextoAtivo();

  const [cobradorAtual, setCobradorAtual] = useState<{ cobradorId: string; cobradorNome: string } | null>(
    null,
  );
  const [cobradorSelecionado, setCobradorSelecionado] = useState('');
  const [cobradores, setCobradores] = useState<CobradorOpcao[]>([]);
  const [cobradoresComBairros, setCobradoresComBairros] = useState<CobradorComBairros[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const cobradorEscolhidoManualRef = useRef(false);
  const bairroAnteriorRef = useRef(bairroCobranca);

  const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
  const tokenUnidadeGrupo = useMemo(() => {
    if (visaoTodasEmpresasGrupo) return '';
    const nome = empresasDoGrupo.find((e) => e.id === empresaId)?.nome || '';
    return unidadeNomeCurto(nome);
  }, [visaoTodasEmpresasGrupo, empresasDoGrupo, empresaId]);

  const idsEmpresa = useMemo(
    () => (empresaIdsParaFiltro.length ? empresaIdsParaFiltro : [empresaId]),
    [empresaIdsParaFiltro, empresaId],
  );

  const cobradorSugerido = useMemo(() => {
    if (!bairroCobranca.trim() || cobradoresComBairros.length === 0) return null;
    return resolverCobradorSugeridoPorBairro(bairroCobranca, cobradoresComBairros);
  }, [bairroCobranca, cobradoresComBairros]);

  const recarregar = useCallback(async () => {
    if (!empresaId || !clienteId) return;
    setLoading(true);
    try {
      const [atual, lista, comBairros] = await Promise.all([
        cobradorAtualNaCarteiraCliente(empresaId, clienteId),
        loadCobradoresAtivosParaUnidade({
          empresaIdsParaFiltro: idsEmpresa,
          empresasDoGrupo,
          visaoTodasEmpresasGrupo,
          multiEmpresa,
          tokenUnidadeGrupo,
        }),
        loadCobradoresComBairrosAtivos(idsEmpresa),
      ]);
      setCobradorAtual(atual);
      setCobradores(lista);
      setCobradoresComBairros(comBairros);
      if (atual?.cobradorId) {
        cobradorEscolhidoManualRef.current = false;
        setCobradorSelecionado(atual.cobradorId);
      } else if (!cobradorEscolhidoManualRef.current) {
        const sugerido = resolverCobradorSugeridoPorBairro(bairroCobranca, comBairros);
        setCobradorSelecionado(sugerido?.id || '');
      }
    } finally {
      setLoading(false);
    }
  }, [
    empresaId,
    clienteId,
    idsEmpresa,
    empresasDoGrupo,
    visaoTodasEmpresasGrupo,
    multiEmpresa,
    tokenUnidadeGrupo,
    bairroCobranca,
  ]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    if (bairroCobranca !== bairroAnteriorRef.current) {
      bairroAnteriorRef.current = bairroCobranca;
      cobradorEscolhidoManualRef.current = false;
    }
  }, [bairroCobranca]);

  useEffect(() => {
    if (cobradorAtual || !cobradorSugerido || cobradorEscolhidoManualRef.current) return;
    setCobradorSelecionado((prev) => (prev === cobradorSugerido.id ? prev : cobradorSugerido.id));
  }, [cobradorAtual, cobradorSugerido?.id]);

  const atribuir = async () => {
    if (!cobradorSelecionado) {
      showToast('Selecione o cobrador ou Escritório.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const res = isCobradorEscritorio(cobradorSelecionado)
        ? await atribuirClienteCarteiraEscritorio(empresaId, clienteId)
        : await atribuirCobradorCarteiraCliente(empresaId, clienteId, cobradorSelecionado);
      if (!res.ok) {
        showToast(res.erro || 'Não foi possível atribuir na carteira.', 'error');
        return;
      }
      const destino = cobradores.find((c) => c.id === cobradorSelecionado)?.nome || 'carteira';
      showToast(
        cobradorAtual
          ? `Reatribuído para ${destino} (${res.linhasAtualizadas} pendência(s)).`
          : `Incluído na carteira de ${destino} (${res.linhasAtualizadas} pendência(s)).`,
        'success',
      );
      await recarregar();
    } finally {
      setSaving(false);
    }
  };

  const remover = async () => {
    if (!cobradorAtual) return;
    setSaving(true);
    try {
      const res = isCobradorEscritorio(cobradorAtual.cobradorId)
        ? await removerClienteDaCarteiraEscritorio(empresaId, clienteId)
        : await removerClienteDaCarteira(empresaId, clienteId);
      if (!res.ok) {
        showToast(res.erro || 'Cliente não estava na carteira.', 'warning');
        return;
      }
      showToast('Cliente removido da carteira.', 'success');
      setCobradorSelecionado('');
      await recarregar();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 border-l-4 border-l-violet-500">
      <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2 text-violet-700">
        <UserCheck className="h-5 w-5" /> {titulo}
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Atribua um cobrador ou <strong>Escritório</strong> (pagamento na unidade). A lista completa fica em Cobradores →
        Carteira.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <>
          {cobradorAtual ? (
            <p className="text-sm text-gray-800 mb-3">
              Carteira atual: <strong>{cobradorAtual.cobradorNome}</strong>
            </p>
          ) : (
            <p className="text-sm text-amber-700 mb-3">Este cliente ainda não está na carteira de cobrança.</p>
          )}

          <div className="flex flex-col gap-3">
            <div className="min-w-0 w-full">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider ml-1 mb-1.5">
                Cobrador
              </label>
              {cobradorSugerido && cobradorSelecionado === cobradorSugerido.id && !cobradorAtual ? (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-2">
                  Cobrador sugerido pelo bairro <strong>{bairroCobranca}</strong>:{' '}
                  <strong>{cobradorSugerido.nome}</strong>.
                </p>
              ) : bairroCobranca.trim() && !loading && cobradoresComBairros.length > 0 && !cobradorSugerido ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
                  Nenhum cobrador com rota no bairro <strong>{bairroCobranca}</strong>. Escolha manualmente.
                </p>
              ) : null}
              <select
                className="flex h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2 text-sm text-gray-900 truncate focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white disabled:opacity-50 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
                value={cobradorSelecionado}
                onChange={(e) => {
                  cobradorEscolhidoManualRef.current = true;
                  setCobradorSelecionado(e.target.value);
                }}
              >
                <option value="">Selecione cobrador ou Escritório...</option>
                {cobradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="min-h-11 h-auto shrink-0 whitespace-nowrap px-4 py-2.5"
                onClick={() => void atribuir()}
                loading={saving}
                disabled={!cobradorSelecionado}
              >
                {cobradorAtual ? 'Reatribuir' : 'Incluir na carteira'}
              </Button>
              {cobradorAtual ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 h-auto shrink-0 whitespace-nowrap px-4 py-2.5"
                  onClick={() => void remover()}
                  loading={saving}
                >
                  <UserMinus className="h-4 w-4 mr-1 shrink-0" /> Remover
                </Button>
              ) : null}
            </div>
          </div>

          {!loading && cobradores.length === 0 ? (
            <p className="text-xs text-gray-500 mt-2">
              Nenhum cobrador ativo nesta unidade. Cadastre em Cobradores.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
};
