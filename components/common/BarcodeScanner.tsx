import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, ScanBarcode, RefreshCw, Keyboard, Check, AlertCircle } from 'lucide-react';

interface BarcodeScannerProps {
    onScan: (code: string) => void;
    label?: string;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, label = 'Escanear Código' }) => {
    const reactId = useId();
    const elementId = `barcode-reader-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [manualMode, setManualMode] = useState(false);
    const [manualValue, setManualValue] = useState('');

    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const stopScanner = useCallback(async () => {
        const inst = scannerRef.current;
        scannerRef.current = null;
        if (!inst) return;
        try {
            if (inst.isScanning) {
                await inst.stop();
            }
        } catch {
            /* ignore */
        }
        try {
            inst.clear();
        } catch {
            /* ignore */
        }
    }, []);

    const handleClose = useCallback(async () => {
        await stopScanner();
        if (!mountedRef.current) return;
        setIsOpen(false);
        setError('');
        setScanning(false);
        setCameraReady(false);
        setManualMode(false);
        setManualValue('');
    }, [stopScanner]);

    const startScanner = useCallback(async () => {
        if (!mountedRef.current) return;
        setError('');
        setCameraReady(false);
        setScanning(true);

        if (typeof window !== 'undefined') {
            const isSecure =
                window.isSecureContext ||
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1';
            if (!isSecure) {
                setScanning(false);
                setError(
                    'A câmera só funciona em HTTPS ou localhost. Acesse o sistema por uma URL segura ou use o campo manual abaixo.',
                );
                setManualMode(true);
                return;
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setScanning(false);
                setError(
                    'Este navegador não suporta acesso à câmera. Use o campo manual abaixo ou troque de navegador.',
                );
                setManualMode(true);
                return;
            }
        }

        await stopScanner();
        await new Promise((r) => setTimeout(r, 100));
        if (!mountedRef.current) return;

        const target = document.getElementById(elementId);
        if (!target) {
            setScanning(false);
            return;
        }

        try {
            const scanner = new Html5Qrcode(elementId, { verbose: false } as never);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: (vw, vh) => {
                        const safeVw = Math.max(vw || 0, 200);
                        const safeVh = Math.max(vh || 0, 200);
                        const minEdge = Math.min(safeVw, safeVh);
                        const width = Math.max(120, Math.floor(minEdge * 0.75));
                        const height = Math.max(80, Math.floor(width * 0.55));
                        return { width, height };
                    },
                },
                (decodedText) => {
                    if (!mountedRef.current) return;
                    onScan((decodedText || '').trim());
                    void handleClose();
                },
                () => {
                    /* ignore per-frame decode errors */
                },
            );

            if (!mountedRef.current) return;

            const videoEl = target.querySelector('video');
            if (videoEl) {
                videoEl.style.width = '100%';
                videoEl.style.height = '100%';
                videoEl.style.objectFit = 'cover';
                videoEl.style.borderRadius = '0';
            }

            setCameraReady(true);
            setScanning(false);
        } catch (err: unknown) {
            if (!mountedRef.current) return;
            setScanning(false);
            const msg = err instanceof Error ? err.message : String(err);
            const lower = msg.toLowerCase();
            if (lower.includes('notallowed') || lower.includes('permission')) {
                setError('Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador.');
            } else if (lower.includes('notfound') || lower.includes('devicesnotfound')) {
                setError('Nenhuma câmera encontrada neste dispositivo.');
            } else if (lower.includes('notreadable')) {
                setError('Câmera está sendo usada por outro aplicativo. Feche outros apps que usem a câmera.');
            } else {
                setError('Erro ao acessar a câmera: ' + msg);
            }
            setManualMode(true);
        }
    }, [elementId, handleClose, onScan, stopScanner]);

    useEffect(() => {
        if (!isOpen) return;
        if (manualMode) return;
        const timer = setTimeout(() => {
            void startScanner();
        }, 80);
        return () => {
            clearTimeout(timer);
            void stopScanner();
        };
    }, [isOpen, manualMode, startScanner, stopScanner]);

    const handleOpen = () => {
        setIsOpen(true);
        setError('');
        setManualMode(false);
        setManualValue('');
    };

    const handleManualSubmit = () => {
        const code = manualValue.trim();
        if (!code) return;
        onScan(code);
        void handleClose();
    };

    const toggleManualMode = async () => {
        if (!manualMode) {
            await stopScanner();
            setCameraReady(false);
            setScanning(false);
        }
        setManualMode((m) => !m);
    };

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors"
                title={label}
            >
                <Camera className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                            <div className="flex items-center gap-2">
                                <ScanBarcode className="h-5 w-5" />
                                <span className="font-semibold">Leitor de Código</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleClose()}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div
                                className={`relative w-full aspect-[4/3] bg-gray-900 rounded-xl overflow-hidden ${manualMode ? 'hidden' : ''}`}
                            >
                                <div id={elementId} className="absolute inset-0 w-full h-full" />

                                {(scanning || !cameraReady) && !error && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10 pointer-events-none">
                                        <RefreshCw className="h-8 w-8 animate-spin" />
                                        <span className="text-sm">Iniciando câmera...</span>
                                    </div>
                                )}
                                {cameraReady && !error && (
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-medium z-10 pointer-events-none flex items-center gap-1">
                                        <Check className="h-3 w-3" /> Aponte para o código
                                    </div>
                                )}
                            </div>

                            {manualMode && (
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Digite o código manualmente
                                    </label>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={manualValue}
                                        onChange={(e) => setManualValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleManualSubmit();
                                            }
                                        }}
                                        placeholder="Ex.: 7891234567890"
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleManualSubmit}
                                        disabled={!manualValue.trim()}
                                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Check className="h-4 w-4" />
                                        Confirmar código
                                    </button>
                                </div>
                            )}

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex gap-2">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => void toggleManualMode()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
                                >
                                    {manualMode ? (
                                        <>
                                            <Camera className="h-3.5 w-3.5" />
                                            Voltar à câmera
                                        </>
                                    ) : (
                                        <>
                                            <Keyboard className="h-3.5 w-3.5" />
                                            Digitar manualmente
                                        </>
                                    )}
                                </button>
                                {!manualMode && (
                                    <p className="text-[11px] text-gray-400 text-right">
                                        Aponte a câmera para o código de barras ou QR code
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
