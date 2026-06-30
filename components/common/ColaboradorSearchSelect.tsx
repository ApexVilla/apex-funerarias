import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import {
  labelRoleColaborador,
  type ColaboradorResumoDto,
} from '../../lib/comissaoAtendenteService';

function normalizarBusca(valor: string): string {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function colaboradorCombinaBusca(c: ColaboradorResumoDto, termo: string): boolean {
  const t = normalizarBusca(termo);
  if (!t) return true;
  if (normalizarBusca(c.nome).includes(t)) return true;
  if (normalizarBusca(c.email).includes(t)) return true;
  if (normalizarBusca(labelRoleColaborador(c.role)).includes(t)) return true;
  if (c.empresa_nome && normalizarBusca(c.empresa_nome).includes(t)) return true;
  return false;
}

function rotuloColaborador(c: ColaboradorResumoDto): string {
  const cargo = labelRoleColaborador(c.role);
  const unidade = c.empresa_nome ? ` · ${c.empresa_nome}` : '';
  return `${c.nome} (${cargo})${unidade}`;
}

type Props = {
  label?: string;
  value: string;
  onChange: (id: string, colaborador?: ColaboradorResumoDto) => void;
  colaboradores: ColaboradorResumoDto[];
  rolesPermitidos?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
  buscarRemoto?: (termo: string) => Promise<ColaboradorResumoDto[]>;
  maxResultados?: number;
};

export const ColaboradorSearchSelect: React.FC<Props> = ({
  label,
  value,
  onChange,
  colaboradores,
  rolesPermitidos,
  placeholder = 'Digite nome, e-mail ou unidade…',
  disabled = false,
  helperText,
  buscarRemoto,
  maxResultados = 50,
}) => {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [remotos, setRemotos] = useState<ColaboradorResumoDto[]>([]);
  const [buscandoRemoto, setBuscandoRemoto] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [painelPos, setPainelPos] = useState({ top: 0, left: 0, width: 280 });
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const digitandoRef = useRef(false);

  const poolBase = useMemo(() => {
    const map = new Map<string, ColaboradorResumoDto>();
    for (const c of colaboradores) map.set(c.id, c);
    for (const c of remotos) map.set(c.id, c);
    return Array.from(map.values());
  }, [colaboradores, remotos]);

  const poolFiltradoRoles = useMemo(() => {
    if (!rolesPermitidos?.length) return poolBase;
    const roles = new Set(rolesPermitidos.map((r) => r.toLowerCase()));
    return poolBase.filter((c) => roles.has((c.role || '').toLowerCase()));
  }, [poolBase, rolesPermitidos]);

  const selecionado = useMemo(
    () => poolBase.find((c) => c.id === value) ?? null,
    [poolBase, value],
  );

  const atualizarPosicaoPainel = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPainelPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 300),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    atualizarPosicaoPainel();
    const onScroll = () => atualizarPosicaoPainel();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, atualizarPosicaoPainel, texto]);

  useEffect(() => {
    if (digitandoRef.current) return;
    if (selecionado) {
      setTexto(rotuloColaborador(selecionado));
    } else if (!open) {
      setTexto('');
    }
  }, [value, selecionado, open]);

  const filtrados = useMemo(() => {
    const termo = texto.trim();
    let lista = poolFiltradoRoles;
    if (termo) {
      lista = lista.filter((c) => colaboradorCombinaBusca(c, termo));
    }
    return lista
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, maxResultados);
  }, [poolFiltradoRoles, texto, maxResultados]);

  useEffect(() => {
    const termo = texto.trim();
    if (!buscarRemoto || !open || termo.length < 2) {
      if (!open) setRemotos([]);
      setBuscandoRemoto(false);
      setErroBusca(null);
      return;
    }

    let cancelado = false;
    setBuscandoRemoto(true);
    setErroBusca(null);

    const timer = window.setTimeout(() => {
      void buscarRemoto(termo)
        .then((rows) => {
          if (cancelado) return;
          setRemotos(rows);
        })
        .catch(() => {
          if (!cancelado) setErroBusca('Erro ao buscar colaboradores.');
        })
        .finally(() => {
          if (!cancelado) setBuscandoRemoto(false);
        });
    }, 300);

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [texto, open, buscarRemoto]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      const portal = document.getElementById('colaborador-search-select-portal');
      if (portal?.contains(target)) return;
      setOpen(false);
      digitandoRef.current = false;
      if (selecionado) setTexto(rotuloColaborador(selecionado));
      else if (!value) setTexto('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selecionado, value]);

  const selecionar = (c: ColaboradorResumoDto) => {
    digitandoRef.current = false;
    onChange(c.id, c);
    setTexto(rotuloColaborador(c));
    setOpen(false);
  };

  const limpar = () => {
    onChange('', undefined);
    setTexto('');
    setRemotos([]);
    digitandoRef.current = true;
    inputRef.current?.focus();
  };

  const painelLista = open && !disabled && (
    <div
      id="colaborador-search-select-portal"
      role="listbox"
      className="fixed z-[9999] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      style={{
        top: painelPos.top,
        left: painelPos.left,
        width: painelPos.width,
      }}
    >
      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={limpar}
          className="w-full border-b border-amber-100 px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-400 dark:hover:bg-amber-950/30"
        >
          Limpar seleção
        </button>
      )}
      <div className="max-h-72 overflow-y-auto">
        {buscandoRemoto && (
          <p className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-slate-800 dark:text-slate-400">
            Buscando…
          </p>
        )}
        {erroBusca && (
          <p className="border-b border-red-100 px-3 py-2 text-xs text-red-600">{erroBusca}</p>
        )}
        {!buscandoRemoto && !erroBusca && filtrados.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-gray-500 dark:text-slate-400">
            {texto.trim() ? 'Nenhum colaborador encontrado.' : 'Digite para buscar ou escolha na lista.'}
          </p>
        ) : (
          filtrados.map((c) => {
            const ativo = c.id === value;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={ativo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selecionar(c)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-3 py-2.5 text-left transition last:border-0 hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                  ativo ? 'bg-blue-50/80 dark:bg-slate-800/80' : ''
                }`}
              >
                <span className="text-sm font-medium text-gray-900 dark:text-white">{c.nome}</span>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {labelRoleColaborador(c.role)}
                  {c.empresa_nome ? ` · ${c.empresa_nome}` : ''}
                  {c.email ? ` · ${c.email}` : ''}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className="w-full space-y-1.5">
      {label && (
        <label className="ml-1 block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
          {label}
        </label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={texto}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            digitandoRef.current = true;
          }}
          onChange={(e) => {
            digitandoRef.current = true;
            setTexto(e.target.value);
            setOpen(true);
            if (!e.target.value.trim() && value) {
              onChange('', undefined);
            }
          }}
          className="flex h-11 w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-10 pr-4 text-sm text-gray-900 transition-all duration-200 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
        />
      </div>
      {helperText && (
        <p className="ml-1 text-[11px] text-gray-400 dark:text-slate-500">{helperText}</p>
      )}
      {typeof document !== 'undefined' && createPortal(painelLista, document.body)}
    </div>
  );
};
