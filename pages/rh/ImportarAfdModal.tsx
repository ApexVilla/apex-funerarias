import React, { useState, useRef, useMemo } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button, Badge } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { type TipoBatida, chaveDiaPontoUsuario, intervaloDiaLocal, diaLocalFromTimestamp } from '../../lib/pontoUtils';
import {
  AFD_ANO_MINIMO_IMPORTACAO,
  colaboradorElegivelFolhaPonto,
  marcacoesAfdDentroDoAnoMinimo,
  mapearTiposBatidaImportacaoRelogio,
  normalizarBatidasAfdDia,
} from '../../lib/pontoRules';
import {
  FileText,
  Upload,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  X,
  AlertCircle,
  Users,
  Settings,
  HelpCircle,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  colaboradores: any[];
  empresaIdOperacao: string;
}

interface AfdPunch {
  pis: string;
  dataStr: string; // YYYY-MM-DD
  horaStr: string; // HH:MM
}

interface ImportItem {
  userId: string;
  nome: string;
  role: string;
  empresaId: string;
  dates: Record<string, string[]>; // { [date]: ['08:00', '12:00'] }
}

interface AfdEmployeeRow {
  pis: string;
  nomeRelogio: string;
  defaultUserId: string; // Resolvido por PIS no banco ou Nome do arquivo
  initialMatchType: 'db' | 'name' | 'none';
}

export const ImportarAfdModal: React.FC<Props> = ({
  open,
  onClose,
  onImported,
  colaboradores,
  empresaIdOperacao,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Só quem bate ponto pode ser vinculado ao relógio físico (AFD). */
  const colaboradoresElegiveis = useMemo(
    () =>
      colaboradores.filter((c) =>
        colaboradorElegivelFolhaPonto({
          ativo: c.ativo,
          deleted_at: c.deleted_at,
          role: c.role,
          permissoes: c.permissoes as Record<string, unknown> | null | undefined,
        }),
      ),
    [colaboradores],
  );

  const idsElegiveis = useMemo(
    () => new Set(colaboradoresElegiveis.map((c) => c.id)),
    [colaboradoresElegiveis],
  );

  // Estados de Fluxo
  const [step, setStep] = useState<'upload' | 'confirm' | 'importing' | 'success'>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedPunches, setParsedPunches] = useState<AfdPunch[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  // Estado unificado de mapeamento (cleanPis -> userId do sistema, vazio = não importar)
  const [databasePisMap, setDatabasePisMap] = useState<Map<string, string>>(new Map()); // PIS limpo -> userId do banco
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({}); // PIS limpo -> userId selecionado
  const [afdEmployees, setAfdEmployees] = useState<AfdEmployeeRow[]>([]); // Lista de funcionários detectados no arquivo
  const [filterType, setFilterType] = useState<'all' | 'linked' | 'unlinked'>('all');
  /** Dias que já possuem batida no banco — não serão sobrescritos na reimportação. */
  const [diasJaPreenchidos, setDiasJaPreenchidos] = useState<Set<string>>(new Set());
  const [marcacoesIgnoradasAno, setMarcacoesIgnoradasAno] = useState(0);

  // Stats
  const [totalImportedDays, setTotalImportedDays] = useState(0);
  const [totalSkippedDays, setTotalSkippedDays] = useState(0);
  const [totalSavedPis, setTotalSavedPis] = useState(0);

  const resetState = () => {
    setStep('upload');
    setFileName('');
    setParsedPunches([]);
    setDatabasePisMap(new Map());
    setManualMappings({});
    setAfdEmployees([]);
    setDiasJaPreenchidos(new Set());
    setMarcacoesIgnoradasAno(0);
    setProgress(0);
    setLoading(false);
    setFilterType('all');
    setTotalImportedDays(0);
    setTotalSkippedDays(0);
    setTotalSavedPis(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const { punches, nameMap, ignoradasAno } = parseAfdTextAndNames(text);
        setMarcacoesIgnoradasAno(ignoradasAno);
        if (punches.length === 0) {
          const msgAno =
            ignoradasAno > 0
              ? ` Nenhuma marcação de ${AFD_ANO_MINIMO_IMPORTACAO} em diante foi encontrada (${ignoradasAno} de anos anteriores ignoradas).`
              : '';
          showToast(`Nenhum registro de ponto do tipo 3 (marcação) foi encontrado no arquivo.${msgAno}`, 'error');
          resetState();
          return;
        }

        setParsedPunches(punches);
        await analyzePunches(punches, nameMap);
      } catch (err) {
        console.error('Erro ao processar arquivo', err);
        showToast('Erro ao ler o arquivo. Verifique o formato.', 'error');
        resetState();
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // Parser do padrão AFD
  const parseAfdTextAndNames = (text: string) => {
    const lines = text.split(/\r?\n/);
    const punches: AfdPunch[] = [];
    const nameMap = new Map<string, string>();
    let ignoradasAno = 0;

    for (const line of lines) {
      if (line.length < 33) continue;

      const tipo = line.substring(9, 10);

      // Tipo 3: Marcação de Ponto
      if (tipo === '3') {
        const dd = line.substring(10, 12);
        const mm = line.substring(12, 14);
        const yyyy = line.substring(14, 18);

        if (!marcacoesAfdDentroDoAnoMinimo(yyyy)) {
          ignoradasAno++;
          continue;
        }

        const dataStr = `${yyyy}-${mm}-${dd}`;

        const hh = line.substring(18, 20);
        const min = line.substring(20, 22);
        const horaStr = `${hh}:${min}`;

        const pis = line.substring(22, 33).trim();

        if (
          /^\d{4}-\d{2}-\d{2}$/.test(dataStr) &&
          /^\d{2}:\d{2}$/.test(horaStr) &&
          pis.length > 0
        ) {
          punches.push({
            pis: pis.replace(/\D/g, ''),
            dataStr,
            horaStr,
          });
        }
      }

      // Tipo 5: Cadastro de Empregado
      if (tipo === '5') {
        const pis = line.substring(23, 34).trim();
        const nome = line.substring(34, 184).trim();
        if (pis && nome) {
          nameMap.set(pis.replace(/\D/g, ''), nome);
        }
      }
    }

    return { punches, nameMap, ignoradasAno };
  };

  // Normalização de nomes
  const normalizeName = (name: string): string => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Associar PIS aos colaboradores
  const analyzePunches = async (punches: AfdPunch[], nameMap: Map<string, string>) => {
    try {
      // 1. Carregar os PIS dos colaboradores cadastrados na empresa
      const idsConsulta = colaboradoresElegiveis.map((c) => c.id);
      const { data: rhDetails, error } = idsConsulta.length
        ? await supabase
            .from('rh_colaborador_detalhes')
            .select('usuario_id, pis')
            .in('usuario_id', idsConsulta)
        : { data: [], error: null };

      if (error) throw error;

      // Mapear PIS limpo -> usuario_id (apenas colaboradores que batem ponto)
      const dbMap = new Map<string, string>();
      rhDetails?.forEach((item) => {
        if (item.pis && idsElegiveis.has(item.usuario_id)) {
          const clean = item.pis.replace(/\D/g, '');
          if (clean) dbMap.set(clean, item.usuario_id);
        }
      });
      setDatabasePisMap(dbMap);

      // Mapear nome normalizado -> colaborador elegível
      const colabsByName = new Map<string, any>();
      colaboradoresElegiveis.forEach((c) => {
        if (c.nome) {
          colabsByName.set(normalizeName(c.nome), c);
        }
      });

      // Rastrear PIS únicos
      const uniquePis = Array.from(new Set(punches.map((p) => p.pis)));
      const initialMappings: Record<string, string> = {};
      const detectedEmployees: AfdEmployeeRow[] = [];

      uniquePis.forEach((pis) => {
        const dbUserId = dbMap.get(pis);
        const nameInFile = nameMap.get(pis) || '';

        if (dbUserId && idsElegiveis.has(dbUserId)) {
          // 1. Achou direto pelo PIS no banco
          detectedEmployees.push({
            pis,
            nomeRelogio: nameInFile || 'Funcionário com PIS cadastrado',
            defaultUserId: dbUserId,
            initialMatchType: 'db',
          });
          initialMappings[pis] = dbUserId;
        } else {
          // 2. Tenta pareamento automático por nome
          const normFile = normalizeName(nameInFile);
          const matchedColab = normFile ? colabsByName.get(normFile) : null;

          if (matchedColab) {
            detectedEmployees.push({
              pis,
              nomeRelogio: nameInFile,
              defaultUserId: matchedColab.id,
              initialMatchType: 'name',
            });
            initialMappings[pis] = matchedColab.id;
          } else {
            // 3. Sem correspondência inicial
            detectedEmployees.push({
              pis,
              nomeRelogio: nameInFile || 'Nome não informado no arquivo',
              defaultUserId: '',
              initialMatchType: 'none',
            });
            initialMappings[pis] = '';
          }
        }
      });

      setAfdEmployees(detectedEmployees);
      setManualMappings(initialMappings);
      await carregarDiasJaPreenchidosNoBanco(punches, initialMappings);
      setStep('confirm');
    } catch (e) {
      console.error(e);
      showToast('Erro ao analisar batidas do arquivo.', 'error');
      resetState();
    }
  };

  /** Consulta quais dias (user + data) já têm batida gravada — evita reimportar o mesmo arquivo inteiro. */
  const carregarDiasJaPreenchidosNoBanco = async (
    punches: AfdPunch[],
    mappings: Record<string, string>,
  ) => {
    const userIds = Array.from(
      new Set(Object.values(mappings).filter((id) => id && idsElegiveis.has(id))),
    );
    if (!userIds.length || !punches.length) {
      setDiasJaPreenchidos(new Set());
      return;
    }

    const datas = Array.from(new Set(punches.map((p) => p.dataStr))).sort();
    const { inicio } = intervaloDiaLocal(datas[0]);
    const { fim } = intervaloDiaLocal(datas[datas.length - 1]);

    const { data, error } = await supabase
      .from('ponto_registros')
      .select('user_id, timestamp')
      .in('user_id', userIds)
      .gte('timestamp', inicio)
      .lte('timestamp', fim);

    if (error) throw error;

    const preenchidos = new Set<string>();
    data?.forEach((row) => {
      const dia = diaLocalFromTimestamp(row.timestamp);
      if (dia) preenchidos.add(chaveDiaPontoUsuario(row.user_id, dia));
    });
    setDiasJaPreenchidos(preenchidos);
  };

  const diaJaPreenchidoNoBanco = (userId: string, dataStr: string) =>
    diasJaPreenchidos.has(chaveDiaPontoUsuario(userId, dataStr));

  // Lista consolidada de colaboradores a importar baseada nos mapeamentos ativos
  const { itemsToImport, diasIgnoradosJaPreenchidos } = useMemo(() => {
    const colabGroups: Record<string, Record<string, string[]>> = {};
    const diasIgnorados = new Set<string>();

    parsedPunches.forEach((p) => {
      const userId = manualMappings[p.pis];
      if (!userId) return;

      if (diaJaPreenchidoNoBanco(userId, p.dataStr)) {
        diasIgnorados.add(chaveDiaPontoUsuario(userId, p.dataStr));
        return;
      }

      if (!colabGroups[userId]) {
        colabGroups[userId] = {};
      }
      if (!colabGroups[userId][p.dataStr]) {
        colabGroups[userId][p.dataStr] = [];
      }

      if (!colabGroups[userId][p.dataStr].includes(p.horaStr)) {
        colabGroups[userId][p.dataStr].push(p.horaStr);
      }
    });

    const list: ImportItem[] = [];
    Object.entries(colabGroups).forEach(([userId, datesObj]) => {
      if (!idsElegiveis.has(userId)) return;

      const colabInfo = colaboradoresElegiveis.find((c) => c.id === userId);
      if (colabInfo) {
        list.push({
          userId,
          nome: colabInfo.nome,
          role: colabInfo.role || 'atendente',
          empresaId: colabInfo.empresa_id || empresaIdOperacao,
          dates: datesObj,
        });
      }
    });

    return { itemsToImport: list, diasIgnoradosJaPreenchidos: diasIgnorados.size };
  }, [
    parsedPunches,
    manualMappings,
    colaboradoresElegiveis,
    empresaIdOperacao,
    idsElegiveis,
    diasJaPreenchidos,
  ]);

  // Contagem dinâmica de pessoas mapeadas e não mapeadas
  const stats = useMemo(() => {
    let mapeados = 0;
    let ignorados = 0;
    let novosVinculos = 0;

    Object.entries(manualMappings).forEach(([pis, userId]) => {
      if (userId) {
        mapeados++;
        // Se a associação no modal for diferente de quem está cadastrado no banco, é um novo vínculo a salvar
        if (databasePisMap.get(pis) !== userId) {
          novosVinculos++;
        }
      } else {
        ignorados++;
      }
    });

    return { mapeados, ignorados, novosVinculos };
  }, [manualMappings, databasePisMap]);

  const filteredAfdEmployees = useMemo(() => {
    return afdEmployees.filter((item) => {
      const selectedUserId = manualMappings[item.pis];
      const isLinked = !!selectedUserId;
      if (filterType === 'linked') return isLinked;
      if (filterType === 'unlinked') return !isLinked;
      return true;
    });
  }, [afdEmployees, manualMappings, filterType]);

  // Executar a importação
  const handleImport = async () => {
    setStep('importing');
    setProgress(0);

    let totalDays = 0;
    itemsToImport.forEach((item) => {
      totalDays += Object.keys(item.dates).length;
    });

    // Reunir novos números de PIS a gravar de forma definitiva (Save Forever)
    const pisToSave: [string, string][] = [];
    Object.entries(manualMappings).forEach(([pis, userId]) => {
      if (userId && databasePisMap.get(pis) !== userId) {
        pisToSave.push([pis, userId]);
      }
    });

    const totalSteps = totalDays + pisToSave.length;
    if (totalSteps === 0) {
      setTotalSkippedDays(diasIgnoradosJaPreenchidos);
      setStep('success');
      return;
    }

    let processedSteps = 0;

    try {
      // 1. Gravar novas relações de PIS-Colaborador definitivamente no banco (Save Forever)
      if (pisToSave.length > 0) {
        for (const [pisVal, userId] of pisToSave) {
          if (!idsElegiveis.has(userId)) continue;

          const colabInfo = colaboradoresElegiveis.find((c) => c.id === userId);
          if (colabInfo) {
            await supabase
              .from('rh_colaborador_detalhes')
              .upsert({
                usuario_id: userId,
                pis: pisVal,
                empresa_id: colabInfo.empresa_id || empresaIdOperacao,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'usuario_id' });
          }
          processedSteps++;
          setProgress(Math.round((processedSteps / totalSteps) * 100));
        }
      }

      let processedDays = 0;

      // 2. Loop por colaborador para gravar os pontos
      for (const item of itemsToImport) {
        for (const [date, times] of Object.entries(item.dates)) {
          // Limpar ponto existente daquele dia
          const { inicio, fim } = intervaloDiaLocal(date);
          const { error: delError } = await supabase
            .from('ponto_registros')
            .delete()
            .eq('user_id', item.userId)
            .gte('timestamp', inicio)
            .lte('timestamp', fim);

          if (delError) throw delError;

          // Inserir as novas batidas
          const sortedTimes = [...times].sort();
          const types = mapearTiposBatidaImportacaoRelogio(sortedTimes.length, sortedTimes);
          const rascunho = sortedTimes.map((time, idx) => ({
            id: String(idx),
            tipo: types[idx] || 'saida',
            timestamp: new Date(`${date}T${time}:00`).toISOString(),
            origem: 'afd' as const,
          }));
          const batidasNormalizadas = normalizarBatidasAfdDia(rascunho);
          const recordsToInsert = batidasNormalizadas.map((batida) => ({
            empresa_id: item.empresaId,
            user_id: item.userId,
            tipo: batida.tipo,
            timestamp: batida.timestamp,
            origem: 'afd' as const,
            observacao: 'Importado de relógio de ponto (AFD)',
          }));

          if (recordsToInsert.length > 0) {
            const { error: insError } = await supabase
              .from('ponto_registros')
              .insert(recordsToInsert);

            if (insError) throw insError;
          }

          processedDays++;
          processedSteps++;
          setProgress(Math.round((processedSteps / totalSteps) * 100));
        }
      }

      setTotalImportedDays(processedDays);
      setTotalSkippedDays(diasIgnoradosJaPreenchidos);
      setTotalSavedPis(pisToSave.length);
      setStep('success');
      onImported();
    } catch (e) {
      console.error(e);
      showToast('Ocorreu um erro durante a gravação dos registros no banco.', 'error');
      setStep('confirm');
    }
  };

  const handleManualMapChange = (pis: string, userId: string) => {
    setManualMappings((prev) => ({
      ...prev,
      [pis]: userId,
    }));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith('.txt') || file.name.endsWith('.afd')) {
        processFile(file);
      } else {
        showToast('Por favor, selecione um arquivo de texto (.txt ou .afd).', 'error');
      }
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={step === 'importing' ? () => {} : onClose}
      title="Importar Arquivo AFD (Ponto Eletrônico)"
      size="xl"
    >
      {/* PASSO 1: UPLOAD */}
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Carregue o arquivo <strong>AFD (Arquivo de Fonte de Dados)</strong> exportado do seu relógio de ponto físico.
            O sistema importa apenas marcações de <strong>{AFD_ANO_MINIMO_IMPORTACAO} em diante</strong>, ignora dias já
            preenchidos e identifica colaboradores pelo PIS ou pelo nome.
          </p>

          <div
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 hover:border-indigo-400 dark:border-slate-800 dark:hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer bg-slate-50/50 hover:bg-indigo-50/10 transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".txt,.afd"
              className="hidden"
            />
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  Lendo e decodificando arquivo...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-9 w-9 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Arraste o arquivo AFD ou clique para selecionar
                </span>
                <span className="text-xs text-slate-400">
                  Suporta arquivos .txt ou .afd (padrão MTE)
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="w-full">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* PASSO 2: CONFIRMAR IMPORTAÇÃO & DIRETÓRIO DE VÍNCULOS */}
      {step === 'confirm' && (
        <div className="space-y-4 max-h-[82vh] overflow-y-auto pr-1">
          <div className="flex items-center gap-2 text-indigo-650 bg-indigo-50 border border-indigo-150 rounded-xl p-3 dark:bg-indigo-950/20 dark:border-indigo-900/30">
            <AlertCircle className="w-5 h-5 shrink-0 text-indigo-500" />
            <div className="text-xs font-semibold space-y-1">
              <div>
                Arquivo: <span className="font-mono">{fileName}</span> ({parsedPunches.length} marcações de{' '}
                {AFD_ANO_MINIMO_IMPORTACAO}+ encontradas).
              </div>
              {marcacoesIgnoradasAno > 0 && (
                <div className="text-amber-700 dark:text-amber-400 font-normal">
                  {marcacoesIgnoradasAno} marcação(ões) de anos anteriores a {AFD_ANO_MINIMO_IMPORTACAO} foram
                  ignoradas.
                </div>
              )}
              {diasIgnoradosJaPreenchidos > 0 && (
                <div className="text-emerald-700 dark:text-emerald-400 font-normal">
                  {diasIgnoradosJaPreenchidos} dia(s) já preenchido(s) no sistema serão mantidos (não reimportados).
                </div>
              )}
            </div>
          </div>

          {/* Resumo da Associação */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Resumo do Pareamento do Arquivo
            </span>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 dark:bg-slate-800/40 dark:border-slate-800/60">
                <Users className="w-4 h-4 mx-auto text-indigo-550 mb-1" />
                <span className="text-[10px] text-slate-400 font-bold block leading-tight">Mapeados para Importação</span>
                <span className="font-black text-slate-800 text-lg mt-0.5 block dark:text-white">
                  {stats.mapeados}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 dark:bg-slate-800/40 dark:border-slate-800/60">
                <CheckCircle className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
                <span className="text-[10px] text-slate-400 font-bold block leading-tight">Novos Vínculos de PIS</span>
                <span className="font-black text-slate-800 text-lg mt-0.5 block dark:text-white">
                  {stats.novosVinculos}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 dark:bg-slate-800/40 dark:border-slate-800/60">
                <AlertTriangle className="w-4 h-4 mx-auto text-amber-500 mb-1" />
                <span className="text-[10px] text-slate-400 font-bold block leading-tight">Não Vinculados (Ignorados)</span>
                <span className="font-black text-slate-800 text-lg mt-0.5 block dark:text-white">
                  {stats.ignorados}
                </span>
              </div>
            </div>
          </div>

          {/* LISTAGEM UNIFICADA DE PAREAMENTO (DIRETÓRIO COMPLETO DO RELÓGIO) */}
          <div className="space-y-2 border border-slate-200 dark:border-slate-850 rounded-xl p-4 bg-slate-50/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Settings className="w-4 h-4 text-indigo-500 animate-spin-slow" />
              Diretório de Vínculos de Funcionários (AFD):
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">
              Abaixo estão todos os funcionários encontrados no arquivo. Você pode alterar a vinculação de qualquer um deles ou selecionar **"-- Não Importar (Ignorar) --"** para excluir as marcações deles desta importação.
            </p>

            {/* Abas de Filtros de Vinculação */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex gap-1.5 font-bold">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${
                    filterType === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-450 dark:hover:bg-slate-750'
                  }`}
                >
                  Todos ({afdEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('linked')}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${
                    filterType === 'linked'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-450 dark:hover:bg-slate-750'
                  }`}
                >
                  Vinculados ({stats.mapeados})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('unlinked')}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${
                    filterType === 'unlinked'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-450 dark:hover:bg-slate-750'
                  }`}
                >
                  Não Vinculados ({stats.ignorados})
                </button>
              </div>

              {stats.ignorados > 0 && filterType === 'unlinked' && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold bg-amber-50 dark:bg-amber-955/20 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/30 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Estes não serão importados</span>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 mt-3">
              {filteredAfdEmployees.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold bg-white dark:bg-slate-900 border border-dashed rounded-xl">
                  Nenhum funcionário encontrado neste filtro.
                </div>
              ) : (
                filteredAfdEmployees.map((item) => {
                  const selectedUserId = manualMappings[item.pis];
                  const isIgnored = !selectedUserId;
                  const dbMatch = databasePisMap.get(item.pis) === selectedUserId && selectedUserId !== '';
                  const autoMatch = item.initialMatchType === 'name' && selectedUserId === item.defaultUserId && selectedUserId !== '';
                  const manualMatch = selectedUserId !== '' && !dbMatch && !autoMatch;

                  let originBadge = null;
                  if (isIgnored) {
                    originBadge = <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-slate-100 border-slate-200 text-slate-400">Não Vinculado (Ignorado)</Badge>;
                  } else if (dbMatch) {
                    originBadge = <Badge variant="success" className="text-[9px] px-1.5 py-0 bg-green-50 border-green-200 text-green-700">PIS Cadastrado</Badge>;
                  } else if (autoMatch) {
                    originBadge = <Badge variant="info" className="text-[9px] px-1.5 py-0 bg-emerald-50 border-emerald-250 text-emerald-700">Nome Pareado</Badge>;
                  } else if (manualMatch) {
                    originBadge = <Badge variant="warning" className="text-[9px] px-1.5 py-0 bg-blue-50 border-blue-200 text-blue-700">Vinculado Manual</Badge>;
                  }

                  return (
                    <div
                      key={item.pis}
                      className={`p-2.5 rounded-lg border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${
                        isIgnored
                          ? 'border-slate-200 bg-white/40 opacity-75 dark:border-slate-800'
                          : 'border-indigo-150 bg-white dark:border-slate-800 dark:bg-slate-950 shadow-sm'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-850 dark:text-white truncate">
                            {item.nomeRelogio || 'Nome não identificado'}
                          </span>
                          {originBadge}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">PIS: {item.pis}</div>
                      </div>

                      <div className="w-full md:w-72 shrink-0">
                        <select
                          value={selectedUserId || ''}
                          onChange={(e) => handleManualMapChange(item.pis, e.target.value)}
                          className={`w-full text-xs border rounded px-2.5 py-1 outline-none font-bold ${
                            isIgnored
                              ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 text-slate-400'
                              : 'border-indigo-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-indigo-700 dark:text-indigo-400'
                          }`}
                        >
                          <option value="">-- Não Importar (Ignorar) --</option>
                          {colaboradoresElegiveis.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* LISTA RESUMIDA DA FILA DE IMPORTAÇÃO */}
          {itemsToImport.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-450 block">Pessoas incluídas na importação ({itemsToImport.length}):</span>
              <div className="max-h-[100px] overflow-y-auto border border-slate-150 dark:border-slate-850 rounded-lg p-2 bg-white dark:bg-slate-950 divide-y divide-slate-100 dark:divide-slate-850 text-xs">
                {itemsToImport.map((item) => {
                  const diasNovos = Object.keys(item.dates).length;
                  return (
                    <div key={item.userId} className="py-1.5 flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-white">{item.nome}</span>
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border px-1.5 py-0.5 rounded">
                        {diasNovos} dia(s) novo(s)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-500 leading-normal font-semibold">
            * Importação incremental: dias que já possuem batida no sistema são ignorados. Apenas dias vazios serão
            preenchidos com os horários do AFD (com classificação automática de intervalo/almoço).
          </p>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={resetState}>
              Limpar / Novo Arquivo
            </Button>
            <Button
              className="flex-1 bg-indigo-650 hover:bg-indigo-750 text-white"
              onClick={handleImport}
              disabled={itemsToImport.length === 0 && stats.novosVinculos === 0}
            >
              Confirmar Importação
            </Button>
          </div>
        </div>
      )}

      {/* PASSO 3: IMPORTANDO */}
      {step === 'importing' && (
        <div className="space-y-6 py-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin" />
            <h3 className="text-base font-bold text-slate-800 dark:text-white">
              Importando batidas de ponto...
            </h3>
            <p className="text-xs text-slate-400">
              Sincronizando novas relações de PIS e gravando ponto eletrônico...
            </p>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 max-w-xs mx-auto">
            <div
              className="bg-indigo-600 h-3 rounded-full transition-all duration-350"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold text-slate-650 dark:text-slate-400 block">
            {progress}% concluído
          </span>
        </div>
      )}

      {/* PASSO 4: SUCESSO */}
      {step === 'success' && (
        <div className="space-y-5 text-center py-4">
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="h-14 w-14 text-emerald-500 animate-[bounce_0.5s_ease-out]" />
            <h3 className="text-lg font-black text-slate-800 dark:text-white">
              Importação Concluída!
            </h3>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              O arquivo AFD foi processado. As novas relações de PIS-Colaborador foram salvas de forma permanente e os pontos foram importados para o banco de dados.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-800/60 rounded-xl p-4 max-w-xs mx-auto text-xs text-slate-600 dark:text-slate-400 space-y-1.5 text-left">
            <div>
              Total de Colaboradores Atualizados:{' '}
              <strong className="font-bold text-slate-800 dark:text-white">{itemsToImport.length}</strong>
            </div>
            {totalSavedPis > 0 && (
              <div className="text-emerald-700 dark:text-emerald-450 font-semibold">
                Relações de PIS salvas de forma permanente: <strong className="font-extrabold">{totalSavedPis}</strong>
              </div>
            )}
            <div>
              Total de Dias Gravados:{' '}
              <strong className="font-bold text-slate-800 dark:text-white">{totalImportedDays}</strong>
            </div>
            {totalSkippedDays > 0 && (
              <div className="text-slate-500">
                Dias já preenchidos (mantidos):{' '}
                <strong className="font-bold text-slate-700 dark:text-slate-300">{totalSkippedDays}</strong>
              </div>
            )}
            <div>
              Total de Marcações de Ponto:{' '}
              <strong className="font-bold text-slate-800 dark:text-white">{parsedPunches.length}</strong>
            </div>
          </div>

          <div className="pt-2">
            <Button
              className="w-full bg-slate-800 hover:bg-slate-700 text-white"
              onClick={() => {
                onClose();
                resetState();
              }}
            >
              Fechar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
