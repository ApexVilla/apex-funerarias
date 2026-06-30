import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

export type OpcaoSearchItem = {
  value: string;
  label: string;
};

function normalizarBusca(valor: string): string {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function opcaoCombinaBusca(opcao: OpcaoSearchItem, termo: string): boolean {
  const t = normalizarBusca(termo);
  if (!t) return true;
  if (normalizarBusca(opcao.label).includes(t)) return true;
  if (normalizarBusca(opcao.value).replace(/_/g, ' ').includes(t)) return true;
  return false;
}

type Props = {
  label?: string;
  value: string;
  onChange: (valor: string, opcao?: OpcaoSearchItem) => void;
  opcoes: OpcaoSearchItem[];
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
  allowCustom?: boolean;
  customLabel?: (termo: string) => string;
  /** O que gravar ao escolher uma opção da lista (padrão: label). */
  persistir?: 'value' | 'label';
  resolveDisplay?: (valorSalvo: string) => string;
  maxResultados?: number;
  portalId?: string;
};

export const OpcaoSearchSelect: React.FC<Props> = ({
  label,
  value,
  onChange,
  opcoes,
  placeholder = 'Digite para buscar…',
  disabled = false,
  helperText,
  allowCustom = false,
  customLabel = (termo) => `Usar «${termo}»`,
  persistir = 'label',
  resolveDisplay,
  maxResultados = 50,
  portalId = 'opcao-search-select-portal',
}) => {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [painelPos, setPainelPos] = useState({ top: 0, left: 0, width: 280 });
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const digitandoRef = useRef(false);

  const textoExibicao = useCallback(
    (val: string) => (resolveDisplay ? resolveDisplay(val) : val),
    [resolveDisplay],
  );

  const selecionado = useMemo(() => {
    if (!value) return null;
    const v = value.trim();
    return (
      opcoes.find((o) => o.value === v) ||
      opcoes.find((o) => o.label.toLowerCase() === v.toLowerCase()) ||
      null
    );
  }, [opcoes, value]);

  const atualizarPosicaoPainel = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPainelPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 280),
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
    if (value) {
      setTexto(textoExibicao(value));
    } else if (!open) {
      setTexto('');
    }
  }, [value, open, textoExibicao]);

  const filtrados = useMemo(() => {
    const termo = texto.trim();
    let lista = opcoes;
    if (termo) {
      lista = lista.filter((o) => opcaoCombinaBusca(o, termo));
    }
    return lista.slice(0, maxResultados);
  }, [opcoes, texto, maxResultados]);

  const termoCustom = texto.trim();
  const mostrarCustom =
    allowCustom &&
    termoCustom.length > 0 &&
    !filtrados.some(
      (o) =>
        o.label.toLowerCase() === termoCustom.toLowerCase() ||
        o.value.toLowerCase() === termoCustom.toLowerCase(),
    );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      const portal = document.getElementById(portalId);
      if (portal?.contains(target)) return;
      setOpen(false);
      digitandoRef.current = false;
      if (value) setTexto(textoExibicao(value));
      else setTexto('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, portalId, textoExibicao]);

  const selecionar = (opcao: OpcaoSearchItem, valorPersistido?: string) => {
    digitandoRef.current = false;
    const persistido = valorPersistido ?? (persistir === 'value' ? opcao.value : opcao.label);
    onChange(persistido, opcao);
    setTexto(opcao.label);
    setOpen(false);
  };

  const selecionarCustom = () => {
    if (!termoCustom) return;
    digitandoRef.current = false;
    onChange(termoCustom);
    setTexto(termoCustom);
    setOpen(false);
  };

  const limpar = () => {
    onChange('');
    setTexto('');
    digitandoRef.current = true;
    inputRef.current?.focus();
  };

  const painelLista = open && !disabled && (
    <div
      id={portalId}
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
        {mostrarCustom && (
          <button
            type="button"
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={selecionarCustom}
            className="flex w-full flex-col items-start border-b border-emerald-100 px-3 py-2.5 text-left transition hover:bg-emerald-50 dark:border-emerald-900/30 dark:hover:bg-emerald-950/20"
          >
            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              {customLabel(termoCustom)}
            </span>
            <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Texto personalizado</span>
          </button>
        )}
        {filtrados.length === 0 && !mostrarCustom ? (
          <p className="px-3 py-4 text-center text-sm text-gray-500 dark:text-slate-400">
            {texto.trim() ? 'Nenhuma opção encontrada.' : 'Digite para buscar ou escolha na lista.'}
          </p>
        ) : (
          filtrados.map((o) => {
            const ativo =
              value === o.value ||
              value.toLowerCase() === o.label.toLowerCase() ||
              selecionado?.value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={ativo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selecionar(o)}
                className={`flex w-full items-center border-b border-gray-50 px-3 py-2.5 text-left text-sm transition last:border-0 hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                  ativo ? 'bg-blue-50/80 font-medium text-blue-900 dark:bg-slate-800/80 dark:text-blue-100' : 'text-gray-900 dark:text-white'
                }`}
              >
                {o.label}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && allowCustom && termoCustom && mostrarCustom) {
              e.preventDefault();
              selecionarCustom();
            }
          }}
          onChange={(e) => {
            digitandoRef.current = true;
            setTexto(e.target.value);
            setOpen(true);
            if (!e.target.value.trim() && value) {
              onChange('');
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
