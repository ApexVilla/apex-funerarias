import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button, Input } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import {
  salvarAjusteManualDiaPonto,
  salvarOcorrenciaDiaPonto,
} from '../../lib/pontoAdminService';
import {
  LABEL_OCORRENCIA_PONTO,
  type PontoDiaOcorrencia,
  type PontoDiaOcorrenciaTipo,
} from '../../lib/pontoDiaOcorrencia';
import { usaPontoApenasEntradaSaida } from '../../lib/pontoRules';
import {
  type BatidaPonto,
  horaFromTimestamp,
  type TipoBatida,
} from '../../lib/pontoUtils';

const labels: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  inicio_intervalo: 'Início do intervalo',
  fim_intervalo: 'Fim do intervalo',
  saida: 'Saída',
};

type ModoEdicaoDia = 'horarios' | PontoDiaOcorrenciaTipo;

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  empresaId: string;
  adminUserId: string;
  colaboradorNome: string;
  colaboradorId: string;
  colaboradorRole?: string;
  dataISO: string;
  batidasDia: BatidaPonto[];
  ocorrenciaDia?: PontoDiaOcorrencia | null;
};

export const EditarDiaPontoModal: React.FC<Props> = ({
  open,
  onClose,
  onSaved,
  empresaId,
  adminUserId,
  colaboradorNome,
  colaboradorId,
  colaboradorRole,
  dataISO,
  batidasDia,
  ocorrenciaDia,
}) => {
  const apenasEntradaSaida = usaPontoApenasEntradaSaida(colaboradorRole);
  const { showToast } = useToast();
  const [modo, setModo] = useState<ModoEdicaoDia>('horarios');
  const [entrada, setEntrada] = useState('');
  const [inicioIntervalo, setInicioIntervalo] = useState('');
  const [fimIntervalo, setFimIntervalo] = useState('');
  const [saida, setSaida] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const pick = (tipo: TipoBatida) => horaFromTimestamp(batidasDia.find((b) => b.tipo === tipo)?.timestamp);
    setEntrada(pick('entrada'));
    setInicioIntervalo(pick('inicio_intervalo'));
    setFimIntervalo(pick('fim_intervalo'));
    setSaida(pick('saida'));
    setModo(ocorrenciaDia?.tipo || 'horarios');
    setMotivo(ocorrenciaDia?.motivo || '');
  }, [open, dataISO, batidasDia, ocorrenciaDia]);

  const dataLabel = new Date(`${dataISO}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handleSalvar = async () => {
    if (modo !== 'horarios') {
      if (!motivo.trim()) {
        showToast(`Informe o motivo do ${LABEL_OCORRENCIA_PONTO[modo].toLowerCase()}.`, 'error');
        return;
      }
      setSaving(true);
      try {
        await salvarOcorrenciaDiaPonto({
          empresaId,
          userIdColaborador: colaboradorId,
          adminUserId,
          dataISO,
          tipo: modo,
          motivo: motivo.trim(),
        });
        showToast(`Dia marcado como ${LABEL_OCORRENCIA_PONTO[modo].toLowerCase()}.`, 'success');
        onSaved();
        onClose();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Erro ao salvar ocorrência.', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    const temAlgumHorario = apenasEntradaSaida
      ? [entrada, saida].some((h) => h.trim())
      : [entrada, inicioIntervalo, fimIntervalo, saida].some((h) => h.trim());
    if (temAlgumHorario && !motivo.trim()) {
      showToast('Informe o motivo do ajuste manual.', 'error');
      return;
    }
    if (!temAlgumHorario && !motivo.trim()) {
      if (!window.confirm('Limpar todas as batidas deste dia? Esta ação não pode ser desfeita automaticamente.')) {
        return;
      }
    }

    setSaving(true);
    try {
      await salvarAjusteManualDiaPonto({
        empresaId,
        userIdColaborador: colaboradorId,
        adminUserId,
        dataISO,
        horarios: apenasEntradaSaida
          ? { entrada: entrada.trim(), saida: saida.trim() }
          : {
              entrada: entrada.trim(),
              inicio_intervalo: inicioIntervalo.trim(),
              fim_intervalo: fimIntervalo.trim(),
              saida: saida.trim(),
            },
        motivo: motivo.trim() || 'Limpeza manual do dia',
      });
      showToast('Folha de ponto atualizada. Horários ajustados aparecem com *.', 'success');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao salvar ajuste.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const modoBtnCls = (value: ModoEdicaoDia) => {
    let activeCls = 'border-indigo-400 bg-indigo-50 text-indigo-800';
    if (value === 'folga') activeCls = 'border-violet-400 bg-violet-50 text-violet-800';
    else if (value === 'atestado') activeCls = 'border-sky-400 bg-sky-50 text-sky-800';
    else if (value === 'feriado') activeCls = 'border-amber-400 bg-amber-50 text-amber-800';
    else if (value === 'jornada_normal') activeCls = 'border-emerald-400 bg-emerald-50 text-emerald-800';
    else if (value === 'hora_extra') activeCls = 'border-pink-400 bg-pink-50 text-pink-800';

    return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-center ${
      modo === value ? activeCls : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
    }`;
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Ajustar dia na folha de ponto"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-800">{colaboradorNome}</span>
          <span className="mx-1">·</span>
          <span className="capitalize">{dataLabel}</span>
        </p>

        <div>
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Tipo do dia</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button type="button" className={modoBtnCls('horarios')} onClick={() => setModo('horarios')}>
              Horários
            </button>
            <button type="button" className={modoBtnCls('folga')} onClick={() => setModo('folga')}>
              Folga
            </button>
            <button type="button" className={modoBtnCls('atestado')} onClick={() => setModo('atestado')}>
              Atestado
            </button>
            <button type="button" className={modoBtnCls('feriado')} onClick={() => setModo('feriado')}>
              Feriado
            </button>
            <button type="button" className={modoBtnCls('jornada_normal')} onClick={() => setModo('jornada_normal')}>
              Jornada Normal
            </button>
            <button type="button" className={modoBtnCls('hora_extra')} onClick={() => setModo('hora_extra')}>
              Hora Extra
            </button>
          </div>
        </div>

        {modo === 'horarios' ? (
          <>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Horários salvos aqui serão marcados com <strong>*</strong> no espelho (lançamento manual pelo
              administrador). Batidas anteriores do dia serão substituídas.
            </p>

            <div className={`grid gap-3 ${apenasEntradaSaida ? 'grid-cols-2' : 'grid-cols-2'}`}>
              <Input label={labels.entrada} type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
              {!apenasEntradaSaida && (
                <>
                  <Input
                    label={labels.inicio_intervalo}
                    type="time"
                    value={inicioIntervalo}
                    onChange={(e) => setInicioIntervalo(e.target.value)}
                  />
                  <Input
                    label={labels.fim_intervalo}
                    type="time"
                    value={fimIntervalo}
                    onChange={(e) => setFimIntervalo(e.target.value)}
                  />
                </>
              )}
              <Input label={labels.saida} type="time" value={saida} onChange={(e) => setSaida(e.target.value)} />
            </div>
          </>
        ) : (
          <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            O dia será marcado como <strong>{LABEL_OCORRENCIA_PONTO[modo]}</strong>.
            {(modo === 'folga' || modo === 'atestado') ? ' Batidas existentes serão removidas e o dia não contará como falta.' : ' Batidas existentes neste dia serão preservadas.'}
          </p>
        )}

        <Input
          label={modo === 'horarios' ? 'Motivo do ajuste' : `Motivo do ${LABEL_OCORRENCIA_PONTO[modo].toLowerCase()}`}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={
            modo === 'folga'
              ? 'Ex.: folga compensada, plantão trocado'
              : modo === 'atestado'
                ? 'Ex.: atestado médico 1 dia, CID informado'
                : 'Ex.: esqueceu de bater saída; correção aprovada pela RH'
          }
        />

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={() => void handleSalvar()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
