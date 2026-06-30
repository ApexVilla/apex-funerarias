import React, { useMemo, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { ChevronDown, ChevronUp, Plus, Save, Trash2, X } from 'lucide-react';
import { SistemaPdfsCatalogo } from '../../components/documentos/SistemaPdfsCatalogo';

type TipoModelo = 'contrato' | 'recibo' | 'outro';

type ModeloDocumento = {
  id: string;
  nome: string;
  tipo: TipoModelo;
  conteudo: string;
  atualizadoEm: string;
};

const STORAGE_PREFIX = 'documentos-modelos-v1';

const criarId = () => `md-${Math.random().toString(36).slice(2, 10)}`;

const MODELO_PADRAO_RECIBO = `RECIBO Nº {{numero_recibo}}
Data: {{data_atual}}

Recebemos de: {{cliente_nome}}
CPF/CNPJ: {{cliente_cpf}}

Valor recebido: {{valor}}
Valor por extenso: {{valor_extenso}}

Referente a: {{referencia}}
Descrição: {{descricao}}
Vencimento: {{vencimento}}

Empresa: {{empresa_nome}}
CNPJ: {{empresa_cnpj}}

Assinatura do responsável: ______________________________________

Observação:
Este recibo é documento de quitação referente ao pagamento informado acima.`;

const placeholdersSugestao = [
  '{{cliente_nome}}',
  '{{cliente_cpf}}',
  '{{empresa_nome}}',
  '{{empresa_cnpj}}',
  '{{data_atual}}',
  '{{valor}}',
  '{{vencimento}}',
];

export const DocumentosModelosPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const empresaId = user?.empresa_id || 'sem-empresa';
  const storageKey = `${STORAGE_PREFIX}:${empresaId}`;

  const [modelos, setModelos] = useState<ModeloDocumento[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const lista = raw ? (JSON.parse(raw) as ModeloDocumento[]) : [];
      const jaTemReciboPadrao = lista.some(
        (m) => m.tipo === 'recibo' && m.nome.toLowerCase() === 'recibo padrão',
      );
      if (jaTemReciboPadrao) return lista;

      const agora = new Date().toISOString();
      const comPadrao = [
        {
          id: criarId(),
          nome: 'Recibo Padrão',
          tipo: 'recibo' as const,
          conteudo: MODELO_PADRAO_RECIBO,
          atualizadoEm: agora,
        },
        ...lista,
      ];
      localStorage.setItem(storageKey, JSON.stringify(comPadrao));
      return comPadrao;
    } catch {
      const agora = new Date().toISOString();
      const fallback = [
        {
          id: criarId(),
          nome: 'Recibo Padrão',
          tipo: 'recibo' as const,
          conteudo: MODELO_PADRAO_RECIBO,
          atualizadoEm: agora,
        },
      ];
      localStorage.setItem(storageKey, JSON.stringify(fallback));
      return fallback;
    }
  });

  const [tipo, setTipo] = useState<TipoModelo>('contrato');
  const [nome, setNome] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);

  const modelosOrdenados = useMemo(
    () => [...modelos].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)),
    [modelos],
  );

  const persistir = (lista: ModeloDocumento[]) => {
    setModelos(lista);
    localStorage.setItem(storageKey, JSON.stringify(lista));
  };

  const limparFormulario = () => {
    setTipo('contrato');
    setNome('');
    setConteudo('');
    setEditandoId(null);
  };

  const salvarModelo = () => {
    const nomeTratado = nome.trim();
    const conteudoTratado = conteudo.trim();
    if (!nomeTratado || !conteudoTratado) {
      showToast('Informe nome e conteúdo do layout.', 'warning');
      return;
    }

    const agora = new Date().toISOString();
    if (editandoId) {
      const atualizados = modelos.map((m) =>
        m.id === editandoId
          ? { ...m, nome: nomeTratado, tipo, conteudo: conteudoTratado, atualizadoEm: agora }
          : m,
      );
      persistir(atualizados);
      showToast('Layout atualizado com sucesso.', 'success');
      limparFormulario();
      setFormAberto(false);
      return;
    }

    const novo: ModeloDocumento = {
      id: criarId(),
      nome: nomeTratado,
      tipo,
      conteudo: conteudoTratado,
      atualizadoEm: agora,
    };
    persistir([novo, ...modelos]);
    showToast('Layout salvo como padrão da empresa.', 'success');
    limparFormulario();
    setFormAberto(false);
  };

  const editarModelo = (modelo: ModeloDocumento) => {
    setEditandoId(modelo.id);
    setTipo(modelo.tipo);
    setNome(modelo.nome);
    setConteudo(modelo.conteudo);
    setFormAberto(true);
  };

  const removerModelo = (id: string) => {
    persistir(modelos.filter((m) => m.id !== id));
    if (editandoId === id) limparFormulario();
    showToast('Layout removido.', 'info');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        subtitle="Visualize os PDFs gerados pelo sistema e cadastre layouts personalizados"
      />

      <SistemaPdfsCatalogo />

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Layouts personalizados</h2>
            <p className="text-xs text-gray-500">
              Templates da empresa para contrato, recibo e demais documentos baseados em texto.
            </p>
          </div>
          <Button
            size="sm"
            variant={formAberto ? 'outline' : 'primary'}
            onClick={() => {
              if (formAberto) {
                limparFormulario();
              }
              setFormAberto((v) => !v);
            }}
          >
            {formAberto ? (
              <>
                <X className="h-4 w-4 mr-1.5" /> Cancelar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1.5" /> Novo layout
              </>
            )}
          </Button>
        </div>

        {formAberto && (
          <div className="mt-4 space-y-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Tipo de Documento"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoModelo)}
              >
                <option value="contrato">Contrato</option>
                <option value="recibo">Recibo</option>
                <option value="outro">Outro Documento</option>
              </Select>
              <div className="md:col-span-2">
                <Input
                  label="Nome do Layout"
                  placeholder="Ex.: Contrato Padrão Anual"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
            </div>

            <Textarea
              label="Layout / Conteúdo"
              placeholder="Cole aqui o layout base do documento..."
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              className="min-h-[200px]"
            />

            <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <summary className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                Placeholders disponíveis
              </summary>
              <p className="text-xs text-slate-600 mt-2">{placeholdersSugestao.join('  •  ')}</p>
            </details>

            <div className="flex gap-2">
              <Button onClick={salvarModelo}>
                <Save className="h-4 w-4 mr-2" />
                {editandoId ? 'Atualizar' : 'Salvar'}
              </Button>
              <Button variant="outline" onClick={limparFormulario}>
                Limpar campos
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {modelosOrdenados.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Nenhum layout cadastrado ainda.</p>
          ) : (
            modelosOrdenados.map((m) => (
              <ModeloLinha
                key={m.id}
                modelo={m}
                onEditar={() => editarModelo(m)}
                onRemover={() => removerModelo(m.id)}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

interface ModeloLinhaProps {
  modelo: ModeloDocumento;
  onEditar: () => void;
  onRemover: () => void;
}

const ModeloLinha: React.FC<ModeloLinhaProps> = ({ modelo, onEditar, onRemover }) => {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60">
      <div className="flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="min-w-0 flex-1 flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white rounded-xl transition"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{modelo.nome}</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                {modelo.tipo}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Atualizado em {new Date(modelo.atualizadoEm).toLocaleString('pt-BR')}
            </p>
          </div>
          {aberto ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
          )}
        </button>
        <div className="flex items-center gap-2 border-t border-gray-200 px-3 py-2 sm:border-t-0 sm:border-l sm:py-0 sm:pl-3 sm:pr-2">
          <Button size="sm" variant="outline" onClick={onEditar}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onRemover}
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {aberto && (
        <div className="border-t border-gray-200 px-4 py-3 bg-white rounded-b-xl">
          <pre className="whitespace-pre-wrap break-words text-xs text-gray-700 font-sans max-h-72 overflow-y-auto">
            {modelo.conteudo.trim() || 'Sem conteúdo.'}
          </pre>
        </div>
      )}
    </div>
  );
};
