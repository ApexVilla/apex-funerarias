import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, RefreshCw } from 'lucide-react';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';
import { filialAccentClasses } from '../../lib/filialAccent';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import {
  deduplicarEmpresasGrupo,
  filiaisComRotuloSeletor,
  marcaGrupoCurta,
  rotuloEmpresaNoSeletor,
  unidadeNomeCurto,
} from '../../lib/contextoUnidadeLabels';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Components';

const LS_FILIAL_ID = 'apex_filial_id';
const LS_FILIAL_NOME = 'apex_filial_nome';

export const ContextoOperacionalSelector: React.FC = () => {
  const {
    empresasDoGrupo,
    empresaIdEfetivo,
    setEmpresaDoGrupo,
    visaoTodasEmpresasGrupo,
    setVisaoTodasEmpresasGrupo,
    podeAlternarEmpresa,
    loadingEmpresasGrupo,
  } = useEmpresaContextoAtivo();

  const {
    filiais,
    loadingFiliais,
    filiaisLoadError,
    filialId,
    filialNome,
    setFilial,
    podeVerTodasFiliais,
    isTodasFiliais,
    atualizarEmpresaEFiliais,
    atualizandoEmpresaEFiliais,
    filiaisBloqueadasPorPermissao,
  } = useFilial();

  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');
  const pendingApplyRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;

  /** Uma única unidade/filial permitida — sem menu (vale para qualquer usuário com permissão restrita). */
  const contextoFixo =
    (multiEmpresa && empresasDoGrupo.length <= 1) ||
    (!multiEmpresa && filiais.length <= 1 && !podeVerTodasFiliais);

  const refreshBusy = loadingFiliais || atualizandoEmpresaEFiliais || loadingEmpresasGrupo;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const empresasSorted = useMemo(() => {
    const list = deduplicarEmpresasGrupo(empresasDoGrupo);
    list.sort((a, b) =>
      unidadeNomeCurto(a.nome).localeCompare(unidadeNomeCurto(b.nome), 'pt-BR', { sensitivity: 'base' }),
    );
    return list;
  }, [empresasDoGrupo]);

  const empresaNomeAtual = useMemo(
    () => empresasDoGrupo.find((e) => e.id === empresaIdEfetivo)?.nome || 'Empresa',
    [empresasDoGrupo, empresaIdEfetivo],
  );

  const marca = useMemo(() => marcaGrupoCurta(empresaNomeAtual), [empresaNomeAtual]);

  const unidadeCurta = unidadeNomeCurto(empresaNomeAtual);

  const triggerLabel = multiEmpresa
    ? visaoTodasEmpresasGrupo
      ? `${marca} · Todas as unidades`
      : `${marca} · ${unidadeCurta}`
    : isTodasFiliais && podeVerTodasFiliais
      ? `${marca} · Todas as filiais`
      : `${marca} · ${filialNome || unidadeCurta || 'Unidade'}`;

  const accent = useMemo(() => {
    if (multiEmpresa && visaoTodasEmpresasGrupo) {
      return {
        border: 'border-indigo-200',
        bg: 'bg-indigo-50/90',
        text: 'text-indigo-900',
        dot: 'bg-gradient-to-r from-blue-500 via-emerald-500 to-orange-500',
      };
    }
    if (multiEmpresa) return filialAccentClasses(unidadeNomeCurto(empresaNomeAtual));
    return filialAccentClasses(isTodasFiliais ? '' : filialNome);
  }, [multiEmpresa, visaoTodasEmpresasGrupo, empresaNomeAtual, isTodasFiliais, filialNome]);

  const requestChange = useCallback((label: string, apply: () => void) => {
    pendingApplyRef.current = apply;
    setPendingLabel(label);
    setOpen(false);
    setConfirmOpen(true);
  }, []);

  const confirmApply = useCallback(() => {
    try {
      pendingApplyRef.current?.();
    } finally {
      pendingApplyRef.current = null;
      setConfirmOpen(false);
      setPendingLabel('');
    }
  }, []);

  const cancelConfirm = useCallback(() => {
    pendingApplyRef.current = null;
    setConfirmOpen(false);
    setPendingLabel('');
  }, []);

  /** Troca a empresa do grupo (e sai da visão “todas as unidades”). */
  const aplicarEmpresaDoGrupo = useCallback(
    (empresaId: string) => {
      if (!visaoTodasEmpresasGrupo && empresaId === empresaIdEfetivo) return;
      try {
        localStorage.removeItem(LS_FILIAL_ID);
        localStorage.removeItem(LS_FILIAL_NOME);
      } catch {
        /* ignore */
      }
      setEmpresaDoGrupo(empresaId);
    },
    [visaoTodasEmpresasGrupo, empresaIdEfetivo, setEmpresaDoGrupo],
  );

  const aplicarFilial = useCallback(
    (fId: string, fNome: string) => {
      setFilial(fId, fNome);
    },
    [setFilial],
  );

  const btnAtualizar = (
    <button
      type="button"
      onClick={() => void atualizarEmpresaEFiliais()}
      disabled={refreshBusy}
      className="hidden sm:inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
      title="Atualizar perfil, empresas do grupo e filiais"
    >
      <RefreshCw className={`h-4 w-4 ${refreshBusy ? 'animate-spin' : ''}`} />
    </button>
  );

  if (loadingEmpresasGrupo && empresasDoGrupo.length === 0) {
    return (
      <div className="hidden sm:flex items-center gap-1.5">
        {btnAtualizar}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
          <Building2 className="h-4 w-4 shrink-0 opacity-60" />
          Contexto…
        </div>
      </div>
    );
  }

  if (!multiEmpresa && loadingFiliais && filiais.length === 0) {
    return (
      <div className="hidden sm:flex items-center gap-1.5">
        {btnAtualizar}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
          <Building2 className="h-4 w-4 shrink-0 opacity-60" />
          Filiais…
        </div>
      </div>
    );
  }

  if (!multiEmpresa && filiaisLoadError) {
    return (
      <div className="hidden md:flex items-center gap-1.5 max-w-[min(100vw-2rem,420px)]">
        {btnAtualizar}
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 leading-snug truncate" title={filiaisLoadError}>
            Filiais indisponíveis
          </span>
        </div>
      </div>
    );
  }

  if (!multiEmpresa && filiais.length === 0) {
    const semFilialNoBanco = !loadingFiliais && !filiaisBloqueadasPorPermissao;
    return (
      <div className="hidden md:flex items-start gap-1.5 max-w-[min(100vw-2rem,440px)]">
        {btnAtualizar}
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          <Building2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="leading-snug">
            {semFilialNoBanco ? (
              <>
                Nenhuma filial cadastrada para <strong>{unidadeCurta || empresaNomeAtual}</strong>.
                Cadastre em <strong>Estoque → Filiais e depósitos</strong>.
              </>
            ) : (
              <>
                Nenhuma filial liberada para <strong>{unidadeCurta || empresaNomeAtual}</strong> com seu
                perfil. Peça ao administrador ajustar <strong>Configurações → Permissões</strong> (unidades
                do usuário) ou use o botão atualizar após a troca de empresa.
              </>
            )}
          </span>
        </div>
      </div>
    );
  }

  const renderFilialOptions = () => {
    const seenFilial = new Set<string>();
    const filiaisUnicas = filiais.filter((f) => {
      if (!f.id || seenFilial.has(f.id)) return false;
      seenFilial.add(f.id);
      return true;
    });

    const rowOpts: { id: string; nome: string; todas: boolean }[] = [];
    if (podeVerTodasFiliais && filiaisUnicas.length > 1) {
      rowOpts.push({ id: FILIAL_TODAS_ID, nome: 'Todas as filiais', todas: true });
    }
    const empresasPorId = Object.fromEntries(empresasDoGrupo.map((e) => [e.id, e.nome]));
    filiaisComRotuloSeletor(
      filiaisUnicas.map((f) => ({ ...f, empresa_id: empresaIdEfetivo })),
      empresasPorId,
    ).forEach((f) => rowOpts.push({ id: f.id, nome: f.rotulo, todas: false }));

    return rowOpts.map((opt) => {
      const ac = opt.todas
        ? { text: 'text-slate-800', dot: 'bg-gradient-to-r from-blue-500 via-emerald-500 to-orange-500' }
        : filialAccentClasses(opt.nome);
      const selected = filialId === opt.id;
      return (
        <button
          key={opt.id}
          type="button"
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${selected ? 'bg-gray-50 font-semibold' : ''}`}
          onClick={() => {
            if (selected) {
              setOpen(false);
              return;
            }
            requestChange(opt.nome, () => aplicarFilial(opt.id, opt.nome));
          }}
        >
          <span className={`h-2 w-2 rounded-full shrink-0 ${ac.dot}`} />
          <span className={`min-w-0 flex-1 truncate ${ac.text}`}>{opt.nome}</span>
        </button>
      );
    });
  };

  const renderUnidadesGrupo = () => (
    <>
      <button
        key="__todas_unidades__"
        type="button"
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${visaoTodasEmpresasGrupo ? 'bg-gray-50 font-semibold' : ''}`}
        onClick={() => {
          if (visaoTodasEmpresasGrupo) {
            setOpen(false);
            return;
          }
          requestChange(`${marca} — todas as unidades`, () => setVisaoTodasEmpresasGrupo(true));
        }}
      >
        <span className="h-2 w-2 rounded-full shrink-0 bg-gradient-to-r from-blue-500 via-emerald-500 to-orange-500" />
        <span className="min-w-0 flex-1 truncate text-slate-800">Todas as unidades</span>
      </button>
      {empresasSorted.map((emp) => {
        const label = rotuloEmpresaNoSeletor(emp, empresasSorted);
        const ac = filialAccentClasses(unidadeNomeCurto(emp.nome));
        const selected = emp.id === empresaIdEfetivo && !visaoTodasEmpresasGrupo;
        return (
          <button
            key={emp.id}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${selected ? 'bg-gray-50 font-semibold' : ''}`}
            onClick={() => {
              if (selected) {
                setOpen(false);
                return;
              }
              requestChange(`${marca} — ${label}`, () => aplicarEmpresaDoGrupo(emp.id));
            }}
          >
            <span className={`h-2 w-2 rounded-full shrink-0 ${ac.dot}`} />
            <span className={`min-w-0 flex-1 truncate ${ac.text}`}>{label}</span>
          </button>
        );
      })}
    </>
  );

  return (
    <>
      <div className="relative flex items-center gap-1.5 min-w-0" ref={rootRef}>
        {btnAtualizar}
        {contextoFixo ? (
          <div
            className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm max-w-[min(100vw-8rem,320px)] sm:max-w-[360px] ${accent.border} ${accent.bg}`}
            title="Unidade fixa conforme suas permissões"
          >
            <span className={`h-2 w-2 rounded-full shrink-0 ${accent.dot}`} />
            <Building2 className="h-4 w-4 shrink-0 opacity-70" />
            <span className={`truncate font-medium min-w-0 ${accent.text}`}>{triggerLabel}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition shadow-sm max-w-[min(100vw-8rem,320px)] sm:max-w-[360px] ${accent.border} ${accent.bg}`}
            title="Unidade de trabalho — alterar recarrega os dados conforme o contexto"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                (!multiEmpresa && isTodasFiliais) || (multiEmpresa && visaoTodasEmpresasGrupo)
                  ? 'bg-gradient-to-r from-blue-500 via-emerald-500 to-orange-500'
                  : accent.dot
              }`}
            />
            <Building2 className="h-4 w-4 shrink-0 opacity-70" />
            <span className={`truncate font-medium min-w-0 ${accent.text}`}>{triggerLabel}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 opacity-60 transition ${open ? 'rotate-180' : ''}`} />
          </button>
        )}

        {open && !contextoFixo && (
          <div className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,300px)] max-h-[min(70vh,360px)] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {multiEmpresa ? (
              <>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  {marca}
                </div>
                {renderUnidadesGrupo()}
              </>
            ) : (
              <>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  {marca}
                </div>
                {renderFilialOptions()}
              </>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={confirmOpen} onClose={cancelConfirm} title="Trocar contexto?" size="sm">
        <p className="text-sm text-gray-700 leading-relaxed">
          Os dados das telas passarão a refletir <strong className="text-gray-900">{pendingLabel}</strong>. Deseja
          carregar agora?
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancelConfirm}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmApply}>
            Carregar dados
          </Button>
        </div>
      </Modal>
    </>
  );
};
