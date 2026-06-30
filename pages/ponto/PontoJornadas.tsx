import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao, filtrarQueryPorEmpresaIds } from '../../lib/useEmpresaIdsOperacao';
import { canAccessPontoByRole, getUserPontoConfig, labelRegimePonto, type PontoRegime } from '../../lib/pontoRules';

type SistemaUsuario = {
  id: string;
  nome: string;
  email: string;
  role?: string;
  permissoes?: any;
};

const regimeOptions: Array<{ value: PontoRegime; label: string; minutos: number }> = [
  { value: 'padrao_8h', label: '8 horas', minutos: 8 * 60 },
  { value: 'seis_horas', label: '6 horas', minutos: 6 * 60 },
  { value: 'doze_por_trinta_seis', label: '12x36', minutos: 12 * 60 },
  { value: 'cargo_confianca', label: 'Cargo de Confiança (Sem ponto)', minutos: 0 },
  { value: 'personalizado', label: 'Personalizado', minutos: 8 * 60 },
];

export const PontoJornadas: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { empresaIdsFiltro, aguardandoContexto, dataRevisionEmpresa } = useEmpresaIdsOperacao();
  const [usuarios, setUsuarios] = useState<SistemaUsuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const canManage = canAccessPontoByRole(user?.role);

  const loadUsuarios = async () => {
    if (!canManage) return;
    if (aguardandoContexto) {
      setLoading(true);
      return;
    }
    const ids = empresaIdsFiltro;
    if (ids.length === 0) {
      setUsuarios([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await filtrarQueryPorEmpresaIds(
        (supabase as any)
          .from('users')
          .select('id, nome, email, role, permissoes, ativo, deleted_at')
          .eq('ativo', true)
          .is('deleted_at', null)
          .order('nome', { ascending: true }),
        ids,
      );
      if (error) throw error;
      setUsuarios((data || []) as SistemaUsuario[]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao carregar usuários.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsuarios();
  }, [canManage, aguardandoContexto, empresaIdsFiltro.join(','), dataRevisionEmpresa]);

  const updateConfig = async (
    target: SistemaUsuario,
    regime: PontoRegime,
    cargaMinutos: number,
    escalaSabado: {
      ativo: boolean;
      metaSabadoMinutos: number;
      dataInicioSabado: string;
    },
  ) => {
    setSavingUserId(target.id);
    try {
      const atual = getUserPontoConfig(target.permissoes);
      const preset = regimeOptions.find((r) => r.value === regime);
      const cargaFinal =
        regime === 'personalizado' ? cargaMinutos : preset?.minutos ?? atual.carga_horaria_minutos;

      const dataInicioSabado = escalaSabado.dataInicioSabado.trim().slice(0, 10);
      const novoPermissoes = {
        ...(target.permissoes || {}),
        ponto_config: {
          ...atual,
          regime,
          carga_horaria_minutos: cargaFinal,
          pode_editar_proprio_ponto: atual.pode_editar_proprio_ponto ?? false,
          escala_sabado_alternado: escalaSabado.ativo,
          meta_sabado_minutos: escalaSabado.metaSabadoMinutos,
          data_inicio_escala_sabado:
            escalaSabado.ativo && /^\d{4}-\d{2}-\d{2}$/.test(dataInicioSabado)
              ? dataInicioSabado
              : undefined,
        },
      };

      const { error } = await supabase
        .from('users')
        .update({ permissoes: novoPermissoes, updated_at: new Date().toISOString() })
        .eq('id', target.id);
      if (error) throw error;

      setUsuarios((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, permissoes: novoPermissoes } : u)),
      );
      showToast('Jornada atualizada com sucesso.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao salvar jornada.', 'error');
    } finally {
      setSavingUserId(null);
    }
  };

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-gray-700">Apenas supervisão ou cargos superiores podem gerenciar jornadas.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Jornada"
        subtitle="Defina a carga horária de cada colaborador para cálculo correto do ponto"
      />

      <Card className="p-4 bg-amber-50 border-amber-100">
        <p className="text-sm text-amber-800">
          Em escala <strong>12x36</strong>, dias sem batida são folga (meta zero). Nos dias em que o colaborador
          registrar ponto, a meta é 12h — inclusive em folga ou dias seguidos, sem necessidade de convocação prévia.
        </p>
        <p className="text-sm text-amber-800 mt-2">
          Jornada de <strong>6 horas</strong> inclui sábado como dia útil: o trabalho no sábado usa a meta de 6h
          (não conta a jornada inteira como hora extra).
        </p>
        <p className="text-sm text-amber-800 mt-2">
          Para <strong>recepção com sábado alternado</strong>, ative a escala de sábado: dias úteis com meta de 8h,
          sábados de plantão com meta configurável (padrão <strong>4h</strong> em regime 8h, ou <strong>6h</strong> em
          regime 6h). Sábados de folga não exigem ponto; trabalho nesses dias é hora extra.
        </p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3">Colaborador</th>
                <th className="text-left px-4 py-3">Cargo</th>
                <th className="text-left px-4 py-3">Regime</th>
                <th className="text-left px-4 py-3">Carga diária (h)</th>
                <th className="text-left px-4 py-3">Sábado alternado</th>
                <th className="text-right px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Carregando colaboradores...
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nenhum colaborador encontrado.
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <JornadaRow
                    key={u.id}
                    usuario={u}
                    saving={savingUserId === u.id}
                    onSave={updateConfig}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const JornadaRow: React.FC<{
  usuario: SistemaUsuario;
  saving: boolean;
  onSave: (
    target: SistemaUsuario,
    regime: PontoRegime,
    cargaMinutos: number,
    escalaSabado: { ativo: boolean; metaSabadoMinutos: number; dataInicioSabado: string },
  ) => Promise<void>;
}> = ({ usuario, saving, onSave }) => {
  const cfg = getUserPontoConfig(usuario.permissoes);
  const [regime, setRegime] = useState<PontoRegime>(cfg.regime);
  const [horas, setHoras] = useState(String(Math.round((cfg.carga_horaria_minutos / 60) * 100) / 100));
  const [escalaSabado, setEscalaSabado] = useState(Boolean(cfg.escala_sabado_alternado));
  const [metaSabadoHoras, setMetaSabadoHoras] = useState(
    String(Math.round(((cfg.meta_sabado_minutos ?? 4 * 60) / 60) * 100) / 100),
  );
  const [dataInicioSabado, setDataInicioSabado] = useState(cfg.data_inicio_escala_sabado || '');
  const minutos = regime === 'cargo_confianca' ? 0 : Math.max(60, Math.round(Number(horas || '0') * 60));
  const metaSabadoMinutos = Math.max(60, Math.round(Number(metaSabadoHoras || '4') * 60));

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{usuario.nome || 'Sem nome'}</p>
        <p className="text-xs text-gray-500">{usuario.email}</p>
      </td>
      <td className="px-4 py-3 text-gray-700">{usuario.role || '-'}</td>
      <td className="px-4 py-3">
        <Select
          value={regime}
          onChange={(e) => {
            const novo = e.target.value as PontoRegime;
            setRegime(novo);
            const preset = regimeOptions.find((r) => r.value === novo);
            if (preset && novo !== 'personalizado') {
              setHoras(String(preset.minutos / 60));
            }
          }}
        >
          {regimeOptions.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min={1}
          max={24}
          step={0.5}
          value={horas}
          disabled={regime !== 'personalizado'}
          onChange={(e) => setHoras(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        {regime === 'cargo_confianca' ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          <div className="space-y-2 min-w-[200px]">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={escalaSabado}
                onChange={(e) => setEscalaSabado(e.target.checked)}
              />
              Sábado sim / não
            </label>
            {escalaSabado && (
              <>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  step={0.5}
                  value={metaSabadoHoras}
                  onChange={(e) => setMetaSabadoHoras(e.target.value)}
                  title="Meta no sábado de plantão (horas)"
                />
                <Input
                  type="date"
                  value={dataInicioSabado}
                  onChange={(e) => setDataInicioSabado(e.target.value)}
                  title="Primeiro sábado de trabalho da escala"
                />
              </>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          loading={saving}
          onClick={() =>
            onSave(usuario, regime, minutos, {
              ativo: escalaSabado,
              metaSabadoMinutos: metaSabadoMinutos,
              dataInicioSabado,
            })
          }
        >
          Salvar
        </Button>
        <p className="text-[11px] text-gray-500 mt-1">{labelRegimePonto(cfg.regime)}</p>
      </td>
    </tr>
  );
};
