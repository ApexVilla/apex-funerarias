import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, CheckCircle2, Plus, Search } from 'lucide-react';
import { ordenarProdutosParaBusca, produtoCombinaBusca } from '../../lib/produtoEstoqueBusca';

export type ProdutoEstoqueOption = {
    id: string;
    codigo: string;
    nome: string;
    categoria?: string | null;
    codigo_barras?: string | null;
    marca?: string | null;
    estoque_atual?: number;
};

export type KitEstoqueOption = {
    id: string;
    nome: string;
    plano_nome?: string | null;
};

export type EstoqueItemSelection =
    | { tipo: 'produto'; id: string; produto: ProdutoEstoqueOption }
    | { tipo: 'kit'; id: string; kit: KitEstoqueOption };

type Props = {
    label?: string;
    produtos: ProdutoEstoqueOption[];
    value: string;
    onChange: (produtoId: string, produto?: ProdutoEstoqueOption) => void;
    /** Kits opcionais na mesma lista (ex.: saída de estoque). */
    kits?: KitEstoqueOption[];
    /** Indica se `value` é id de produto ou de kit. */
    itemTipo?: 'produto' | 'kit';
    onSelectItem?: (sel: EstoqueItemSelection | null) => void;
    placeholder?: string;
    disabled?: boolean;
    helperText?: string;
    onCadastrarNovo?: (termoBusca: string) => void;
    maxResultados?: number;
    priorizarComEstoque?: boolean;
    /** Busca no banco ao digitar (recomendado). */
    buscarRemoto?: (termo: string) => Promise<ProdutoEstoqueOption[]>;
};

function normalizarBusca(valor: string): string {
    return (valor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
}

function kitCombinaBusca(k: KitEstoqueOption, termo: string): boolean {
    const t = normalizarBusca(termo);
    if (!t) return true;
    if (normalizarBusca(k.nome).includes(t)) return true;
    if (k.plano_nome && normalizarBusca(k.plano_nome).includes(t)) return true;
    if (t.includes('kit')) return true;
    return false;
}

function rotuloKit(k: KitEstoqueOption): string {
    const plano = k.plano_nome ? ` (${k.plano_nome})` : '';
    return `KIT — ${k.nome}${plano}`;
}

function rotuloSecundario(p: ProdutoEstoqueOption): string {
    const extras = [
        p.codigo,
        p.categoria,
        p.codigo_barras ? `EAN ${p.codigo_barras}` : null,
        p.marca,
        p.estoque_atual != null ? `Saldo: ${p.estoque_atual}` : null,
    ].filter(Boolean);
    return extras.join(' · ');
}

function rotuloProduto(p: ProdutoEstoqueOption): string {
    return `${p.codigo} — ${p.nome}`;
}

export const ProdutoEstoqueSelect: React.FC<Props> = ({
    label,
    produtos,
    value,
    onChange,
    kits = [],
    itemTipo = 'produto',
    onSelectItem,
    placeholder,
    disabled = false,
    helperText,
    onCadastrarNovo,
    maxResultados = 150,
    priorizarComEstoque = false,
    buscarRemoto,
}) => {
    const comKits = kits.length > 0;
    const labelEfetivo = label ?? (comKits ? 'Produto ou kit' : 'Produto');
    const placeholderEfetivo =
        placeholder ??
        (comKits
            ? 'Digite produto, kit, código ou plano…'
            : 'Digite nome, código, categoria ou código de barras…');
    const [open, setOpen] = useState(false);
    const [texto, setTexto] = useState('');
    const [remotos, setRemotos] = useState<ProdutoEstoqueOption[]>([]);
    const [buscandoRemoto, setBuscandoRemoto] = useState(false);
    const [erroBusca, setErroBusca] = useState<string | null>(null);
    const [painelPos, setPainelPos] = useState({ top: 0, left: 0, width: 280 });
    const ref = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const digitandoRef = useRef(false);

    const kitSelecionado = useMemo(() => {
        if (itemTipo !== 'kit' || !value) return null;
        return kits.find((k) => k.id === value) ?? null;
    }, [kits, value, itemTipo]);

    const selecionado = useMemo(() => {
        if (itemTipo === 'kit') return null;
        const all = [...produtos, ...remotos];
        return all.find((p) => p.id === value) ?? null;
    }, [produtos, remotos, value, itemTipo]);

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
        if (kitSelecionado) {
            setTexto(rotuloKit(kitSelecionado));
        } else if (selecionado) {
            setTexto(rotuloProduto(selecionado));
        } else if (!open) {
            setTexto('');
        }
    }, [value, selecionado, kitSelecionado, open]);

    const catalogo = useMemo(() => {
        const map = new Map<string, ProdutoEstoqueOption>();
        for (const p of produtos) map.set(p.id, p);
        for (const p of remotos) map.set(p.id, p);
        return Array.from(map.values());
    }, [produtos, remotos]);

    const kitsFiltrados = useMemo(() => {
        const termo = texto.trim();
        const lista = termo ? kits.filter((k) => kitCombinaBusca(k, termo)) : kits;
        return lista.slice(0, Math.min(30, maxResultados));
    }, [kits, texto, maxResultados]);

    const filtrados = useMemo(() => {
        const termo = texto.trim();
        let lista: ProdutoEstoqueOption[];
        if (buscarRemoto && termo.length >= 1) {
            lista = catalogo.filter((p) => produtoCombinaBusca(p, termo));
        } else if (termo) {
            lista = catalogo.filter((p) => produtoCombinaBusca(p, termo));
        } else {
            lista = catalogo;
        }
        const limiteProdutos = comKits
            ? Math.max(20, maxResultados - kitsFiltrados.length)
            : maxResultados;
        return ordenarProdutosParaBusca(lista, texto, priorizarComEstoque).slice(0, limiteProdutos);
    }, [catalogo, texto, maxResultados, priorizarComEstoque, buscarRemoto, comKits, kitsFiltrados.length]);

    const totalFiltrados = useMemo(() => {
        const termo = texto.trim();
        if (!termo) return catalogo.length;
        return catalogo.filter((p) => produtoCombinaBusca(p, termo)).length;
    }, [catalogo, texto]);

    useEffect(() => {
        const termo = texto.trim();
        if (!buscarRemoto || !open || termo.length < 1) {
            if (!open) setRemotos([]);
            setBuscandoRemoto(false);
            setErroBusca(null);
            return;
        }

        let cancelado = false;
        setBuscandoRemoto(true);
        setErroBusca(null);

        const timer = setTimeout(() => {
            void buscarRemoto(termo)
                .then((rows) => {
                    if (!cancelado) setRemotos(rows);
                })
                .catch((e) => {
                    if (!cancelado) {
                        setRemotos([]);
                        setErroBusca(e instanceof Error ? e.message : 'Erro na busca');
                    }
                })
                .finally(() => {
                    if (!cancelado) setBuscandoRemoto(false);
                });
        }, 200);

        return () => {
            cancelado = true;
            clearTimeout(timer);
        };
    }, [texto, buscarRemoto, open]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (ref.current?.contains(target)) return;
            const portal = document.getElementById('produto-estoque-select-portal');
            if (portal?.contains(target)) return;
            setOpen(false);
            digitandoRef.current = false;
            if (kitSelecionado) setTexto(rotuloKit(kitSelecionado));
            else if (selecionado) setTexto(rotuloProduto(selecionado));
            else if (!value) setTexto('');
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [selecionado, kitSelecionado, value]);

    const selecionar = (p: ProdutoEstoqueOption) => {
        digitandoRef.current = false;
        onChange(p.id, p);
        onSelectItem?.({ tipo: 'produto', id: p.id, produto: p });
        setTexto(rotuloProduto(p));
        setOpen(false);
    };

    const selecionarKit = (k: KitEstoqueOption) => {
        digitandoRef.current = false;
        onChange('', undefined);
        onSelectItem?.({ tipo: 'kit', id: k.id, kit: k });
        setTexto(rotuloKit(k));
        setOpen(false);
    };

    const limparSelecao = () => {
        onChange('', undefined);
        onSelectItem?.(null);
        setTexto('');
        setRemotos([]);
        digitandoRef.current = true;
        inputRef.current?.focus();
    };

    const painelLista = open && !disabled && (
        <div
            id="produto-estoque-select-portal"
            role="listbox"
            className="fixed z-[9999] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
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
                    onClick={limparSelecao}
                    className="w-full border-b border-amber-100 px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50"
                >
                    Limpar seleção
                </button>
            )}
            <div className="max-h-72 overflow-y-auto">
                {buscandoRemoto && (
                    <p className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
                        Buscando produtos…
                    </p>
                )}
                {erroBusca && (
                    <p className="border-b border-red-100 px-3 py-2 text-xs text-red-600">{erroBusca}</p>
                )}
                {!buscandoRemoto && !erroBusca && filtrados.length === 0 && kitsFiltrados.length === 0 ? (
                    <div className="px-3 py-4 text-center">
                        {texto.trim() ? (
                            onCadastrarNovo ? (
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        onCadastrarNovo(texto.trim());
                                        setOpen(false);
                                    }}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition"
                                >
                                    <Plus className="h-4 w-4" />
                                    Cadastrar item
                                </button>
                            ) : (
                                <p className="text-sm text-gray-500">Nenhum produto encontrado.</p>
                            )
                        ) : (
                            <p className="text-sm text-gray-500">
                                {catalogo.length === 0
                                    ? 'Digite o nome ou código do item…'
                                    : 'Digite para filtrar ou escolha na lista.'}
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        {texto.trim() && totalFiltrados > maxResultados && (
                            <p className="border-b border-gray-100 px-3 py-2 text-[11px] text-gray-500">
                                {totalFiltrados} encontrados — exibindo {maxResultados}.
                            </p>
                        )}
                        {!texto.trim() && catalogo.length > maxResultados && (
                            <p className="border-b border-gray-100 px-3 py-2 text-[11px] text-gray-500">
                                Digite para filtrar ({catalogo.length} itens).
                            </p>
                        )}
                        <ul>
                            {kitsFiltrados.length > 0 && (
                                <>
                                    <li className="border-b border-violet-100 bg-violet-50/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                                        Kits
                                    </li>
                                    {kitsFiltrados.map((k) => {
                                        const ativo = itemTipo === 'kit' && k.id === value;
                                        return (
                                            <li key={`kit-${k.id}`}>
                                                <button
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => selecionarKit(k)}
                                                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-violet-50/60 ${ativo ? 'bg-violet-50' : ''}`}
                                                >
                                                    {ativo ? (
                                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                                                    ) : (
                                                        <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                                                    )}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium text-gray-900">
                                                            {k.nome}
                                                        </span>
                                                        <span className="block truncate text-[11px] text-gray-500">
                                                            Kit
                                                            {k.plano_nome ? ` · ${k.plano_nome}` : ''}
                                                            {' · baixa automática dos itens'}
                                                        </span>
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </>
                            )}
                            {filtrados.length > 0 && kitsFiltrados.length > 0 && (
                                <li className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                                    Produtos
                                </li>
                            )}
                            {filtrados.map((p) => {
                                const ativo = itemTipo !== 'kit' && p.id === value;
                                return (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => selecionar(p)}
                                            className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-50 ${ativo ? 'bg-blue-50' : ''}`}
                                        >
                                            {ativo ? (
                                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                            ) : (
                                                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-gray-300" />
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-gray-900">
                                                    {p.nome}
                                                </span>
                                                <span className="block truncate text-[11px] text-gray-500">
                                                    {rotuloSecundario(p)}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div ref={ref} className="relative w-full space-y-1.5">
            {labelEfetivo && (
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider ml-1">
                    {labelEfetivo}
                </label>
            )}
            <div
                className={`relative flex h-11 w-full items-center rounded-xl border border-gray-200 bg-gray-50/50 transition-all duration-200 hover:border-gray-300 focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent focus-within:bg-white ${open ? 'ring-2 ring-accent/20 border-accent bg-white' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    disabled={disabled}
                    value={texto}
                    placeholder={placeholderEfetivo}
                    autoComplete="off"
                    className="h-full w-full rounded-xl bg-transparent py-2 pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
                    onFocus={() => {
                        if (disabled) return;
                        digitandoRef.current = true;
                        setOpen(true);
                        if (!texto.trim() && catalogo.length > 0 && !buscarRemoto) {
                            /* lista local ao focar */
                        }
                    }}
                    onChange={(e) => {
                        const v = e.target.value;
                        digitandoRef.current = true;
                        setTexto(v);
                        setOpen(true);
                        if (!v.trim()) {
                            onChange('', undefined);
                            onSelectItem?.(null);
                            setRemotos([]);
                        } else if (kitSelecionado && rotuloKit(kitSelecionado) !== v) {
                            onChange('', undefined);
                            onSelectItem?.(null);
                        } else if (selecionado && rotuloProduto(selecionado) !== v) {
                            onChange('', undefined);
                            onSelectItem?.(null);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setOpen(false);
                            digitandoRef.current = false;
                            if (kitSelecionado) setTexto(rotuloKit(kitSelecionado));
                            else if (selecionado) setTexto(rotuloProduto(selecionado));
                        }
                    }}
                />
            </div>

            {typeof document !== 'undefined' && painelLista
                ? createPortal(painelLista, document.body)
                : null}

            {helperText && <p className="text-[11px] text-gray-400 ml-1">{helperText}</p>}
        </div>
    );
};
