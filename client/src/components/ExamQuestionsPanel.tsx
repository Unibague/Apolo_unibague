import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ChevronRight, ChevronLeft, CheckCircle2, ZoomIn, ZoomOut, Upload, Paperclip } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { buildPdfViewUrl, QUESTION_COLORS, PAIR_COLORS, getStableColor } from "../utils/examUtils";
import { examsAttemptsService } from "../services/examsAttempts";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

// --- TIPOS E INTERFACES ---
interface Question {
  id: number;
  enunciado: string;
  puntaje: number;
  nombreImagen?: string;
  type: "open" | "test" | "fill_blanks" | "match" | "file_upload";
  options?: Array<{ id: number; texto: string }>;
  textoCorrecto?: string;
  pares?: Array<{
    id: number;
    itemA: { id: number; text: string };
    itemB: { id: number; text: string };
  }>;
}

interface ExamData {
  nombre: string;
  nombreProfesor: string;
  limiteTiempo: number;
  descripcion: string;
  questions: Question[];
  archivoPDF?: string | null;
  dividirPreguntas?: boolean;
  permitirVolverPreguntas?: boolean;
}

interface ExamPanelProps {
  examData: ExamData | null;
  darkMode: boolean;
  answers: Record<number, any>;
  onAnswerChange: (preguntaId: number, respuesta: any, delayMs?: number) => void;
  readOnly?: boolean;
  onTerminarRevision?: () => void;
  remainingTime?: string;
  timerStatus?: 'normal' | 'warning' | 'critical';
  timeLimitRemoved?: boolean;
  initialQuestionIndex?: number;
  onQuestionIndexChange?: (index: number) => void;
  attemptId?: number;
  onFileDialogChange?: (isOpen: boolean) => void;
}

const EXAMS_API_URL = import.meta.env.VITE_EXAMS_URL || window.location.origin;
const ATTEMPTS_API_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;


// --- VISOR PDF PARA MÓVIL (canvas inline, sin abrir pestaña) ---
function MobilePdfViewer({ blobUrl, darkMode }: { blobUrl: string; darkMode: boolean }) {
  const [pageUrls, setPageUrls] = useState<string[]>([]);   // imágenes renderizadas progresivamente
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1.2);
  const pdfRef = useRef<any>(null);
  const cancelRef = useRef(false);

  // Renderiza páginas progresivamente (las muestra a medida que están listas)
  const renderPages = useCallback(async (pdf: any, s: number) => {
    cancelRef.current = false;
    setPageUrls([]);
    setLoading(true);
    for (let i = 1; i <= pdf.numPages; i++) {
      if (cancelRef.current) return;
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: s });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      if (!cancelRef.current) {
        // JPEG 0.85 es ~4× más rápido que PNG y suficiente calidad para texto
        const url = canvas.toDataURL("image/jpeg", 0.85);
        setPageUrls(prev => [...prev, url]);
      }
    }
    if (!cancelRef.current) setLoading(false);
  }, []);

  // Efecto 1: cargar documento PDF (solo cuando cambia la URL)
  useEffect(() => {
    cancelRef.current = true;
    let mounted = true;
    setPageUrls([]);
    setTotalPages(0);
    setError(false);
    setLoading(true);

    pdfjsLib.getDocument(blobUrl).promise
      .then((pdf) => {
        if (!mounted) return;
        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);
        renderPages(pdf, scale);
      })
      .catch(() => {
        if (mounted) { setError(true); setLoading(false); }
      });

    return () => { mounted = false; cancelRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl]); // NO incluir scale aquí — el zoom tiene su propio efecto

  // Efecto 2: re-renderizar al cambiar zoom (reutiliza el PDF ya cargado, sin re-descarga)
  useEffect(() => {
    if (!pdfRef.current || totalPages === 0) return;
    cancelRef.current = true;
    // Pequeño debounce para evitar re-renders rápidos mientras se presiona zoom
    const timer = setTimeout(() => {
      if (pdfRef.current) renderPages(pdfRef.current, scale);
    }, 350);
    return () => { clearTimeout(timer); cancelRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]); // Solo scale — pdfRef y renderPages son estables

  const changeScale = (delta: number) => {
    setScale(s => Math.min(3, Math.max(0.6, parseFloat((s + delta).toFixed(1)))));
  };

  if (error) return (
    <div className={`text-center py-10 text-sm ${darkMode ? "text-red-400" : "text-red-500"}`}>
      No se pudo cargar el PDF. Intenta de nuevo.
    </div>
  );

  return (
    <div>
      {/* Barra de zoom y progreso */}
      <div className={`sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b ${darkMode ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-white"}`}>
        <span className={`text-xs ${darkMode ? "text-slate-400" : "text-gray-400"}`}>
          {loading
            ? pageUrls.length > 0
              ? `Cargando… ${pageUrls.length}/${totalPages} págs.`
              : "Preparando PDF…"
            : `${totalPages} págs.`}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => changeScale(-0.2)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-600"}`}>
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className={`text-xs font-mono w-10 text-center ${darkMode ? "text-slate-400" : "text-gray-500"}`}>{Math.round(scale * 100)}%</span>
          <button onClick={() => changeScale(0.2)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-600"}`}>
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Spinner inicial (antes de que aparezca la primera página) */}
      {pageUrls.length === 0 && loading && (
        <div className={`flex flex-col items-center justify-center gap-3 py-16 ${darkMode ? "text-slate-400" : "text-gray-500"}`}>
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Preparando PDF…</span>
        </div>
      )}

      {/* Páginas (aparecen una a una) */}
      <div className="overflow-x-auto">
        {pageUrls.map((src, i) => (
          <div key={i} className={`mb-1 flex justify-center ${darkMode ? "bg-slate-900" : "bg-gray-100"}`}>
            <img src={src} alt={`Página ${i + 1}`} style={{ display: "block" }} draggable={false} />
          </div>
        ))}
        {/* Spinner de páginas restantes */}
        {loading && pageUrls.length > 0 && pageUrls.length < totalPages && (
          <div className={`flex justify-center py-4 ${darkMode ? "text-slate-500" : "text-gray-400"}`}>
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---
export default function ExamPanel({
  examData,
  darkMode,
  answers,
  onAnswerChange,
  readOnly = false,
  onTerminarRevision,
  remainingTime,
  timerStatus = 'normal',
  timeLimitRemoved = false,
  initialQuestionIndex,
  onQuestionIndexChange,
  attemptId,
  onFileDialogChange,
}: ExamPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const init = initialQuestionIndex ?? 0;
    const qs = examData?.questions ?? [];
    return Math.min(init, Math.max(0, qs.length - 1));
  });
  const [allDone, setAllDone] = useState(() => {
    const init = initialQuestionIndex ?? 0;
    const qs = examData?.questions ?? [];
    return qs.length > 0 && init >= qs.length;
  });
  const [showNoAnswerConfirm, setShowNoAnswerConfirm] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onQuestionIndexChange?.(currentIndex);
  }, [currentIndex]);

  // Detectar móvil: pantalla pequeña o touch device
  const isMobile = typeof window !== "undefined" && (window.innerWidth < 768 || navigator.maxTouchPoints > 0);

  // PDF: cargamos el archivo como Blob URL para que iOS Safari pueda mostrarlo inline en el iframe
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlobLoading, setPdfBlobLoading] = useState(false);
  const pdfBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!examData?.archivoPDF) return;
    let cancelled = false;
    setPdfBlobLoading(true);
    setPdfBlobUrl(null);

    fetch(buildPdfViewUrl(examData.archivoPDF))
      .then(res => {
        if (!res.ok) throw new Error('error');
        return res.blob();
      })
      .then(blob => {
        if (cancelled) return;
        // Forzamos MIME correcto para que el navegador lo reconozca como PDF
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        pdfBlobRef.current = url;
        setPdfBlobUrl(url);
        setPdfBlobLoading(false);
      })
      .catch(() => {
        if (!cancelled) setPdfBlobLoading(false);
      });

    return () => {
      cancelled = true;
      if (pdfBlobRef.current) {
        URL.revokeObjectURL(pdfBlobRef.current);
        pdfBlobRef.current = null;
      }
    };
  }, [examData?.archivoPDF]);

  const questions = examData?.questions || [];
  const total = questions.length;
  const currentQuestion = questions[currentIndex];

  const handleNext = () => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (currentIndex < total - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setAllDone(true);
    }
  };

  const handlePrev = () => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (allDone) {
      setAllDone(false);
    } else if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const isCurrentAnswered = (): boolean => {
    if (!currentQuestion) return true;
    const answer = answers[currentQuestion.id];
    if (answer === undefined || answer === null) return false;
    if (currentQuestion.type === 'match') return Array.isArray(answer) && answer.length === (currentQuestion.pares?.length || 0);
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === 'string') return answer.trim().length > 0;
    return false;
  };

  const handleNextWithConfirm = () => {
    if (!examData?.permitirVolverPreguntas && !isCurrentAnswered()) {
      setShowNoAnswerConfirm(true);
      return;
    }
    handleNext();
  };

  const progressPct = allDone ? 100 : total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  // Conteo de preguntas respondidas (para el modo "todas a la vez")
  const answeredCount = questions.filter((q: Question) => {
    const answer = answers[q.id];
    if (answer === undefined || answer === null) return false;
    if (q.type === 'match') return Array.isArray(answer) && answer.length === (q.pares?.length || 0);
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === 'string') return answer.trim().length > 0;
    return false;
  }).length;

  const answeredPct = total > 0 ? (answeredCount / total) * 100 : 0;

  return (
    <div className="h-full w-full">
      <style>{`
        /* Bloqueo visual de extensiones de IA (Monica, Grammarly, etc.) */
        [id^="monica-"], [class^="monica-"],
        div[id*="monica"], div[class*="monica"],
        #monica-root, .monica-widget {
          display: none !important;
          pointer-events: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          z-index: -9999 !important;
        }
      `}</style>
      <div className={`h-full flex flex-col transition-colors duration-300 ${darkMode ? "bg-slate-900 text-gray-100" : "bg-white text-gray-900"}`}>

        {!examData ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className={`text-xl font-medium ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Cargando examen...
              </p>
            </div>
          </div>
        ) : examData.archivoPDF ? (
          /* --- MODO PDF: Layout con PDF embebido --- */
          <div className="flex-1 overflow-auto">
            <div className="max-w-5xl mx-auto p-6 md:p-10">
              <header className={`mb-10 border-b pb-8 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
                <h1 className={`text-2xl sm:text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r mb-3 tracking-tight ${darkMode ? "from-blue-400 to-teal-400" : "from-blue-500 to-teal-500"}`}>
                  {examData.nombre}
                </h1>
                <div className="flex flex-wrap items-center gap-6 text-sm md:text-base">
                  <div className={`flex items-center gap-2 font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {examData.nombreProfesor}
                  </div>
                  <div className={`flex items-center gap-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {examData.limiteTiempo ? `${examData.limiteTiempo} minutos` : "Sin límite de tiempo"}
                  </div>
                </div>
                {examData.descripcion && (
                  <div className={`mt-6 p-5 rounded-xl border shadow-sm ${darkMode ? "bg-slate-800/50 border-slate-800" : "bg-white border-gray-200"}`}>
                    <h4 className={`text-sm font-bold uppercase tracking-wider mb-2 ${darkMode ? "text-teal-500" : "text-teal-600"}`}>
                      Instrucciones
                    </h4>
                    <div
                      className={`prose max-w-none font-serif leading-relaxed opacity-90 ${darkMode ? "prose-invert" : "prose-slate"}`}
                      dangerouslySetInnerHTML={{ __html: examData.descripcion }}
                    />
                  </div>
                )}
              </header>
              <div className={`rounded-xl border overflow-hidden shadow-sm ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
                {isMobile ? (
                  /* ── MÓVIL: renderizado inline con PDF.js (sin abrir pestaña) ── */
                  pdfBlobLoading ? (
                    <div className={`flex flex-col items-center justify-center gap-3 py-16 ${darkMode ? "bg-slate-800 text-slate-400" : "bg-gray-50 text-gray-500"}`}>
                      <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-medium">Cargando PDF del examen…</span>
                    </div>
                  ) : pdfBlobUrl ? (
                    <MobilePdfViewer blobUrl={pdfBlobUrl} darkMode={darkMode} />
                  ) : (
                    <div className={`flex flex-col items-center justify-center gap-3 py-16 ${darkMode ? "bg-slate-800 text-slate-400" : "bg-gray-50 text-gray-500"}`}>
                      <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      <span className="text-sm">No se pudo cargar el PDF.</span>
                    </div>
                  )
                ) : (
                  /* ── DESKTOP: iframe normal ── */
                  pdfBlobLoading ? (
                    <div
                      className={`w-full flex flex-col items-center justify-center gap-3 ${darkMode ? "bg-slate-800 text-slate-400" : "bg-gray-50 text-gray-500"}`}
                      style={{ height: "70vh" }}
                    >
                      <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-medium">Cargando PDF del examen...</span>
                    </div>
                  ) : pdfBlobUrl ? (
                    <iframe
                      src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                      className="w-full border-0"
                      style={{ height: "70vh" }}
                      title="Examen PDF"
                    />
                  ) : (
                    <div className="flex flex-col" style={{ height: "70vh" }}>
                      <iframe
                        src={`${buildPdfViewUrl(examData.archivoPDF!)}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                        className="w-full border-0 flex-1"
                        title="Examen PDF"
                      />
                      <div className={`p-3 border-t text-center ${darkMode ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-gray-50"}`}>
                        <p className={`text-xs mb-2 ${darkMode ? "text-slate-400" : "text-gray-500"}`}>
                          Si el PDF no se muestra, usa el botón para verlo:
                        </p>
                        <a
                          href={buildPdfViewUrl(examData.archivoPDF!)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Ver PDF en nueva pestaña
                        </a>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        ) : examData.dividirPreguntas ? (
          /* --- MODO SECUENCIAL: Una pregunta a la vez, sin retroceso --- */
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Barra de progreso superior */}
            <div className={`px-3 sm:px-6 pt-4 pb-3 border-b flex-shrink-0 ${darkMode ? "border-slate-700/50" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className={`font-bold text-base truncate ${darkMode ? "text-white" : "text-gray-900"}`}>
                  {examData.nombre}
                </h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Timer — solo visible en móvil (en desktop ya se muestra en la barra superior) */}
                  {!timeLimitRemoved && remainingTime && (
                    <span className={`md:hidden flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-bold tabular-nums ${
                      timerStatus === 'critical'
                        ? "bg-red-500/20 text-red-400 animate-pulse"
                        : timerStatus === 'warning'
                        ? "bg-amber-500/20 text-amber-400"
                        : (darkMode ? "bg-blue-900/30 text-blue-300" : "bg-blue-50 text-blue-600")
                    }`}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      {remainingTime}
                    </span>
                  )}
                  <span className={`text-sm font-mono tabular-nums px-2.5 py-0.5 rounded-full font-semibold ${
                    allDone
                      ? (darkMode ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-600")
                      : (darkMode ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600")
                  }`}>
                    {allDone ? total : currentIndex + 1} / {total}
                  </span>
                </div>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-gray-200"}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-emerald-500" : "bg-blue-500"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Pregunta actual */}
            <div ref={contentRef} className="flex-1 overflow-auto">
              <div className="min-h-full flex flex-col items-center justify-center px-6 py-8">
                {allDone ? (
                  <div className="flex flex-col items-center gap-6 text-center py-16">
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center ${darkMode ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-500"}`}>
                      <CheckCircle2 className="w-12 h-12" />
                    </div>
                    <div>
                      <h3 className={`text-2xl font-bold mb-3 ${darkMode ? "text-white" : "text-gray-900"}`}>
                        ¡Has visto todas las preguntas!
                      </h3>
                      <p className={`text-sm ${darkMode ? "text-slate-400" : "text-gray-500"}`}>
                        Usa el botón <strong>Entregar</strong> en el menú lateral cuando estés listo.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-5xl">
                    <QuestionCard
                      key={currentQuestion.id}
                      question={currentQuestion}
                      index={currentIndex}
                      answer={answers[currentQuestion.id]}
                      onAnswerChange={onAnswerChange}
                      darkMode={darkMode}
                      readOnly={readOnly}
                      attemptId={attemptId}
                      onFileDialogChange={onFileDialogChange}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Botón de navegación */}
            <div className={`px-3 sm:px-6 py-3 border-t flex-shrink-0 flex items-center justify-between ${darkMode ? "border-slate-700/50" : "border-gray-200"}`}>
              {/* Botón anterior (solo si permitirVolverPreguntas está activo y hay pregunta anterior o estamos en allDone) */}
              {examData.permitirVolverPreguntas && (currentIndex > 0 || allDone) ? (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-900/20"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Pregunta anterior
                </button>
              ) : (
                <span className={`text-xs ${darkMode ? "text-slate-500" : "text-gray-400"}`}>
                  {examData.permitirVolverPreguntas ? "" : "No podrás volver a esta pregunta"}
                </span>
              )}

              {!allDone && (
                currentIndex < total - 1 ? (
                  <button
                    onClick={handleNextWithConfirm}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-900/20"
                  >
                    Siguiente pregunta
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => onTerminarRevision?.()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20"
                  >
                    Terminar revisión
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )
              )}
            </div>

            {/* Diálogo de confirmación: avanzar sin responder */}
            {showNoAnswerConfirm && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl ${darkMode ? "bg-slate-800 border border-slate-700" : "bg-white border border-gray-100"}`}>
                  <p className={`text-base font-semibold mb-5 text-center leading-snug ${darkMode ? "text-white" : "text-gray-900"}`}>
                    ¿Estás seguro de que quieres ir a la siguiente pregunta sin contestar la pregunta actual? No podrás devolverte.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowNoAnswerConfirm(false)}
                      className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${darkMode ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"}`}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => { setShowNoAnswerConfirm(false); handleNext(); }}
                      className="flex-1 py-2.5 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md"
                    >
                      Aceptar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* --- MODO LIBRE: Todas las preguntas a la vez, scroll libre --- */
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Barra de progreso superior */}
            <div className={`px-3 sm:px-6 pt-4 pb-3 border-b flex-shrink-0 ${darkMode ? "border-slate-700/50" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className={`font-bold text-base truncate ${darkMode ? "text-white" : "text-gray-900"}`}>
                  {examData.nombre}
                </h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Timer — solo visible en móvil */}
                  {!timeLimitRemoved && remainingTime && (
                    <span className={`md:hidden flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-bold tabular-nums ${
                      timerStatus === 'critical'
                        ? "bg-red-500/20 text-red-400 animate-pulse"
                        : timerStatus === 'warning'
                        ? "bg-amber-500/20 text-amber-400"
                        : (darkMode ? "bg-blue-900/30 text-blue-300" : "bg-blue-50 text-blue-600")
                    }`}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      {remainingTime}
                    </span>
                  )}
                  <span className={`text-sm font-mono tabular-nums px-2.5 py-0.5 rounded-full font-semibold ${
                    answeredCount === total
                      ? (darkMode ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-600")
                      : (darkMode ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600")
                  }`}>
                    {answeredCount} / {total} respondidas
                  </span>
                </div>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-gray-200"}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${answeredCount === total ? "bg-emerald-500" : "bg-blue-500"}`}
                  style={{ width: `${answeredPct}%` }}
                />
              </div>
            </div>

            {/* Lista completa de preguntas */}
            <div className="flex-1 overflow-auto">
              <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
                {questions.map((question: Question, index: number) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    answer={answers[question.id]}
                    onAnswerChange={onAnswerChange}
                    darkMode={darkMode}
                    readOnly={readOnly}
                    attemptId={attemptId}
                    onFileDialogChange={onFileDialogChange}
                  />
                ))}
              </div>
            </div>

            {/* Footer informativo */}
            <div className={`px-6 py-3 border-t flex-shrink-0 flex items-center justify-end ${darkMode ? "border-slate-700/50" : "border-gray-200"}`}>
              <span className={`text-xs ${darkMode ? "text-slate-500" : "text-gray-400"}`}>
                Puedes revisar y cambiar tus respuestas antes de entregar
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- TARJETA DE PREGUNTA GENÉRICA ---
function QuestionCard({
  question,
  index,
  answer,
  onAnswerChange,
  darkMode,
  readOnly,
  attemptId,
  onFileDialogChange,
}: {
  question: Question;
  index: number;
  answer: any;
  onAnswerChange: (id: number, val: any, delay?: number) => void;
  darkMode: boolean;
  readOnly?: boolean;
  attemptId?: number;
  onFileDialogChange?: (isOpen: boolean) => void;
}) {
  // Seleccionamos un color basado en el índice de la pregunta
  const barColor = getStableColor(question.id, QUESTION_COLORS);

  // Verificar si la pregunta tiene respuesta
  const isAnswered = React.useMemo(() => {
    if (answer === undefined || answer === null) return false;

    if (question.type === 'match') {
      return Array.isArray(answer) && answer.length === (question.pares?.length || 0);
    }

    if (Array.isArray(answer)) return answer.length > 0; // Para test, match, fill_blanks
    if (typeof answer === 'string') return answer.trim().length > 0; // Para open
    return false;
  }, [answer, question]);

  return (
    <div className={`group relative rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden ${darkMode ? "bg-slate-800/60 border-slate-800 hover:border-blue-700/80" : "bg-white border-gray-200 hover:shadow-lg hover:border-blue-300"}`}>
      {/* Barra lateral de estado (decorativa) con color dinámico */}
      <div className={`absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b ${barColor}`}></div>

      <div className="p-4 sm:p-8 md:p-10 pl-6 sm:pl-10 md:pl-14">
        {/* Encabezado de la Pregunta */}
        <div className="flex items-start gap-3 sm:gap-5 mb-4 sm:mb-8">
          <span className={`flex items-center justify-center w-8 h-8 sm:w-11 sm:h-11 rounded-xl font-bold text-sm sm:text-base shrink-0 transition-all duration-300 ${
            isAnswered
              ? (darkMode ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50" : "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200")
              : (darkMode ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-slate-600")
          }`}>
            {isAnswered ? (
              <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          <div className="flex-1">
            <h3 className={`text-base sm:text-xl md:text-2xl font-medium font-serif leading-snug ${darkMode ? "text-gray-100" : "text-gray-900"}`}
              dangerouslySetInnerHTML={{ __html: question.enunciado }}
            />
            <span className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full ${darkMode ? "bg-slate-700/60 text-slate-400" : "bg-gray-100 text-slate-500"}`}>
              {question.puntaje} {question.puntaje === 1 ? "punto" : "puntos"}
            </span>
          </div>
        </div>

        {/* Imagen Opcional */}
        {question.nombreImagen && (
          <div className={`mb-6 rounded-xl overflow-hidden border flex justify-center p-4 ${darkMode ? "bg-slate-900/50 border-slate-700" : "bg-white border-gray-200"}`}>
            <img
              src={question.nombreImagen.startsWith('data:') || question.nombreImagen.startsWith('http')
                ? question.nombreImagen
                : `${EXAMS_API_URL}/api/images/${question.nombreImagen}`}
              alt="Referencia visual"
              className="max-h-80 object-contain rounded-lg shadow-sm"
            />
          </div>
        )}

        {/* Cuerpo de la pregunta según tipo */}
        <div className="mt-4">
          {question.type === "open" && (
            <OpenQuestion question={question} answer={answer} onChange={onAnswerChange} darkMode={darkMode} readOnly={readOnly} />
          )}
          {question.type === "test" && (
            <TestQuestion question={question} answer={answer} onChange={onAnswerChange} darkMode={darkMode} readOnly={readOnly} />
          )}
          {question.type === "fill_blanks" && (
            <FillBlanksQuestion question={question} answer={answer} onChange={onAnswerChange} darkMode={darkMode} readOnly={readOnly} />
          )}
          {question.type === "match" && (
            <MatchQuestion question={question} answer={answer} onChange={onAnswerChange} darkMode={darkMode} readOnly={readOnly} />
          )}
          {question.type === "file_upload" && (
            <FileUploadQuestion question={question} answer={answer} onChange={onAnswerChange} darkMode={darkMode} readOnly={readOnly} attemptId={attemptId} onFileDialogChange={onFileDialogChange} />
          )}
        </div>
      </div>
    </div>
  );
}

// --- TIPOS DE PREGUNTAS ---

// 1. Pregunta Abierta
function OpenQuestion({ question, answer, onChange, darkMode, readOnly }: any) {
  const maxLength = 3000;
  // Solo cuenta caracteres no-whitespace (espacios, tabs y saltos de línea no suman)
  const countEffective = (s: string) => s.replace(/\s/g, "").length;
  const currentLength = countEffective(answer || "");

  return (
    <div className="relative">
      <textarea
        readOnly={readOnly}
        value={answer || ""}
        onChange={(e) => {
          const next = e.target.value;
          if (countEffective(next) <= maxLength) {
            onChange(question.id, next, 3000);
          }
        }}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        data-gramm="false"
        className={`w-full min-h-[140px] p-4 rounded-xl border-2 outline-none transition-all resize-y placeholder-slate-400 ${darkMode ? "bg-slate-800/70 border-slate-700 focus:border-blue-500 focus:bg-slate-800 text-slate-200" : "bg-gray-50 border-gray-200 focus:border-blue-500 focus:bg-white text-slate-700"}`}
        placeholder="Escribe tu respuesta detallada aquí..."
      />
      <div className="absolute bottom-3 right-3 pointer-events-none">
        <span className={`text-xs font-medium ${currentLength >= maxLength ? "text-red-500" : "text-slate-400"}`}>
          {currentLength}/{maxLength}
        </span>
      </div>
    </div>
  );
}

// 1.b Pregunta de subir archivo (siempre calificada manualmente)
function FileUploadQuestion({ question, answer, onChange, darkMode, readOnly, attemptId, onFileDialogChange }: any) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const hasFile = typeof answer === "string" && answer.trim().length > 0;

  // Abrir el selector nativo de archivos saca al navegador de pantalla completa.
  // Avisamos al padre para que el monitor de seguridad no lo trate como una
  // violación (cambio de pestaña / salida de fullscreen) y luego reintente
  // activar pantalla completa cuando el diálogo se cierre.
  const handleTriggerClick = () => {
    onFileDialogChange?.(true);
    let settled = false;
    const closeDialogGrace = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", handleWindowFocusBack);
      onFileDialogChange?.(false);
    };
    const handleWindowFocusBack = () => {
      // Pequeño margen para que el evento onChange (si se eligió un archivo)
      // alcance a dispararse antes de reactivar el monitor de seguridad.
      setTimeout(closeDialogGrace, 400);
    };
    window.addEventListener("focus", handleWindowFocusBack);
    // Salvaguarda: si por alguna razón el evento focus nunca llega, no dejar
    // el monitor de seguridad desactivado indefinidamente.
    setTimeout(closeDialogGrace, 120000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!attemptId) {
      setError("No se pudo identificar el intento actual. Recarga la página.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const result = await examsAttemptsService.uploadAnswerFile(attemptId, question.id, file);
      setUploadedName(result.originalName || file.name);
      onChange(question.id, result.fileName, 0);
    } catch (err: any) {
      const backendMessage = err?.response?.data?.message;
      setError(backendMessage || "No se pudo subir el archivo. Intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  };

  const downloadUrl = hasFile
    ? `${ATTEMPTS_API_URL}/api/exam/answer-file/${answer}${uploadedName ? `?name=${encodeURIComponent(uploadedName)}` : ""}`
    : null;

  return (
    <div className="space-y-3">
      {hasFile && (
        <div className={`flex items-center justify-between gap-3 p-4 rounded-xl border-2 ${darkMode ? "bg-emerald-500/10 border-emerald-700/60" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center gap-3 min-w-0">
            <Paperclip className={`w-5 h-5 shrink-0 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
            <span className={`truncate text-sm font-medium ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
              {uploadedName || "Archivo entregado"}
            </span>
          </div>
          <a
            href={downloadUrl!}
            target="_blank"
            rel="noreferrer"
            className={`text-sm font-medium underline shrink-0 ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}
          >
            Ver
          </a>
        </div>
      )}

      {!readOnly && (
        <label
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            uploading ? "opacity-60 cursor-wait" : ""
          } ${darkMode ? "border-slate-600 hover:border-blue-500 bg-slate-800/40" : "border-gray-300 hover:border-blue-400 bg-gray-50"}`}
        >
          <Upload className={`w-6 h-6 ${darkMode ? "text-slate-400" : "text-gray-400"}`} />
          <span className={`text-sm font-medium ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            {uploading ? "Subiendo archivo..." : hasFile ? "Reemplazar archivo" : "Seleccionar archivo"}
          </span>
          <span className={`text-xs text-center ${darkMode ? "text-slate-500" : "text-gray-400"}`}>
            PDF, Word, Excel, PowerPoint, texto, imágenes, comprimidos o código/notebooks (ipynb, py, js...) — máx. 20MB
          </span>
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onClick={handleTriggerClick}
            onChange={handleFileSelect}
          />
        </label>
      )}

      {error && (
        <p className={`text-sm ${darkMode ? "text-red-400" : "text-red-600"}`}>{error}</p>
      )}
    </div>
  );
}

// 2. Pregunta Test (Selección Múltiple)
function TestQuestion({ question, answer, onChange, darkMode, readOnly }: any) {
  const selectedOptions = answer || [];

  // Aleatorizar opciones (Memoizado para evitar reordenamientos innecesarios)
  const shuffledOptions = useMemo(() => {
    const options = [...(question.options || [])];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  }, [question.id, question.options]);

  return (
    <div className="grid grid-cols-1 gap-3">
      {shuffledOptions.map((option: any) => {
        const isSelected = selectedOptions.includes(option.id);
        return (
          <label
            key={option.id}
            className={`
              flex items-center gap-3 p-3 sm:p-4 rounded-xl border-2 ${readOnly ? "cursor-default" : "cursor-pointer"} transition-all duration-200 group
              ${
                isSelected
                  ? (darkMode ? "border-blue-500 bg-blue-900/30" : "border-blue-500 bg-blue-50")
                  : (darkMode ? "border-slate-700 hover:border-blue-600 hover:bg-blue-900/10" : "border-gray-200 hover:border-blue-400 hover:bg-blue-50/50")
              }
            `}
          >
            <div className="relative flex items-center justify-center flex-shrink-0">
              <input
                disabled={readOnly}
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  const newSelected = e.target.checked
                    ? [...selectedOptions, option.id]
                    : selectedOptions.filter((id: number) => id !== option.id);
                  onChange(question.id, newSelected, 500);
                }}
                className="peer sr-only"
              />
              <div
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                  isSelected
                    ? "bg-blue-500 border-blue-500"
                    : (darkMode ? "border-slate-500 bg-slate-800/80 group-hover:border-blue-600" : "border-gray-300 bg-white group-hover:border-blue-400")
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <span className={`flex-1 text-sm sm:text-base font-medium ${isSelected ? (darkMode ? "text-blue-300" : "text-blue-700") : (darkMode ? "text-slate-300" : "text-slate-700")}`}>
              {option.texto}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// 3. Completar Espacios
function FillBlanksQuestion({ question, answer, onChange, darkMode, readOnly }: any) {
  const texto = question.textoCorrecto || "";
  const partes = texto.split("___");
  const respuestasArray = answer || [];

  return (
    <div className={`p-3 sm:p-6 rounded-xl border leading-relaxed text-sm sm:text-base ${darkMode ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
      {partes.map((parte: string, idx: number) => (
        <React.Fragment key={idx}>
          <span className={darkMode ? "text-slate-300" : "text-slate-700"}>{parte}</span>
          {idx < partes.length - 1 && (
            <span className="relative inline-block mx-1">
              <input
                type="text"
                readOnly={readOnly}
                value={respuestasArray[idx] || ""}
                onChange={(e) => {
                  const newRespuestas = [...respuestasArray];
                  newRespuestas[idx] = e.target.value;
                  onChange(question.id, newRespuestas, 2000);
                }}
                className={`w-32 px-2 py-1 text-center border-b-2 outline-none rounded-t transition-colors font-medium ${darkMode ? "bg-slate-800 border-slate-600 focus:border-blue-400 text-blue-400" : "bg-gray-50 border-gray-300 focus:border-blue-500 text-blue-600"}`}
              />
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// 4. Emparejamiento (MATCH) - REDISEÑADO MEJORADO
function MatchQuestion({ question, answer, onChange, darkMode, readOnly }: any) {
  const respuestasPares = answer || [];
  const [selection, setSelection] = useState<{ side: 'A' | 'B'; id: number } | null>(null);

  // Aleatorizar columnas (Memoizado para evitar re-ordenamiento en cada render)
  const { itemsA, itemsB } = useMemo(() => {
    const shuffle = (arr: any[]) => {
      const newArr = [...arr];
      for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
      }
      return newArr;
    };
    return {
      itemsA: shuffle(question.pares?.map((p: any) => p.itemA) || []),
      itemsB: shuffle(question.pares?.map((p: any) => p.itemB) || [])
    };
  }, [question.id, question.pares?.length]);
  
  // Referencias para dibujar líneas
  const containerRef = useRef<HTMLDivElement>(null);
  const [itemPositions, setItemPositions] = useState<Record<string, { top: number; left: number }>>({});
  const [, setForceUpdate] = useState(0); // Para forzar re-render al cambiar tamaño ventana

  // Función para obtener posiciones de los "sockets" (puntos de conexión)
  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;
    
    const positions: Record<string, { top: number; left: number }> = {};
    const containerRect = containerRef.current.getBoundingClientRect();

    question.pares?.forEach((par: any) => {
      // Elementos
      const elA = document.getElementById(`match-a-${question.id}-${par.itemA.id}`);
      const elB = document.getElementById(`match-b-${question.id}-${par.itemB.id}`);
      
      if (elA && elB) {
        // Encontrar los puntos de anclaje (sockets)
        // Socket A está a la derecha del elemento A
        const rectA = elA.getBoundingClientRect();
        const rectB = elB.getBoundingClientRect();

        // Guardamos posiciones relativas al contenedor
        positions[`a-${par.itemA.id}`] = {
            left: (rectA.right - 2) - containerRect.left, // Ajuste: centro exacto del socket (borde 2px)
            top: (rectA.top + rectA.height / 2) - containerRect.top
        };

        positions[`b-${par.itemB.id}`] = {
            left: (rectB.left + 2) - containerRect.left, // Ajuste: centro exacto del socket (borde 2px)
            top: (rectB.top + rectB.height / 2) - containerRect.top
        };
      }
    });
    setItemPositions(positions);
    setForceUpdate(prev => prev + 1);
  }, [question.pares, question.id]);

  // Actualizar posiciones al cargar y al redimensionar
  useEffect(() => {
    // Timeout para asegurar que el DOM se pintó
    const timer = setTimeout(updatePositions, 200);
    
    // Observer para detectar cambios en el tamaño del contenedor (ej. al redimensionar paneles)
    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => updatePositions());
    });

    if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', updatePositions);
    return () => {
      window.removeEventListener('resize', updatePositions);
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, [updatePositions, respuestasPares.length]);

  const handleItemClick = (side: 'A' | 'B', id: number) => {
    if (readOnly) return;
    if (selection) {
      // Si hago click en el mismo lado
      if (selection.side === side) {
        setSelection(selection.id === id ? null : { side, id });
        return;
      }
      
      // Conectar
      const itemA_id = side === 'A' ? id : selection.id;
      const itemB_id = side === 'B' ? id : selection.id;

      // Eliminar conexiones previas de estos items
      let nuevos = respuestasPares.filter((p: any) => p.itemA_id !== itemA_id && p.itemB_id !== itemB_id);
      nuevos.push({ itemA_id, itemB_id });
      
      onChange(question.id, nuevos);
      setSelection(null);
    } else {
      // Si no hay selección, verificar si ya está conectado para desconectar
      const isConnected = respuestasPares.some((p: any) => (side === 'A' && p.itemA_id === id) || (side === 'B' && p.itemB_id === id));
      if (isConnected) {
        const nuevos = respuestasPares.filter((p: any) => !((side === 'A' && p.itemA_id === id) || (side === 'B' && p.itemB_id === id)));
        onChange(question.id, nuevos);
      } else {
        setSelection({ side, id });
      }
    }
  };

  // Generar path SVG tipo curva Bezier
  const getPath = (posA: any, posB: any) => {
    if (!posA || !posB) return "";
    
    // Coordenadas relativas al contenedor SVG
    const x1 = posA.left;
    const y1 = posA.top;
    const x2 = posB.left;
    const y2 = posB.top;

    // Curvatura
    const tension = 0.5;
    const delta = Math.abs(x2 - x1) * tension;

    return `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className={`select-none rounded-xl border ${darkMode ? "bg-slate-800/50 border-slate-700/80" : "bg-white border-gray-200"}`}>

      {/* ── MÓVIL: tarjetas con dropdown ── */}
      <div className="md:hidden p-3 space-y-3">
        <p className={`text-[11px] font-bold uppercase tracking-wider text-center mb-1 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
          Empareja cada elemento
        </p>
        {itemsA.map((itemA: any) => {
          const pair = respuestasPares.find((p: any) => p.itemA_id === itemA.id);
          const selectedBId = pair?.itemB_id;
          const style = pair ? getStableColor(itemA.id, PAIR_COLORS) : null;

          return (
            <div
              key={itemA.id}
              className={`p-3 rounded-xl border-2 transition-all ${
                pair
                  ? (darkMode ? `${style?.darkBorder} ${style?.darkBg}` : `${style?.border} ${style?.bg}`)
                  : (darkMode ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-gray-50")
              }`}
            >
              <p className={`text-sm font-semibold mb-2 ${pair ? (darkMode ? style?.darkText : style?.text) : (darkMode ? "text-slate-200" : "text-slate-800")}`}>
                {itemA.text}
              </p>
              <select
                disabled={readOnly}
                value={selectedBId ?? ''}
                onChange={(e) => {
                  if (!e.target.value) {
                    onChange(question.id, respuestasPares.filter((p: any) => p.itemA_id !== itemA.id));
                  } else {
                    const bId = Number(e.target.value);
                    const nuevos = respuestasPares.filter((p: any) => p.itemA_id !== itemA.id && p.itemB_id !== bId);
                    nuevos.push({ itemA_id: itemA.id, itemB_id: bId });
                    onChange(question.id, nuevos);
                  }
                }}
                className={`w-full text-sm p-2 rounded-lg border outline-none transition-colors ${
                  darkMode
                    ? "bg-slate-900 border-slate-600 text-slate-200 focus:border-indigo-500"
                    : "bg-white border-gray-300 text-slate-700 focus:border-indigo-500"
                }`}
              >
                <option value="">— Seleccionar —</option>
                {itemsB.map((itemB: any) => (
                  <option key={itemB.id} value={itemB.id}>{itemB.text}</option>
                ))}
              </select>
              {pair && (
                <button
                  disabled={readOnly}
                  onClick={() => onChange(question.id, respuestasPares.filter((p: any) => p.itemA_id !== itemA.id))}
                  className={`mt-1.5 text-[11px] font-medium flex items-center gap-1 ${darkMode ? "text-slate-500 hover:text-rose-400" : "text-slate-400 hover:text-rose-500"}`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  Quitar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── DESKTOP: dos columnas con líneas SVG ── */}
      <div className={`hidden md:block relative p-4`} ref={containerRef}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
          {respuestasPares.map((par: any, idx: number) => {
            const posA = itemPositions[`a-${par.itemA_id}`];
            const posB = itemPositions[`b-${par.itemB_id}`];
            if (!posA || !posB) return null;
            const style = getStableColor(par.itemA_id, PAIR_COLORS);
            return (
              <g key={idx}>
                <path d={getPath(posA, posB)} fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="6" />
                <path d={getPath(posA, posB)} fill="none" stroke="currentColor" strokeWidth="3"
                  className={darkMode ? style.darkStroke : style.stroke}
                  strokeDasharray="500" strokeDashoffset="0">
                  <animate attributeName="stroke-dashoffset" from="500" to="0" dur="0.8s" fill="freeze" />
                </path>
                <circle cx={posA.left} cy={posA.top} r="4" className={darkMode ? style.darkFill : style.fill} />
                <circle cx={posB.left} cy={posB.top} r="4" className={darkMode ? style.darkFill : style.fill} />
              </g>
            );
          })}
        </svg>

        <div className="flex justify-between gap-24 relative z-20">
          {/* Columna A */}
          <div className="flex-1 space-y-4">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 text-center">Columna A</div>
            {itemsA.map((item: any) => {
              const isSelected = selection?.side === 'A' && selection.id === item.id;
              const pair = respuestasPares.find((p: any) => p.itemA_id === item.id);
              const isConnected = !!pair;
              const style = isConnected ? getStableColor(item.id, PAIR_COLORS) : null;
              const canReceive = selection?.side === 'B';
              return (
                <div key={item.id} id={`match-a-${question.id}-${item.id}`}
                  onClick={() => handleItemClick('A', item.id)}
                  className={`relative p-4 rounded-xl border-2 ${!readOnly ? "cursor-pointer" : ""} transition-all duration-300 flex items-center justify-between group
                    ${isSelected ? (darkMode ? "border-indigo-500 bg-indigo-900/40 scale-[1.02]" : "border-indigo-500 bg-indigo-50 scale-[1.02]")
                      : isConnected ? (darkMode ? `${style?.darkBorder} ${style?.darkBg}` : `${style?.border} ${style?.bg}`)
                      : canReceive ? (darkMode ? "border-dashed border-indigo-700/70 bg-indigo-900/20" : "border-dashed border-indigo-300 bg-indigo-50/50")
                      : (darkMode ? "border-slate-700 bg-slate-800/80 hover:border-slate-600" : "border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md")}`}>
                  <span className={`font-medium ${isSelected ? (darkMode ? "text-indigo-300" : "text-indigo-700") : isConnected ? (darkMode ? style?.darkText : style?.text) : (darkMode ? "text-slate-300" : "text-slate-700")}`}>{item.text}</span>
                  <div className={`w-3 h-3 rounded-full border-2 absolute -right-1.5 top-1/2 -translate-y-1/2 transition-colors
                    ${isSelected ? "bg-indigo-500 border-indigo-500" : isConnected ? (darkMode ? `bg-slate-700 ${style?.darkBorder}` : `bg-white ${style?.border}`) : (darkMode ? "bg-slate-700 border-slate-500" : "bg-white border-gray-300")}`} />
                </div>
              );
            })}
          </div>

          {/* Columna B */}
          <div className="flex-1 space-y-4">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 text-center">Columna B</div>
            {itemsB.map((item: any) => {
              const isSelected = selection?.side === 'B' && selection.id === item.id;
              const pair = respuestasPares.find((p: any) => p.itemB_id === item.id);
              const isConnected = !!pair;
              const style = pair ? getStableColor(pair.itemA_id, PAIR_COLORS) : null;
              const canReceive = selection?.side === 'A';
              return (
                <div key={item.id} id={`match-b-${question.id}-${item.id}`}
                  onClick={() => handleItemClick('B', item.id)}
                  className={`relative p-4 rounded-xl border-2 ${!readOnly ? "cursor-pointer" : ""} transition-all duration-300 flex items-center group
                    ${isSelected ? (darkMode ? "border-indigo-500 bg-indigo-900/40 scale-[1.02]" : "border-indigo-500 bg-indigo-50 scale-[1.02]")
                      : isConnected ? (darkMode ? `${style?.darkBorder} ${style?.darkBg}` : `${style?.border} ${style?.bg}`)
                      : canReceive ? (darkMode ? "border-dashed border-indigo-700/70 bg-indigo-900/20" : "border-dashed border-indigo-300 bg-indigo-50/50")
                      : (darkMode ? "border-slate-700 bg-slate-800/80 hover:border-slate-600" : "border-gray-200 bg-white hover:border-gray-300")}`}>
                  <div className={`w-3 h-3 rounded-full border-2 absolute -left-1.5 top-1/2 -translate-y-1/2 transition-colors
                    ${isSelected ? "bg-indigo-500 border-indigo-500" : isConnected ? (darkMode ? `bg-slate-700 ${style?.darkBorder}` : `bg-white ${style?.border}`) : (darkMode ? "bg-slate-700 border-slate-500" : "bg-white border-gray-300")}`} />
                  <span className={`flex-1 text-right font-medium ${isConnected ? (darkMode ? style?.darkText : style?.text) : (darkMode ? "text-slate-300" : "text-slate-700")}`}>{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
