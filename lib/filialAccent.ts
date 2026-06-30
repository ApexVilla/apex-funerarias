/** Remove acentos para comparar nome da filial (ex.: Catalão / Catalao). */
function nomeFilialNormalizado(nome: string): string {
  return (nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Cores de destaque por unidade — reconhece nomes típicos da rede (Catalão, Aparecida, Ipameri, Matriz, etc.). */
export function filialAccentClasses(nome: string): {
  label: string;
  border: string;
  bg: string;
  text: string;
  dot: string;
} {
  const n = nomeFilialNormalizado(nome);
  if (n.includes('catal')) {
    return {
      label: 'Catalão',
      border: 'border-blue-500',
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      dot: 'bg-blue-500',
    };
  }
  if (n.includes('aparecida')) {
    return {
      label: 'Aparecida',
      border: 'border-emerald-500',
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      dot: 'bg-emerald-500',
    };
  }
  if (n.includes('ipameri')) {
    return {
      label: 'Ipameri',
      border: 'border-orange-500',
      bg: 'bg-orange-50',
      text: 'text-orange-800',
      dot: 'bg-orange-500',
    };
  }
  if (n.includes('matriz') || n.includes('sede') || n.includes('central')) {
    return {
      label: nome.trim() || 'Matriz',
      border: 'border-violet-500',
      bg: 'bg-violet-50',
      text: 'text-violet-900',
      dot: 'bg-violet-500',
    };
  }
  return {
    label: nome.trim() || 'Filial',
    border: 'border-slate-400',
    bg: 'bg-slate-50',
    text: 'text-slate-800',
    dot: 'bg-slate-400',
  };
}
