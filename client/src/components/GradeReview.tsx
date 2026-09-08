import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  MessageSquare,
  HelpCircle,
  Send,
  Edit3,
  FileText,
  Code2,
  PenLine,
  Maximize2,
  Table2,
  X,
  Clock,
  User,
  Hash,
} from "lucide-react";
import { examsAttemptsService } from "../services/examsAttempts";
import { QUESTION_COLORS, PAIR_COLORS, getStableColor } from "../utils/examUtils";
import PageLoader from "./PageLoader";
import logoUniversidadNoche from "../../assets/logo-universidad-noche.webp";
import logoUniversidad from "../../assets/logo-universidad.webp";
import Lienzo from "./DrawingBoard";
import HojaCalculo from "./Spreadsheet";
import EditorPython from "./EditorPython";
import EditorJavaScript from "./EditorJavaScript";
import EditorTexto from "./TextEditor";

// ============================================
// INTERFACES
// ============================================
interface RevisarCalificacionProps {
  intentoId: number;
  darkMode: boolean;
  onVolver: () => void;
  onGradeUpdated: (intentoId: number, notaFinal: number) => void;
  hideHeader?: boolean;
  readOnly?: boolean;
  codigoRevision?: string;
  studentMode?: boolean;
}

interface RespuestaPDF {
  id: number;
  pregunta_id: number;
  tipo_respuesta: string;
  respuesta: any;
  metadata_codigo: any;
  puntajeObtenido: number | null;
  fecha_respuesta: string;
  retroalimentacion: string | null;
}

interface AttemptDetails {
  intento: {
    id: number;
    examen_id: number;
    estado: string;
    nombre_estudiante: string;
    correo_estudiante: string | null;
    identificacion_estudiante: string | null;
    codigo_acceso: string | null;
    fecha_inicio: string;
    fecha_fin: string | null;
    puntaje: number | null;
    puntajeMaximo: number;
    porcentaje: number | null;
    notaFinal: number | null;
    progreso: number;
    esExamenPDF?: boolean;
    calificacionPendiente?: boolean;
    retroalimentacion?: string | null;
  };
  examen: {
    id: number;
    nombre: string;
    descripcion: string;
    codigoExamen: string;
    estado: string;
    nombreProfesor: string;
    archivoPDF?: string | null;
  };
  estadisticas: {
    totalPreguntas?: number;
    preguntasRespondidas?: number;
    preguntasCorrectas?: number;
    preguntasIncorrectas?: number;
    preguntasSinResponder?: number;
    tiempoTotal: number | null;
    totalRespuestas?: number;
  };
  preguntas?: Pregunta[];
  respuestasPDF?: RespuestaPDF[];
  eventos: any[];
}

interface Pregunta {
  id: number;
  enunciado: string;
  type: "test" | "open" | "fill_blanks" | "match" | "file_upload";
  puntajeMaximo: number;
  calificacionParcial: boolean;
  nombreImagen?: string;
  respuestaEstudiante: {
    id: number;
    respuestaParsed: any;
    puntajeObtenido: number;
    fecha_respuesta: string;
    retroalimentacion: string | null;
    opcionesSeleccionadas?: { id: number; texto: string; esCorrecta?: boolean }[];
    textoEscrito?: string;
    espaciosLlenados?: { posicion: number; respuestaEstudiante: string; respuestaCorrecta: string; esCorrecta: boolean }[];
    paresSeleccionados?: { itemA: { id: number; text: string }; itemB: { id: number; text: string }; esCorrecto: boolean }[];
    archivo?: { nombreArchivo: string; nombreOriginal: string | null; mimeType: string | null; tamano: number | null };
  } | null;
  opciones?: { id: number; texto: string; esCorrecta?: boolean }[];
  cantidadRespuestasCorrectas?: number;
  textoRespuesta?: string;
  keywords?: { id: number; texto: string }[];
  textoCorrecto?: string;
  respuestasCorrectas?: { id: number; posicion: number; textoCorrecto: string }[];
  paresCorrectos?: { id: number; itemA: { id: number; text: string }; itemB: { id: number; text: string } }[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const EXAMS_API_URL = import.meta.env.VITE_EXAMS_URL || window.location.origin;
const ATTEMPTS_API_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function RevisarCalificacion({
  intentoId,
  darkMode,
  onVolver,
  onGradeUpdated,
  hideHeader = false,
  readOnly = false,
  codigoRevision,
  studentMode = false,
}: RevisarCalificacionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<AttemptDetails | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [saveStatus, setSaveStatus] = useState<Record<number, SaveStatus>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [feedbackSummaryOpen, setFeedbackSummaryOpen] = useState(true);
  // PDF-specific state
  const [pdfNota, setPdfNota] = useState<string>("");
  const [pdfRetroalimentacion, setPdfRetroalimentacion] = useState<string>("");
  const [pdfSaveStatus, setPdfSaveStatus] = useState<SaveStatus>("idle");
  // Evita la doble llamada de React StrictMode en desarrollo
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    loadDetails();
  }, [intentoId, codigoRevision]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = readOnly && codigoRevision
        ? await examsAttemptsService.getAttemptFeedback(codigoRevision)
        : await examsAttemptsService.getAttemptDetails(intentoId);
      setDetails(data);

      if (data.intento?.esExamenPDF) {
        // PDF exam: initialize PDF-specific state
        setPdfNota(data.intento.puntaje != null ? String(data.intento.puntaje) : "");
        setPdfRetroalimentacion(data.intento.retroalimentacion || "");
      } else {
        // Regular exam: initialize per-question grading state
        const initialScores: Record<number, number> = {};
        const initialInputs: Record<number, string> = {};
        const initialFeedback: Record<number, string> = {};
        (data.preguntas || []).forEach((p: Pregunta) => {
          if (p.respuestaEstudiante) {
            initialScores[p.id] = p.respuestaEstudiante.puntajeObtenido;
            initialInputs[p.id] = String(p.respuestaEstudiante.puntajeObtenido);
            initialFeedback[p.id] = p.respuestaEstudiante.retroalimentacion || "";
          } else {
            initialScores[p.id] = 0;
            initialInputs[p.id] = "0";
            initialFeedback[p.id] = "";
          }
        });
        setScores(initialScores);
        setScoreInputs(initialInputs);
        setFeedback(initialFeedback);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || "Error cargando los detalles del intento.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (pregunta: Pregunta) => {
    setSaveStatus(prev => ({ ...prev, [pregunta.id]: "saving" }));
    try {
      if (!pregunta.respuestaEstudiante) {
        // El estudiante no respondió — crear registro placeholder con la nota asignada
        await examsAttemptsService.gradeUnansweredQuestion(intentoId, {
          pregunta_id: pregunta.id,
          puntaje: scores[pregunta.id] ?? 0,
          retroalimentacion: feedback[pregunta.id] || undefined,
        });
      } else {
        await examsAttemptsService.updateManualGrade(pregunta.respuestaEstudiante.id, {
          puntaje: scores[pregunta.id],
          retroalimentacion: feedback[pregunta.id],
        });
      }
      setSaveStatus(prev => ({ ...prev, [pregunta.id]: "saved" }));
      const updated = await examsAttemptsService.getAttemptDetails(intentoId);
      setDetails(updated);
      updated.preguntas.forEach((p: Pregunta) => {
        if (p.respuestaEstudiante) {
          setScores(prev => ({ ...prev, [p.id]: p.respuestaEstudiante!.puntajeObtenido }));
          setScoreInputs(prev => ({ ...prev, [p.id]: String(p.respuestaEstudiante!.puntajeObtenido) }));
          setFeedback(prev => ({ ...prev, [p.id]: p.respuestaEstudiante!.retroalimentacion || "" }));
        }
      });
      if (updated.intento.notaFinal !== null) {
        onGradeUpdated(intentoId, updated.intento.notaFinal);
      }
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [pregunta.id]: "idle" })), 2000);
    } catch {
      setSaveStatus(prev => ({ ...prev, [pregunta.id]: "error" }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [pregunta.id]: "idle" })), 3000);
    }
  };

  const handlePDFSave = async () => {
    const nota = parseFloat(pdfNota);
    if (isNaN(nota) || nota < 0 || nota > 5) return;
    setPdfSaveStatus("saving");
    try {
      await examsAttemptsService.updatePDFAttemptGrade(intentoId, {
        puntaje: nota,
        retroalimentacion: pdfRetroalimentacion || undefined,
      });
      const updated = await examsAttemptsService.getAttemptDetails(intentoId);
      setDetails(updated);
      setPdfNota(updated.intento.puntaje != null ? String(updated.intento.puntaje) : "");
      setPdfRetroalimentacion(updated.intento.retroalimentacion || "");
      setPdfSaveStatus("saved");
      if (updated.intento.notaFinal !== null) {
        onGradeUpdated(intentoId, updated.intento.notaFinal);
      }
      setTimeout(() => setPdfSaveStatus("idle"), 2000);
    } catch {
      setPdfSaveStatus("error");
      setTimeout(() => setPdfSaveStatus("idle"), 3000);
    }
  };

  const hasChanges = (pregunta: Pregunta) => {
    const currentScore = scores[pregunta.id];
    const savedScore = pregunta.respuestaEstudiante?.puntajeObtenido ?? 0;
    const savedFeedback = pregunta.respuestaEstudiante?.retroalimentacion || "";
    // Sin respuesta: permitir guardar si el profesor asignó puntos o escribió feedback
    if (!pregunta.respuestaEstudiante) {
      return (currentScore !== undefined && currentScore > 0) || !!feedback[pregunta.id];
    }
    return currentScore !== savedScore || feedback[pregunta.id] !== savedFeedback;
  };

  const getNotaColor = (nota: number | null | undefined, max?: number) => {
    if (nota === null || nota === undefined) return darkMode ? "text-slate-400" : "text-slate-500";
    if (max) {
      const pct = (nota / max) * 100;
      if (pct >= 80) return darkMode ? "text-emerald-400" : "text-emerald-600";
      if (pct >= 60) return darkMode ? "text-amber-400" : "text-amber-600";
      return darkMode ? "text-rose-400" : "text-rose-600";
    }
    if (nota >= 4.0) return darkMode ? "text-emerald-400" : "text-emerald-600";
    if (nota >= 3.0) return darkMode ? "text-amber-400" : "text-amber-600";
    return darkMode ? "text-rose-400" : "text-rose-600";
  };

  const toggleEditMode = (preguntaId: number) => {
    setEditingQuestionId(prev => (prev === preguntaId ? null : preguntaId));
  };

  // ============================================
  // LOADING / ERROR
  // ============================================
  if (loading) {
    return <PageLoader darkMode={darkMode} mensaje="Cargando revisión..." inline />;
  }

  if (error || !details) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <AlertTriangle className="w-10 h-10 text-rose-500" />
        <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{error || "No se pudieron cargar los datos."}</p>
        <button onClick={onVolver} className="px-4 py-2 text-sm font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white">Volver</button>
      </div>
    );
  }

  const { intento, examen, estadisticas, preguntas, respuestasPDF } = details;
  const isPDF = !!intento.esExamenPDF;

  const scrollbarStyles = `
    .revisar-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
    .revisar-scroll::-webkit-scrollbar-track { background: ${darkMode ? "#1e293b" : "#f1f5f9"}; border-radius: 10px; }
    .revisar-scroll::-webkit-scrollbar-thumb { background: ${darkMode ? "#475569" : "#cbd5e1"}; border-radius: 10px; border: 2px solid ${darkMode ? "#1e293b" : "#f1f5f9"}; }
    .revisar-scroll::-webkit-scrollbar-thumb:hover { background: ${darkMode ? "#64748b" : "#94a3b8"}; }
    .revisar-scroll { scrollbar-width: thin; scrollbar-color: ${darkMode ? "#475569 #1e293b" : "#cbd5e1 #f1f5f9"}; }
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }
  `;

  // ============================================
  // RENDER - Layout idéntico a ExamPanel / VerExamen
  // ============================================
  return (
    <div className={`h-full flex flex-col transition-colors duration-300 ${darkMode ? "bg-slate-900 text-gray-100" : "bg-slate-50 text-gray-900"}`}>
      <style>{scrollbarStyles}</style>
      <div className="flex-1 overflow-auto revisar-scroll">

        {/* ===== STUDENT HEADER ===== */}
        {studentMode && (
          <>
            {/* Navbar */}
            <div className={`sticky top-0 z-20 flex items-center px-4 py-2 border-b backdrop-blur-sm ${darkMode ? "bg-slate-900/95 border-slate-800" : "bg-white/95 border-gray-200"}`}>
              {!hideHeader && (
                <button onClick={onVolver} className={`flex items-center gap-1.5 text-sm font-medium transition-colors shrink-0 ${darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}>
                  <ArrowLeft className="w-4 h-4" />
                  Salir
                </button>
              )}
              <div className="flex-1 flex justify-center">
                <img
                  src={darkMode ? logoUniversidadNoche : logoUniversidad}
                  alt="Universidad de Ibagué"
                  className="h-8 sm:h-12 object-contain"
                />
              </div>
              {!hideHeader && <div className="shrink-0 w-14" />}
            </div>

            {/* Result card */}
            {(() => {
              const accentStripe = intento.calificacionPendiente
                ? "from-amber-400 to-yellow-400"
                : intento.notaFinal != null && intento.notaFinal >= 3
                  ? "from-emerald-400 to-teal-500"
                  : intento.notaFinal != null
                    ? "from-rose-400 to-red-500"
                    : "from-blue-400 to-indigo-500";
              const gradeColor = intento.calificacionPendiente
                ? (darkMode ? "text-amber-400" : "text-amber-500")
                : intento.notaFinal != null && intento.notaFinal >= 3
                  ? (darkMode ? "text-emerald-400" : "text-emerald-500")
                  : intento.notaFinal != null
                    ? (darkMode ? "text-rose-400" : "text-rose-500")
                    : (darkMode ? "text-slate-400" : "text-slate-400");
              return (
                <div className="px-4 md:px-10 pt-6 pb-2">
                  <div className={`rounded-2xl border overflow-hidden shadow-lg ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
                    {/* Accent top stripe */}
                    <div className={`h-1.5 bg-gradient-to-r ${accentStripe}`} />

                    {/* Main row */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      {/* Left: exam info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          Resultados del examen
                        </p>
                        <h1 className={`text-lg md:text-xl font-extrabold leading-tight truncate ${darkMode ? "text-white" : "text-slate-900"}`}>
                          {examen.nombre}
                        </h1>
                        <p className={`text-xs mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                          Profesor: {examen.nombreProfesor}
                        </p>
                        {/* Chips */}
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                            <User className="w-3 h-3" />{intento.nombre_estudiante}
                          </span>
                          {(estadisticas.tiempoTotal ?? 0) > 0 && (
                            <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                              <Clock className="w-3 h-3" />
                              {Math.floor(estadisticas.tiempoTotal! / 60)}m {estadisticas.tiempoTotal! % 60}s
                            </span>
                          )}
                          {intento.codigo_acceso && (
                            <span className={`flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded-full ${darkMode ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                              <Hash className="w-3 h-3" />{intento.codigo_acceso}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Divider */}
                      <div className={`w-px self-stretch mx-1 ${darkMode ? "bg-slate-700" : "bg-gray-200"}`} />

                      {/* Right: grade */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0 min-w-[90px]">
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Nota Final</p>
                        <p className={`text-5xl font-black leading-none ${gradeColor}`}>
                          {intento.notaFinal != null ? Math.round(intento.notaFinal * 100) / 100 : "--"}
                        </p>
                        <p className={`text-xs font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/ 5.0</p>
                        {intento.calificacionPendiente ? (
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${darkMode ? "bg-amber-900/20 text-amber-400 border-amber-500/30" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            Pendiente
                          </span>
                        ) : intento.notaFinal != null ? (
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            intento.notaFinal >= 3
                              ? (darkMode ? "bg-emerald-900/30 text-emerald-400 border border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border border-emerald-200")
                              : (darkMode ? "bg-rose-900/30 text-rose-400 border border-rose-500/30" : "bg-rose-50 text-rose-700 border border-rose-200")
                          }`}>
                            {intento.notaFinal >= 3 ? "Aprobado" : "Reprobado"}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Stats strip */}
                    <div className={`border-t grid divide-x ${darkMode ? "border-slate-700 divide-slate-700 bg-slate-800/40" : "border-gray-200 divide-gray-200 bg-slate-50"} ${isPDF ? "grid-cols-2" : "grid-cols-3"}`}>
                      {isPDF ? (
                        <>
                          <div className="px-4 py-3 text-center">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Respuestas</p>
                            <p className={`text-xl font-black ${darkMode ? "text-white" : "text-slate-800"}`}>{estadisticas.totalRespuestas ?? 0}</p>
                          </div>
                          <div className="px-4 py-3 text-center">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Estado</p>
                            <p className={`text-sm font-bold ${intento.calificacionPendiente ? (darkMode ? "text-amber-400" : "text-amber-600") : (darkMode ? "text-emerald-400" : "text-emerald-600")}`}>
                              {intento.calificacionPendiente ? "Pendiente" : "Calificado"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="px-4 py-3 text-center">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Puntaje</p>
                            <p className={`text-xl font-black ${darkMode ? "text-white" : "text-slate-800"}`}>
                              {intento.puntaje}<span className={`text-xs font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/{intento.puntajeMaximo}</span>
                            </p>
                          </div>
                          <div className="px-4 py-3 text-center">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Respondidas</p>
                            <p className={`text-xl font-black ${darkMode ? "text-white" : "text-slate-800"}`}>{estadisticas.preguntasRespondidas}</p>
                          </div>
                          <div className="px-4 py-3 text-center">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Sin responder</p>
                            <p className={`text-xl font-black ${darkMode ? "text-rose-400" : "text-rose-500"}`}>{estadisticas.preguntasSinResponder}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        <div className={studentMode ? "px-3 sm:px-6 md:px-10 py-4 md:py-8" : "w-full px-3 sm:px-6 md:px-12 py-4 md:py-8"}>

          {/* === HEADER (modo profesor) === */}
          {!studentMode && <header className={`mb-10 border-b pb-8 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
            {!hideHeader && (
              <button
                onClick={onVolver}
                className={`mb-4 flex items-center gap-2 text-sm font-medium transition-colors ${darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}`}
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </button>
            )}

            <div className="flex items-start gap-3 mb-3">
              <h1 className={`text-2xl sm:text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r tracking-tight ${darkMode ? "from-blue-400 to-teal-400" : "from-blue-500 to-teal-500"}`}>
                {examen.nombre}
              </h1>
              {isPDF && (
                <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${darkMode ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-indigo-50 text-indigo-600 border-indigo-200"}`}>
                  PDF
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 md:gap-6 text-sm md:text-base">
              <div className={`flex items-center gap-2 font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {intento.nombre_estudiante}
              </div>
              <div className={`flex items-center gap-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {estadisticas.tiempoTotal
                  ? `${Math.floor(estadisticas.tiempoTotal / 60)}m ${estadisticas.tiempoTotal % 60}s`
                  : "Sin tiempo registrado"}
              </div>
              {intento.codigo_acceso && (
                <div className={`flex items-center gap-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span className="text-xs">{["finished", "submitted", "finalizado", "terminado", "graded", "calificado"].includes(intento.estado?.toLowerCase() || "") ? "Código de revisión:" : "Código de acceso:"}</span>
                  <span className={`font-mono font-bold text-sm tracking-widest px-2 py-0.5 rounded ${darkMode ? "bg-slate-700 text-amber-400" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                    {intento.codigo_acceso}
                  </span>
                </div>
              )}
            </div>

            {/* Resumen de calificación - distinto para PDF y regular */}
            {isPDF ? (
              <div className={`mt-6 p-4 md:p-5 rounded-xl border shadow-sm flex flex-wrap items-center justify-between gap-3 ${darkMode ? "bg-slate-800/50 border-slate-800" : "bg-white border-gray-200"}`}>
                <div className="flex flex-wrap gap-4 md:gap-8 items-center">
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-teal-500" : "text-teal-600"}`}>Nota Final</span>
                    <p className={`text-2xl font-black ${getNotaColor(intento.notaFinal)}`}>
                      {intento.notaFinal != null ? Math.round(intento.notaFinal * 100) / 100 : "--"}
                      <span className={`text-sm font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/5.0</span>
                    </p>
                  </div>
                  {intento.calificacionPendiente ? (
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase border ${darkMode ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200"}`}>
                      Calificación pendiente
                    </span>
                  ) : (
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase border ${darkMode ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200"}`}>
                      Calificado
                    </span>
                  )}
                </div>
                <div className={`text-right text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                  <p>{estadisticas.totalRespuestas ?? 0} respuesta(s) enviada(s)</p>
                </div>
              </div>
            ) : (
              <div className={`mt-6 p-4 md:p-5 rounded-xl border shadow-sm flex flex-wrap items-center justify-between gap-3 ${darkMode ? "bg-slate-800/50 border-slate-800" : "bg-white border-gray-200"}`}>
                <div className="flex flex-wrap gap-4 md:gap-8">
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-teal-500" : "text-teal-600"}`}>Puntaje</span>
                    <p className={`text-2xl font-black ${getNotaColor(intento.puntaje, intento.puntajeMaximo)}`}>
                      {intento.puntaje}<span className={`text-sm font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/{intento.puntajeMaximo}</span>
                    </p>
                  </div>
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-teal-500" : "text-teal-600"}`}>Nota Final</span>
                    <p className={`text-2xl font-black ${getNotaColor(intento.notaFinal)}`}>
                      {intento.notaFinal !== null ? Math.round(intento.notaFinal * 100) / 100 : "--"}
                    </p>
                  </div>
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-teal-500" : "text-teal-600"}`}>Correctas</span>
                    <p className={`text-2xl font-black text-emerald-500`}>{estadisticas.preguntasCorrectas}<span className={`text-sm font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/{estadisticas.totalPreguntas}</span></p>
                  </div>
                </div>
                <div className={`text-right text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                  <p>{estadisticas.preguntasRespondidas} respondidas</p>
                  <p>{estadisticas.preguntasSinResponder} sin responder</p>
                </div>
              </div>
            )}
          </header>}

          {/* ===== PDF MODE ===== */}
          {isPDF && (
            <div className="space-y-8">
              {/* Panel de calificación */}
              {readOnly ? (
                intento.retroalimentacion ? (
                <div className={`rounded-2xl border shadow-sm overflow-hidden ${darkMode ? "bg-slate-800/60 border-slate-700" : "bg-white border-gray-200"}`}>
                  <div className={`px-6 py-4 border-b flex items-center gap-2 ${darkMode ? "border-slate-700 bg-slate-800/80" : "border-gray-200 bg-slate-50"}`}>
                    <div className={`p-1.5 rounded-md ${darkMode ? "bg-teal-500/20 text-teal-400" : "bg-teal-100 text-teal-600"}`}>
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span className={`font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                      Retroalimentación del profesor
                    </span>
                  </div>
                  <div className="p-6">
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      {intento.retroalimentacion}
                    </p>
                  </div>
                </div>
                ) : null
              ) : (
              <div className={`rounded-2xl border shadow-sm overflow-hidden ${darkMode ? "bg-slate-800/60 border-slate-700" : "bg-white border-gray-200"}`}>
                <div className={`px-6 py-4 border-b flex items-center gap-2 ${darkMode ? "border-slate-700 bg-slate-800/80" : "border-gray-200 bg-slate-50"}`}>
                  <div className={`p-1.5 rounded-md ${darkMode ? "bg-teal-500/20 text-teal-400" : "bg-teal-100 text-teal-600"}`}>
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <span className={`font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                    Asignar Calificación
                  </span>
                </div>
                <div className="p-6 flex flex-col md:flex-row gap-6">
                  {/* Nota */}
                  <div className="flex flex-col items-center gap-3 min-w-[180px]">
                    <label className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                      Nota Final (0.0 – 5.0)
                    </label>
                    <div className={`p-4 rounded-xl border flex items-center gap-4 ${darkMode ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-gray-200"}`}>
                      <button
                        onClick={() => {
                          const v = Math.max(0, parseFloat((parseFloat(pdfNota || "0") - 0.1).toFixed(1)));
                          setPdfNota(String(v));
                        }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${darkMode ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-100 text-slate-600"}`}
                      >-</button>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min={0}
                          max={5}
                          step={0.1}
                          value={pdfNota}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") { setPdfNota(""); return; }
                            const v = parseFloat(raw);
                            if (!isNaN(v)) setPdfNota(String(Math.min(5, Math.max(0, parseFloat(v.toFixed(1))))));
                          }}
                          className={`w-20 text-center text-3xl font-black bg-transparent focus:outline-none ${darkMode ? "text-white" : "text-slate-800"}`}
                        />
                        <span className={`text-xs font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/ 5.0</span>
                      </div>
                      <button
                        onClick={() => {
                          const v = Math.min(5, parseFloat((parseFloat(pdfNota || "0") + 0.1).toFixed(1)));
                          setPdfNota(String(v));
                        }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${darkMode ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-100 text-slate-600"}`}
                      >+</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 w-full">
                      {[["0.0","Reprobado","rose"],["2.5","Parcial","amber"],["5.0","Aprobado","emerald"]].map(([val, label, color]) => (
                        <button key={val} onClick={() => setPdfNota(val)}
                          className={`py-1.5 px-2 rounded text-[10px] font-bold uppercase border transition-colors ${
                            color === "rose" ? (darkMode ? "border-rose-900/30 bg-rose-900/10 text-rose-400 hover:bg-rose-900/20" : "border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100")
                            : color === "amber" ? (darkMode ? "border-amber-900/30 bg-amber-900/10 text-amber-400 hover:bg-amber-900/20" : "border-amber-100 bg-amber-50 text-amber-600 hover:bg-amber-100")
                            : (darkMode ? "border-emerald-900/30 bg-emerald-900/10 text-emerald-400 hover:bg-emerald-900/20" : "border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100")
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Retroalimentación */}
                  <div className="flex-1 flex flex-col gap-2">
                    <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                      <MessageSquare className="w-3.5 h-3.5" />
                      Retroalimentación general
                    </label>
                    <textarea
                      value={pdfRetroalimentacion}
                      onChange={(e) => setPdfRetroalimentacion(e.target.value)}
                      placeholder="Escribe aquí la retroalimentación para el estudiante. Puedes detallar cada punto del examen, errores encontrados, sugerencias, etc."
                      rows={14}
                      maxLength={10000}
                      className={`w-full p-4 rounded-xl border resize-y transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
                        darkMode
                          ? "bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-teal-500/50"
                          : "bg-white border-gray-200 text-slate-700 placeholder:text-slate-400 focus:border-teal-400"
                      }`}
                    />
                    <span className={`text-xs text-right ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      {pdfRetroalimentacion.length} / 10 000
                    </span>
                    <button
                      onClick={handlePDFSave}
                      disabled={pdfSaveStatus === "saving" || pdfNota === ""}
                      className={`self-end px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2 ${
                        pdfSaveStatus === "saved"
                          ? "bg-emerald-600 text-white shadow-emerald-500/20"
                          : pdfSaveStatus === "error"
                            ? "bg-rose-600 text-white shadow-rose-500/20"
                            : pdfSaveStatus === "saving" || pdfNota === ""
                              ? (darkMode ? "bg-slate-700 text-slate-500 cursor-not-allowed shadow-none" : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none")
                              : "bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white shadow-teal-500/25 hover:-translate-y-0.5"
                      }`}
                    >
                      {pdfSaveStatus === "saving" && <Loader2 className="w-4 h-4 animate-spin" />}
                      {pdfSaveStatus === "saved" && <CheckCircle className="w-4 h-4" />}
                      {pdfSaveStatus === "error" && <XCircle className="w-4 h-4" />}
                      {pdfSaveStatus === "idle" && <Send className="w-4 h-4" />}
                      {pdfSaveStatus === "saving" ? "Guardando..." : pdfSaveStatus === "saved" ? "Guardado" : pdfSaveStatus === "error" ? "Error al guardar" : "Guardar Calificación"}
                    </button>
                  </div>
                </div>
              </div>
              )}

              {/* Respuestas del estudiante */}
              <div>
                <h2 className={`text-lg font-bold mb-4 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
                  Respuestas del estudiante
                </h2>
                {(respuestasPDF || []).length === 0 ? (
                  <div className={`p-10 rounded-2xl border-2 border-dashed text-center ${darkMode ? "border-slate-700 text-slate-500" : "border-gray-300 text-gray-400"}`}>
                    <HelpCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">El estudiante no envió respuestas</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {[...(respuestasPDF || [])]
                      .filter(resp => {
                        if (resp.tipo_respuesta === "sin_respuesta") return false;
                        if (!["python", "javascript"].includes(resp.tipo_respuesta)) return true;
                        let content: any = resp.respuesta;
                        if (typeof content === "string") { try { content = JSON.parse(content); } catch { return true; } }
                        if (!Array.isArray(content) || content.length !== 1) return true;
                        const cell = content[0];
                        const defaults: Record<string, string> = { python: "# Editor Python", javascript: "# Editor JavaScript" };
                        const cellContent = String(cell.content ?? "").trim();
                        return !((cell.type === "markdown" || cell.type === "text") && (cellContent === defaults[resp.tipo_respuesta] || cellContent === ""));
                      })
                      .sort((a, b) => {
                        const ORDER: Record<string, number> = {
                          normal: 0, texto_plano: 0,
                          hoja_calculo: 1,
                          diagrama: 2,
                          javascript: 3,
                          python: 4,
                        };
                        const oa = ORDER[a.tipo_respuesta] ?? 99;
                        const ob = ORDER[b.tipo_respuesta] ?? 99;
                        return oa - ob;
                      }).map((resp, idx) => (
                        <RenderPDFRespuesta key={resp.id} respuesta={resp} index={idx} darkMode={darkMode} disableRun={readOnly} tallContent={studentMode} />
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== RESUMEN RETROALIMENTACIONES (readOnly + mobile) ===== */}
          {!isPDF && readOnly && preguntas?.some(p => p.respuestaEstudiante?.retroalimentacion) && (
            <div className={`xl:hidden mb-6 rounded-2xl border overflow-hidden shadow-sm ${darkMode ? "bg-slate-800/60 border-teal-700/40" : "bg-white border-teal-200"}`}>
              <button
                onClick={() => setFeedbackSummaryOpen(o => !o)}
                className={`w-full flex items-center justify-between px-4 py-3 ${darkMode ? "bg-slate-800/80" : "bg-teal-50"}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md ${darkMode ? "bg-teal-500/20 text-teal-400" : "bg-teal-100 text-teal-600"}`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <span className={`font-bold text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                    Retroalimentación del profesor
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${darkMode ? "bg-teal-900/40 text-teal-400" : "bg-teal-100 text-teal-700"}`}>
                    {preguntas.filter(p => p.respuestaEstudiante?.retroalimentacion).length}
                  </span>
                </div>
                <svg className={`w-4 h-4 transition-transform ${feedbackSummaryOpen ? "rotate-180" : ""} ${darkMode ? "text-slate-400" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {feedbackSummaryOpen && (
                <div className="divide-y">
                  {preguntas.filter(p => p.respuestaEstudiante?.retroalimentacion).map((p) => (
                    <div key={p.id} className={`px-4 py-3 ${darkMode ? "divide-slate-700 bg-slate-800/40" : "divide-gray-100 bg-white"}`}>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Pregunta {preguntas.indexOf(p) + 1}
                      </p>
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                        {p.respuestaEstudiante!.retroalimentacion}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== HERRAMIENTAS EN EXAMEN MANUAL ===== */}
          {!isPDF && (respuestasPDF || []).length > 0 && (
            <div className="space-y-6 mb-10">
              <h2 className={`text-lg font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
                Herramientas utilizadas
              </h2>
              <div className="space-y-6">
                {[...(respuestasPDF || [])]
                  .filter(resp => {
                    if (!["python", "javascript"].includes(resp.tipo_respuesta)) return true;
                    let content: any = resp.respuesta;
                    if (typeof content === "string") { try { content = JSON.parse(content); } catch { return true; } }
                    if (!Array.isArray(content) || content.length !== 1) return true;
                    const cell = content[0];
                    const defaults: Record<string, string> = { python: "# Editor Python", javascript: "# Editor JavaScript" };
                    const cellContent = String(cell.content ?? "").trim();
                    return !((cell.type === "markdown" || cell.type === "text") && (cellContent === defaults[resp.tipo_respuesta] || cellContent === ""));
                  })
                  .sort((a, b) => {
                    const ORDER: Record<string, number> = { normal: 0, texto_plano: 0, hoja_calculo: 1, diagrama: 2, javascript: 3, python: 4 };
                    return (ORDER[a.tipo_respuesta] ?? 99) - (ORDER[b.tipo_respuesta] ?? 99);
                  })
                  .map((resp, idx) => (
                    <RenderPDFRespuesta key={resp.id} respuesta={resp} index={idx} darkMode={darkMode} disableRun={readOnly} tallContent={studentMode} />
                  ))}
              </div>
            </div>
          )}

          {/* ===== REGULAR MODE - PREGUNTAS ===== */}
          {!isPDF && (
          <div className="space-y-12">
            {(preguntas || []).map((pregunta, index) => {
              const barColor = getStableColor(pregunta.id, QUESTION_COLORS);
              const resp = pregunta.respuestaEstudiante;
              const currentScore = Math.round((scores[pregunta.id] ?? (resp ? resp.puntajeObtenido : 0)) * 100) / 100;
              const pctScore = (currentScore / pregunta.puntajeMaximo) * 100;
              const status = saveStatus[pregunta.id] || "idle";
              const isEditing = editingQuestionId === pregunta.id;

              return (
                <div
                  key={pregunta.id}
                  className={`group relative rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden ${
                    darkMode
                      ? "bg-slate-800/60 border-slate-800 hover:border-blue-700/80"
                      : "bg-white border-gray-200 hover:shadow-lg hover:border-blue-300"
                  }`}
                >
                  {/* Barra lateral de color - idéntica a ExamPanel */}
                  <div className={`absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b ${barColor}`}></div>

                  <div className="flex flex-col xl:flex-row items-stretch">
                    {/* CONTENIDO PRINCIPAL */}
                    <div className="flex-1 p-4 sm:p-8 md:p-10 pl-6 sm:pl-10 md:pl-14 min-w-0">
                      <div className="flex items-start gap-3 sm:gap-5 mb-4 sm:mb-8">
                        {/* Columna Izquierda: Número */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-3">
                        <span className={`flex items-center justify-center w-8 h-8 sm:w-11 sm:h-11 rounded-xl font-bold text-sm sm:text-base shrink-0 transition-all duration-300 ${
                            !resp && currentScore === 0
                              ? (darkMode ? "bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-500")
                              : pctScore >= 80
                                ? (darkMode ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50" : "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200")
                                : pctScore >= 60
                                  ? (darkMode ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50" : "bg-amber-100 text-amber-600 ring-1 ring-amber-200")
                                  : (darkMode ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/50" : "bg-rose-100 text-rose-600 ring-1 ring-rose-200")
                          }`}>
                          {index + 1}
                        </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className={`rich-text-content text-base sm:text-xl md:text-2xl font-medium font-serif leading-snug break-words ${darkMode ? "text-gray-100" : "text-gray-900"}`}
                            dangerouslySetInnerHTML={{ __html: pregunta.enunciado }}
                          />
                          <div className="flex items-center gap-3 mt-2">
                            <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${darkMode ? "bg-slate-700/60 text-slate-400" : "bg-gray-100 text-slate-500"}`}>
                              {pregunta.type === "test" ? "Selección Múltiple" : pregunta.type === "open" ? "Pregunta Abierta" : pregunta.type === "match" ? "Emparejamiento" : pregunta.type === "file_upload" ? "Subir archivo" : "Completar"}
                            </span>
                          </div>
                        </div>

                        {/* Botón de Puntaje a la Derecha */}
                        <div className="flex-shrink-0">
                          {readOnly ? (
                            resp?.retroalimentacion ? (
                              <div className={`flex flex-col items-center justify-center min-w-[80px] px-3 py-2 rounded-xl border ${darkMode ? "bg-slate-800 border-teal-700/40 text-slate-400" : "bg-white border-teal-200 text-slate-600"}`}>
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Nota</span>
                                <span className={`text-2xl font-black ${currentScore > 0 ? (darkMode ? "text-emerald-400" : "text-emerald-600") : (darkMode ? "text-slate-500" : "text-slate-400")}`}>{currentScore}</span>
                                <span className={`text-xs font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/ {pregunta.puntajeMaximo}</span>
                              </div>
                            ) : (
                              <div className={`flex flex-col items-center justify-center min-w-[80px] px-3 py-2 rounded-xl border ${darkMode ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-white border-gray-200 text-slate-600"}`}>
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Nota</span>
                                <span className={`text-2xl font-black ${currentScore > 0 ? (darkMode ? "text-emerald-400" : "text-emerald-600") : (darkMode ? "text-slate-500" : "text-slate-400")}`}>{currentScore}</span>
                                <span className={`text-xs font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/ {pregunta.puntajeMaximo}</span>
                              </div>
                            )
                          ) : (
                          <button
                            onClick={() => toggleEditMode(pregunta.id)}
                            className={`flex flex-col items-center justify-center min-w-[80px] px-3 py-2 rounded-xl border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                              isEditing
                                ? (darkMode ? "bg-blue-500/20 border-blue-500/50 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-700")
                                : (darkMode ? "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750" : "bg-white border-gray-200 text-slate-600 hover:bg-gray-50")
                            }`}
                            title="Clic para calificar"
                          >
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">Nota</span>
                            <span className={`text-2xl font-black ${
                              currentScore > 0
                                ? (darkMode ? "text-emerald-400" : "text-emerald-600")
                                : (darkMode ? "text-slate-500" : "text-slate-400")
                            }`}>
                              {currentScore}
                            </span>
                            <span className={`text-xs font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>/ {pregunta.puntajeMaximo}</span>
                          </button>
                          )}
                        </div>
                      </div>

                      {/* Imagen */}
                      {pregunta.nombreImagen && (
                        <div className={`mb-6 rounded-xl overflow-hidden border flex justify-center p-4 ${darkMode ? "bg-slate-900/50 border-slate-700" : "bg-white border-gray-200"}`}>
                          <img
                            src={pregunta.nombreImagen.startsWith('data:') || pregunta.nombreImagen.startsWith('http')
                              ? pregunta.nombreImagen
                              : `${EXAMS_API_URL}/api/images/${pregunta.nombreImagen}`}
                            alt="Referencia visual"
                            className="max-h-80 object-contain rounded-lg shadow-sm"
                          />
                        </div>
                      )}

                      {/* Respuesta del estudiante */}
                      <div className="mt-4">
                        {!resp && (
                          <div className={`mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${
                            darkMode ? "border-amber-700/40 bg-amber-900/20 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}>
                            <HelpCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="text-sm font-medium">El estudiante no respondió esta pregunta</span>
                          </div>
                        )}
                        {pregunta.type === "test" && <RenderTest pregunta={pregunta} darkMode={darkMode} />}
                        {pregunta.type === "open" && <RenderOpen pregunta={pregunta} darkMode={darkMode} />}
                        {pregunta.type === "fill_blanks" && <RenderFillBlanks pregunta={pregunta} darkMode={darkMode} />}
                        {pregunta.type === "match" && <RenderMatch pregunta={pregunta} darkMode={darkMode} />}
                        {pregunta.type === "file_upload" && <RenderFileUpload pregunta={pregunta} darkMode={darkMode} />}
                      </div>
                    </div>

                    {/* PANEL LATERAL DE CALIFICACIÓN — solo escritorio */}
                    {readOnly && resp?.retroalimentacion && (
                      <div className={`hidden xl:flex xl:w-80 xl:border-l flex-col flex-shrink-0 ${darkMode ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-gray-200"}`}>
                        <div className={`p-4 border-b flex items-center gap-2 ${darkMode ? "border-slate-700 bg-slate-800/50" : "border-gray-200 bg-white"}`}>
                          <div className={`p-1.5 rounded-md ${darkMode ? "bg-teal-500/20 text-teal-400" : "bg-teal-100 text-teal-600"}`}>
                            <MessageSquare className="w-4 h-4" />
                          </div>
                          <span className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                            Retroalimentación
                          </span>
                        </div>
                        <div className={`p-5 text-sm leading-relaxed whitespace-pre-wrap break-words ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                          {resp.retroalimentacion}
                        </div>
                      </div>
                    )}
                    {!readOnly && isEditing && (
                      <div className={`w-full xl:w-80 border-t xl:border-t-0 xl:border-l flex flex-col transition-all flex-shrink-0 ${
                        darkMode ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-gray-200"
                      }`}>
                        {/* Header del panel */}
                        <div className={`p-4 border-b flex items-center justify-between ${darkMode ? "border-slate-700 bg-slate-800/50" : "border-gray-200 bg-white"}`}>
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-md ${darkMode ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"}`}>
                              <Edit3 className="w-4 h-4" />
                            </div>
                            <span className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                              Evaluar Respuesta
                            </span>
                          </div>
                          <button 
                            onClick={() => toggleEditMode(pregunta.id)}
                            className={`p-1 rounded-md transition-colors ${darkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-200 text-slate-500"}`}
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-6">
                          
                          {/* Sección de Puntaje */}
                          <div>
                            <label className={`text-xs font-bold uppercase tracking-wider mb-3 block ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              Asignar Puntaje
                            </label>
                            
                            <div className={`p-4 rounded-xl border flex flex-col items-center gap-3 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
                              <div className="flex items-center gap-4 w-full justify-center">
                                 <button
                                    onClick={() => {
                                      const current = parseFloat(scoreInputs[pregunta.id] || "0");
                                      const val = Math.max(0, parseFloat((current - 0.1).toFixed(1)));
                                      setScoreInputs(prev => ({ ...prev, [pregunta.id]: val.toString() }));
                                      setScores(prev => ({ ...prev, [pregunta.id]: val }));
                                    }}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${darkMode ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-100 text-slate-600"}`}
                                 >
                                    -
                                 </button>
                                 
                                 <div className="flex flex-col items-center">
                                   <input
                                      type="number"
                                      min={0}
                                      max={pregunta.puntajeMaximo}
                                      step={0.1}
                                      value={scoreInputs[pregunta.id] ?? "0"}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === "") {
                                          setScoreInputs(prev => ({ ...prev, [pregunta.id]: raw }));
                                          return;
                                        }
                                        const val = parseFloat(raw);
                                        if (!isNaN(val)) {
                                          if (val > pregunta.puntajeMaximo) {
                                            setScoreInputs(prev => ({ ...prev, [pregunta.id]: String(pregunta.puntajeMaximo) }));
                                            setScores(prev => ({ ...prev, [pregunta.id]: pregunta.puntajeMaximo }));
                                          } else if (val >= 0) {
                                            setScoreInputs(prev => ({ ...prev, [pregunta.id]: raw }));
                                            setScores(prev => ({ ...prev, [pregunta.id]: val }));
                                          }
                                        }
                                      }}
                                      className={`w-20 text-center text-3xl font-black bg-transparent focus:outline-none ${darkMode ? "text-white" : "text-slate-800"}`}
                                   />
                                   <span className={`text-xs font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                     / {pregunta.puntajeMaximo} pts
                                   </span>
                                 </div>

                                 <button
                                    onClick={() => {
                                      const current = parseFloat(scoreInputs[pregunta.id] || "0");
                                      const val = Math.min(pregunta.puntajeMaximo, parseFloat((current + 0.1).toFixed(1)));
                                      setScoreInputs(prev => ({ ...prev, [pregunta.id]: val.toString() }));
                                      setScores(prev => ({ ...prev, [pregunta.id]: val }));
                                    }}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${darkMode ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-100 text-slate-600"}`}
                                 >
                                    +
                                 </button>
                              </div>

                              {/* Botones rápidos */}
                              <div className="grid grid-cols-3 gap-2 w-full mt-1">
                                <button
                                  onClick={() => {
                                     setScoreInputs(prev => ({ ...prev, [pregunta.id]: "0" }));
                                     setScores(prev => ({ ...prev, [pregunta.id]: 0 }));
                                  }}
                                  className={`py-1.5 px-2 rounded text-[10px] font-bold uppercase border transition-colors ${darkMode ? "border-rose-900/30 bg-rose-900/10 text-rose-400 hover:bg-rose-900/20" : "border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100"}`}
                                >
                                  Incorrecto
                                </button>
                                <button
                                  onClick={() => {
                                     const half = pregunta.puntajeMaximo / 2;
                                     setScoreInputs(prev => ({ ...prev, [pregunta.id]: half.toString() }));
                                     setScores(prev => ({ ...prev, [pregunta.id]: half }));
                                  }}
                                  className={`py-1.5 px-2 rounded text-[10px] font-bold uppercase border transition-colors ${darkMode ? "border-amber-900/30 bg-amber-900/10 text-amber-400 hover:bg-amber-900/20" : "border-amber-100 bg-amber-50 text-amber-600 hover:bg-amber-100"}`}
                                >
                                  Parcial
                                </button>
                                <button
                                  onClick={() => {
                                     setScoreInputs(prev => ({ ...prev, [pregunta.id]: pregunta.puntajeMaximo.toString() }));
                                     setScores(prev => ({ ...prev, [pregunta.id]: pregunta.puntajeMaximo }));
                                  }}
                                  className={`py-1.5 px-2 rounded text-[10px] font-bold uppercase border transition-colors ${darkMode ? "border-emerald-900/30 bg-emerald-900/10 text-emerald-400 hover:bg-emerald-900/20" : "border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
                                >
                                  Correcto
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Sección de Retroalimentación */}
                          <div className="flex-1 flex flex-col min-h-0">
                            <label className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              <MessageSquare className="w-3.5 h-3.5" />
                              Retroalimentación
                            </label>
                            <textarea
                              value={feedback[pregunta.id] || ""}
                              onChange={(e) => setFeedback(prev => ({ ...prev, [pregunta.id]: e.target.value }))}
                              placeholder="Escribe tus observaciones aquí..."
                              maxLength={2000}
                              className={`flex-1 w-full p-4 rounded-xl border resize-none transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                darkMode
                                  ? "bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50"
                                  : "bg-white border-gray-200 text-slate-700 placeholder:text-slate-400 focus:border-blue-400"
                              }`}
                            />
                          </div>
                        </div>

                        {/* Botón guardar */}
                        <div className={`p-4 border-t ${darkMode ? "border-slate-700 bg-slate-800/30" : "border-gray-200 bg-gray-50"}`}>
                          <button
                            onClick={() => handleSave(pregunta)}
                            disabled={status === "saving" || !hasChanges(pregunta)}
                            className={`w-full py-3 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                              status === "saved"
                                ? "bg-emerald-600 text-white shadow-emerald-500/20"
                                : status === "error"
                                  ? "bg-rose-600 text-white shadow-rose-500/20"
                                  : !hasChanges(pregunta)
                                    ? (darkMode ? "bg-slate-700 text-slate-500 cursor-not-allowed shadow-none" : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none")
                                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
                            }`}
                          >
                            {status === "saving" && <Loader2 className="w-4 h-4 animate-spin" />}
                            {status === "saved" && <CheckCircle className="w-4 h-4" />}
                            {status === "error" && <XCircle className="w-4 h-4" />}
                            {status === "idle" && <Send className="w-4 h-4" />}
                            
                            {status === "saving" ? "Guardando..." : status === "saved" ? "Guardado" : status === "error" ? "Error" : "Guardar Cambios"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}

        </div>
      </div>

    </div>
  );
}

// ============================================
// SUB-COMPONENTES PDF
// ============================================

const TIPO_LABELS: Record<string, string> = {
  normal: "Respuesta de texto",
  texto_plano: "Texto",
  python: "Python",
  javascript: "JavaScript",
  diagrama: "Diagrama / Lienzo",
  hoja_calculo: "Hoja de Cálculo",
};

function RenderPDFRespuesta({ respuesta, index, darkMode, disableRun = false, tallContent = false }: { respuesta: RespuestaPDF; index: number; darkMode: boolean; disableRun?: boolean; tallContent?: boolean }) {
  const tipo = respuesta.tipo_respuesta;
  // Ensure structured types are always parsed objects/strings, not raw JSON-encoded values
  const content = (() => {
    const raw = respuesta.respuesta;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return raw;
  })();
  const meta = respuesta.metadata_codigo;
  const label = TIPO_LABELS[tipo] || tipo;
  const [showDiagramModal, setShowDiagramModal] = useState(false);
  const [showSpreadsheetModal, setShowSpreadsheetModal] = useState(false);

  const [runMode, setRunMode] = useState(false);

  const borderColor = darkMode ? "border-slate-700" : "border-gray-200";
  const cardBg = darkMode ? "bg-slate-800/60" : "bg-white";
  const headerBg = darkMode ? "bg-slate-800/80" : "bg-slate-50";

  // Color accent por tipo
  const TIPO_ACCENT: Record<string, { stripe: string; badge: string; icon: string }> = {
    normal:       { stripe: "from-blue-400 to-indigo-500",    badge: darkMode ? "bg-blue-900/40 text-blue-300"    : "bg-blue-50 text-blue-600 border border-blue-200",    icon: darkMode ? "text-blue-400"    : "text-blue-500" },
    texto_plano:  { stripe: "from-blue-400 to-indigo-500",    badge: darkMode ? "bg-blue-900/40 text-blue-300"    : "bg-blue-50 text-blue-600 border border-blue-200",    icon: darkMode ? "text-blue-400"    : "text-blue-500" },
    hoja_calculo: { stripe: "from-emerald-400 to-teal-500",   badge: darkMode ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-50 text-emerald-600 border border-emerald-200", icon: darkMode ? "text-emerald-400" : "text-emerald-600" },
    diagrama:     { stripe: "from-violet-400 to-purple-500",  badge: darkMode ? "bg-violet-900/40 text-violet-300" : "bg-violet-50 text-violet-600 border border-violet-200", icon: darkMode ? "text-violet-400"  : "text-violet-500" },
    javascript:   { stripe: "from-amber-400 to-yellow-500",   badge: darkMode ? "bg-amber-900/40 text-amber-300"  : "bg-amber-50 text-amber-600 border border-amber-200",   icon: darkMode ? "text-amber-400"   : "text-amber-600" },
    python:       { stripe: "from-sky-400 to-blue-500",       badge: darkMode ? "bg-sky-900/40 text-sky-300"      : "bg-sky-50 text-sky-600 border border-sky-200",         icon: darkMode ? "text-sky-400"     : "text-sky-500" },
  };
  const accent = TIPO_ACCENT[tipo] ?? { stripe: "from-slate-400 to-slate-500", badge: darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-500 border border-slate-200", icon: darkMode ? "text-slate-400" : "text-slate-500" };

  // Normaliza el contenido a array de celdas para pasarlo a los editores
  const editorCells = (() => {
    if (Array.isArray(content)) return content;
    return [{ id: "1", type: "code", content: String(content ?? ""), status: "idle", output: [] }];
  })();

  const tipoIcon = () => {
    if (tipo === "diagrama") return <PenLine className="w-4 h-4" />;
    if (tipo === "hoja_calculo") return <Table2 className="w-4 h-4" />;
    if (["python", "javascript"].includes(tipo)) return <Code2 className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className={`rounded-2xl border overflow-hidden ${darkMode ? "shadow-sm" : "shadow-md"} ${cardBg} ${borderColor}`}>
      {/* Franja de color por tipo */}
      <div className={`h-1.5 bg-gradient-to-r ${accent.stripe}`} />

      <div className={`px-5 py-3 border-b flex items-center gap-3 ${headerBg} ${borderColor}`}>
        {/* Número */}
        <span className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-black shrink-0 ${accent.badge}`}>
          {index + 1}
        </span>
        {/* Icono + nombre del tipo */}
        <span className={`flex items-center gap-1.5 flex-1 font-semibold text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
          <span className={accent.icon}>{tipoIcon()}</span>
          {label}
        </span>
        <div className="flex items-center gap-2">
          {(tipo === "python" || tipo === "javascript") && !disableRun && (
            <button
              onClick={() => setRunMode(r => !r)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                runMode
                  ? darkMode ? "bg-emerald-700 text-white border-emerald-600 hover:bg-emerald-600" : "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700"
                  : darkMode ? "bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              {runMode ? "Ver código" : "Ejecutar"}
            </button>
          )}
          {tipo === "diagrama" && content?.sheets && (
            <button
              onClick={() => setShowDiagramModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${darkMode ? "bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Ampliar
            </button>
          )}
          {tipo === "hoja_calculo" && content?.sheets && (
            <button
              onClick={() => setShowSpreadsheetModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${darkMode ? "bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Ampliar
            </button>
          )}
        </div>
      </div>
      <div className={tallContent ? "p-7" : "p-5"}>
        {(tipo === "normal" || tipo === "texto_plano") && (
          content
            ? <EditorTexto readOnly value={String(content)} darkMode={darkMode} minHeight="80px" />
            : <div className={`w-full min-h-[80px] p-4 rounded-xl border-2 text-sm italic opacity-50 ${darkMode ? "bg-slate-900/40 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-slate-400"}`}>Sin contenido</div>
        )}

        {["python", "javascript"].includes(tipo) && (
          <div className="space-y-3">
            {/* Editor de ejecución (Python y JavaScript) */}
            {runMode && tipo === "python" && (
              <div style={{ minHeight: 400 }}>
                <EditorPython darkMode={darkMode} initialCells={editorCells} viewMode />
              </div>
            )}
            {runMode && tipo === "javascript" && (
              <div style={{ minHeight: 400 }}>
                <EditorJavaScript darkMode={darkMode} initialCells={editorCells} viewMode />
              </div>
            )}

            {/* Vista estática del código (cuando no está en runMode) */}
            {!runMode && (
              <>
                {Array.isArray(content) ? (
                  content.map((cell: any, ci: number) => {
                    const cellContent = String(cell.content ?? cell.code ?? cell ?? "");
                    const rawOutput = cell.output;
                    const cellOutput = Array.isArray(rawOutput)
                      ? rawOutput.join("\n")
                      : rawOutput ? String(rawOutput) : "";
                    const isMarkdown = cell.type === "markdown";
                    const isHtml = cell.type === "html";
                    const isSuccess = cell.status === "success";
                    const isError = cell.status === "error";
                    const hasOutput = cellOutput.trim().length > 0;

                    return (
                      <div key={ci} className={`rounded-xl overflow-hidden border ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
                        {/* Header de celda */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 border-b text-xs ${darkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-gray-200"}`}>
                          <span className={`font-mono font-bold text-[10px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>[{ci + 1}]</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                            isMarkdown
                              ? darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-50 text-blue-600"
                              : isHtml
                              ? darkMode ? "bg-orange-900/50 text-orange-300" : "bg-orange-50 text-orange-600"
                              : tipo === "python"
                              ? darkMode ? "bg-yellow-900/50 text-yellow-300" : "bg-yellow-50 text-yellow-700"
                              : darkMode ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                          }`}>
                            {isMarkdown ? "texto" : isHtml ? "HTML" : tipo === "python" ? "Python" : "JavaScript"}
                          </span>
                          {(isSuccess || isError) && (
                            <span className={`ml-auto flex items-center gap-1 font-medium ${isSuccess ? "text-emerald-400" : "text-red-400"}`}>
                              <span>{isSuccess ? "✓" : "✗"}</span>
                              {cell.executionTime != null && <span className="text-[10px] opacity-70">{cell.executionTime}ms</span>}
                            </span>
                          )}
                        </div>

                        {/* Contenido: markdown o código */}
                        {isMarkdown ? (
                          <div className={`px-4 py-3 text-sm leading-relaxed ${darkMode ? "bg-slate-800/40 text-slate-300" : "bg-slate-50/50 text-slate-700"}`}>
                            {cellContent.split("\n").map((line, li) => {
                              if (line.startsWith("### ")) return <h3 key={li} className="text-sm font-bold mt-1 mb-0.5">{line.slice(4)}</h3>;
                              if (line.startsWith("## ")) return <h2 key={li} className="text-base font-bold mt-1 mb-0.5">{line.slice(3)}</h2>;
                              if (line.startsWith("# ")) return <h1 key={li} className="text-lg font-bold mt-1 mb-0.5">{line.slice(2)}</h1>;
                              return <p key={li} className={line.trim() ? "mb-0.5" : "h-2"}>{line || ""}</p>;
                            })}
                          </div>
                        ) : (
                          <pre className={`px-4 py-3 font-mono text-sm overflow-x-auto leading-relaxed whitespace-pre-wrap break-words ${darkMode ? "bg-[#0d1117] text-emerald-300" : "bg-gray-950 text-emerald-400"}`}>
                            <code>{cellContent}</code>
                          </pre>
                        )}

                        {/* Output */}
                        {hasOutput && (
                          <div className={`border-t px-4 py-2.5 ${
                            isError
                              ? darkMode ? "bg-red-900/20 border-red-800" : "bg-red-50 border-red-200"
                              : darkMode ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"
                          }`}>
                            <div className={`flex items-center gap-1.5 mb-1 text-[10px] font-semibold uppercase tracking-wider ${isError ? "text-red-400" : darkMode ? "text-slate-500" : "text-slate-400"}`}>
                              <span>{isError ? "✗" : "▶"}</span>
                              <span>Output</span>
                            </div>
                            <pre className={`text-xs font-mono whitespace-pre-wrap ${isError ? "text-red-300" : darkMode ? "text-slate-300" : "text-slate-600"}`}>{cellOutput}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className={`rounded-xl overflow-hidden border ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 border-b text-xs ${darkMode ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-slate-100 border-gray-200 text-slate-500"}`}>
                      <span className="font-mono font-bold text-[10px] opacity-50">[1]</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${darkMode ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>{tipo}</span>
                    </div>
                    <pre className={`px-4 py-3 font-mono text-sm overflow-x-auto leading-relaxed whitespace-pre-wrap break-words ${darkMode ? "bg-[#0d1117] text-emerald-300" : "bg-gray-950 text-emerald-400"}`}>
                      <code>{typeof content === "string" ? content : JSON.stringify(content, null, 2)}</code>
                    </pre>
                  </div>
                )}
                {/* Metadata summary */}
                {meta && (
                  <div className={`flex gap-4 text-xs pt-1 ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
                    {meta.totalCells != null && <span>{meta.totalCells} celda(s)</span>}
                    {meta.codeCells != null && <span>{meta.codeCells} de código</span>}
                    {meta.textCells != null && <span>{meta.textCells} de texto</span>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tipo === "diagrama" && (
          <div className="space-y-3">
            {content && content.sheets ? (
              <>
                {/* Preview clicable */}
                <div
                  className="rounded-xl overflow-hidden cursor-pointer"
                  style={{ height: 400 }}
                  onClick={() => setShowDiagramModal(true)}
                  title="Hacer clic para ampliar"
                >
                  <div className="pointer-events-none w-full h-full">
                    <Lienzo readOnly darkMode={darkMode} initialData={content} />
                  </div>
                </div>

                {/* Modal pantalla completa */}
                {showDiagramModal && createPortal(
                  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                      onClick={() => setShowDiagramModal(false)}
                    />
                    <div
                      className={`relative w-full h-full max-w-[95vw] max-h-[90vh] rounded-2xl shadow-2xl border flex flex-col overflow-hidden ${darkMode ? "border-slate-700" : "border-slate-200"}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Barra de cierre */}
                      <div className={`flex items-center justify-between px-4 py-2 flex-shrink-0 border-b ${darkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200"}`}>
                        <span className={`text-xs font-semibold flex items-center gap-1.5 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                          <PenLine className="w-3.5 h-3.5" /> Diagrama
                        </span>
                        <button
                          onClick={() => setShowDiagramModal(false)}
                          className={`p-1.5 rounded-lg transition-colors ${darkMode ? "text-slate-400 hover:bg-red-900/30 hover:text-red-400" : "text-slate-500 hover:bg-red-50 hover:text-red-500"}`}
                          title="Cerrar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <Lienzo readOnly darkMode={darkMode} initialData={content} />
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </>
            ) : (
              <div className={`p-5 rounded-xl border-2 border-dashed text-center text-sm ${darkMode ? "border-slate-600 text-slate-500" : "border-gray-300 text-gray-400"}`}>
                <PenLine className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p>Sin datos del diagrama.</p>
              </div>
            )}
          </div>
        )}

        {tipo === "hoja_calculo" && (
          <div className="space-y-3">
            {content && content.sheets ? (
              <>
                {/* Preview clicable */}
                <div
                  className="rounded-xl overflow-hidden cursor-pointer border border-gray-200 dark:border-slate-700"
                  style={{ height: 400 }}
                  onClick={() => setShowSpreadsheetModal(true)}
                  title="Hacer clic para ampliar"
                >
                  <div className="pointer-events-none w-full h-full">
                    <HojaCalculo readOnly darkMode={darkMode} initialData={content} />
                  </div>
                </div>

                {/* Metadata summary */}
                {meta && (
                  <div className={`flex gap-4 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    {meta.sheetsCount != null && <span>{meta.sheetsCount} hoja(s)</span>}
                    {meta.totalCells != null && <span>{meta.totalCells} celda(s)</span>}
                    {meta.chartsCount != null && meta.chartsCount > 0 && <span>{meta.chartsCount} gráfica(s)</span>}
                  </div>
                )}

                {/* Modal pantalla completa */}
                {showSpreadsheetModal && createPortal(
                  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                      onClick={() => setShowSpreadsheetModal(false)}
                    />
                    <div
                      className={`relative w-full h-full max-w-[95vw] max-h-[90vh] rounded-2xl shadow-2xl border flex flex-col overflow-hidden ${darkMode ? "border-slate-700" : "border-slate-200"}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Barra de cierre */}
                      <div className={`flex items-center justify-between px-4 py-2 flex-shrink-0 border-b ${darkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200"}`}>
                        <span className={`text-xs font-semibold flex items-center gap-1.5 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                          <Table2 className="w-3.5 h-3.5" /> Hoja de Cálculo
                        </span>
                        <button
                          onClick={() => setShowSpreadsheetModal(false)}
                          className={`p-1.5 rounded-lg transition-colors ${darkMode ? "text-slate-400 hover:bg-red-900/30 hover:text-red-400" : "text-slate-500 hover:bg-red-50 hover:text-red-500"}`}
                          title="Cerrar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <HojaCalculo readOnly darkMode={darkMode} initialData={content} />
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </>
            ) : (
              <div className={`p-5 rounded-xl border-2 border-dashed text-center text-sm ${darkMode ? "border-slate-600 text-slate-500" : "border-gray-300 text-gray-400"}`}>
                <Table2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p>Sin datos de la hoja de cálculo.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTES - Respuestas read-only
// Estilo de opciones idéntico a ExamPanel (border-2, rounded-xl, p-4)
// ============================================

function RenderTest({ pregunta, darkMode }: { pregunta: Pregunta; darkMode: boolean }) {
  const seleccionadas = pregunta.respuestaEstudiante?.opcionesSeleccionadas || [];
  const selIds = new Set(seleccionadas.map(o => o.id));
  const selMap = new Map(seleccionadas.map(o => [o.id, o]));
  const puntajeTotal = pregunta.respuestaEstudiante?.puntajeObtenido === pregunta.puntajeMaximo;

  return (
    <div className="grid grid-cols-1 gap-3">
      {(pregunta.opciones || []).map((opcion) => {
        const fueSeleccionada = selIds.has(opcion.id);
        let esCorrecta = opcion.esCorrecta;
        if (fueSeleccionada && puntajeTotal) {
           esCorrecta = true;
        } else if (esCorrecta === undefined && fueSeleccionada) {
           esCorrecta = selMap.get(opcion.id)?.esCorrecta || false;
        }

        let containerClass: string;
        let checkboxClass: string;
        let textClass: string;

        if (fueSeleccionada && esCorrecta) {
          containerClass = darkMode ? "border-emerald-500 bg-emerald-900/30" : "border-emerald-500 bg-emerald-50";
          checkboxClass = "bg-emerald-500 border-emerald-500";
          textClass = darkMode ? "text-emerald-300" : "text-emerald-700";
        } else if (fueSeleccionada && !esCorrecta) {
          containerClass = darkMode ? "border-rose-500 bg-rose-900/30" : "border-rose-500 bg-rose-50";
          checkboxClass = "bg-rose-500 border-rose-500";
          textClass = darkMode ? "text-rose-300" : "text-rose-700";
        } else if (!fueSeleccionada && esCorrecta) {
          containerClass = darkMode ? "border-emerald-500/30 bg-emerald-900/10 border-dashed" : "border-emerald-300 bg-emerald-50/50 border-dashed";
          checkboxClass = darkMode ? "border-emerald-500/50 bg-transparent" : "border-emerald-300 bg-transparent";
          textClass = darkMode ? "text-emerald-400/60" : "text-emerald-600/60";
        } else {
          containerClass = darkMode ? "border-slate-700" : "border-gray-200";
          checkboxClass = darkMode ? "border-slate-500 bg-slate-800/80" : "border-gray-300 bg-white";
          textClass = darkMode ? "text-slate-400" : "text-slate-500";
        }

        return (
          <div key={opcion.id} className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${containerClass}`}>
            <div className="relative flex items-center justify-center">
              <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${checkboxClass}`}>
                {fueSeleccionada && (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {!fueSeleccionada && esCorrecta && (
                  <svg className={`w-4 h-4 ${darkMode ? "text-emerald-500/50" : "text-emerald-400/50"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <span className={`flex-1 font-medium ${textClass}`}>{opcion.texto}</span>
            {fueSeleccionada && (
              <span className={`text-[10px] font-bold uppercase ${esCorrecta ? "text-emerald-500" : "text-rose-500"}`}>
                {esCorrecta ? "Correcta" : "Incorrecta"}
              </span>
            )}
            {!fueSeleccionada && esCorrecta && (
              <span className={`text-[10px] font-bold uppercase ${darkMode ? "text-emerald-500/50" : "text-emerald-500/60"}`}>
                Era correcta
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RenderOpen({ pregunta, darkMode }: { pregunta: Pregunta; darkMode: boolean }) {
  const texto = pregunta.respuestaEstudiante?.textoEscrito || "";

  return (
    <div className="space-y-4">
      {/* Texto read-only con el mismo estilo que el textarea de ExamPanel */}
      <div className={`w-full min-h-[140px] p-4 rounded-xl border-2 ${darkMode ? "bg-slate-800/70 border-slate-700 text-slate-200" : "bg-gray-50 border-gray-200 text-slate-700"}`}>
        <p className="whitespace-pre-wrap break-words text-base">
          {texto || <span className="italic opacity-50">Respuesta vacía</span>}
        </p>
      </div>

      {pregunta.keywords && pregunta.keywords.length > 0 && (
        <div>
          <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
            Palabras clave esperadas
          </p>
          <div className="flex flex-wrap gap-2">
            {pregunta.keywords.map((kw) => {
              const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
              const kwNorm = normalize(kw.texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const found = new RegExp(`\\b${kwNorm}\\b`, "i").test(normalize(texto));
              return (
                <span key={kw.id} className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                  found
                    ? (darkMode ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200")
                    : (darkMode ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-gray-100 text-gray-500 border-gray-200")
                }`}>
                  {found && <CheckCircle className="w-3 h-3 inline mr-1" />}
                  {kw.texto}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {pregunta.textoRespuesta && (
        <div className={`p-4 rounded-xl border-2 ${darkMode ? "bg-emerald-900/20 border-emerald-700/40" : "bg-emerald-50 border-emerald-200"}`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>
            <CheckCircle className="w-3.5 h-3.5" />
            Respuesta correcta esperada
          </p>
          <p className={`text-sm whitespace-pre-wrap break-words ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>
            {pregunta.textoRespuesta}
          </p>
        </div>
      )}
    </div>
  );
}

function RenderFileUpload({ pregunta, darkMode }: { pregunta: Pregunta; darkMode: boolean }) {
  const archivo = pregunta.respuestaEstudiante?.archivo;

  if (!archivo) {
    return (
      <div className={`w-full p-4 rounded-xl border-2 ${darkMode ? "bg-slate-800/70 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-slate-500"}`}>
        <p className="italic text-sm">El estudiante no entregó ningún archivo.</p>
      </div>
    );
  }

  const displayName = archivo.nombreOriginal || archivo.nombreArchivo;
  const downloadUrl = `${ATTEMPTS_API_URL}/api/exam/answer-file/${archivo.nombreArchivo}${
    archivo.nombreOriginal ? `?name=${encodeURIComponent(archivo.nombreOriginal)}` : ""
  }`;
  const tamanoKB = archivo.tamano ? Math.round(archivo.tamano / 1024) : null;

  return (
    <div className={`flex items-center justify-between gap-3 p-4 rounded-xl border-2 ${darkMode ? "bg-emerald-500/10 border-emerald-700/60" : "bg-emerald-50 border-emerald-200"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <FileText className={`w-6 h-6 shrink-0 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
            {displayName}
          </p>
          {tamanoKB !== null && (
            <p className={`text-xs ${darkMode ? "text-emerald-500/70" : "text-emerald-600/70"}`}>
              {tamanoKB >= 1024 ? `${(tamanoKB / 1024).toFixed(1)} MB` : `${tamanoKB} KB`}
            </p>
          )}
        </div>
      </div>
      <a
        href={downloadUrl}
        target="_blank"
        rel="noreferrer"
        className={`text-sm font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors ${darkMode ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}
      >
        Descargar
      </a>
    </div>
  );
}

function RenderFillBlanks({ pregunta, darkMode }: { pregunta: Pregunta; darkMode: boolean }) {
  const espacios = pregunta.respuestaEstudiante?.espaciosLlenados || [];
  const texto = pregunta.textoCorrecto || "";
  const partes = texto.split("___");
  const puntajeTotal = Math.abs((pregunta.respuestaEstudiante?.puntajeObtenido || 0) - pregunta.puntajeMaximo) < 0.01;

  return (
    <div className={`p-6 rounded-xl border text-lg ${darkMode ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
      <p className={`leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
        {partes.map((parte, i) => {
          const esCorrecta = i < espacios.length ? (espacios[i].esCorrecta || puntajeTotal) : false;
          return (
          <span key={i}>
            <span>{parte}</span>
            {i < espacios.length && (
              <span className="inline-flex flex-col items-center mx-1 align-middle">
                <span className={`inline-block w-32 px-2 py-1 text-center border-b-2 rounded-t font-medium ${
                  esCorrecta
                    ? (darkMode ? "bg-emerald-900/30 border-emerald-500 text-emerald-400" : "bg-emerald-50 border-emerald-500 text-emerald-700")
                    : (darkMode ? "bg-rose-900/30 border-rose-500 text-rose-400" : "bg-rose-50 border-rose-500 text-rose-700")
                }`}>
                  {espacios[i].respuestaEstudiante || "—"}
                </span>
                {!esCorrecta && (
                  <span className={`w-full text-[10px] text-center mt-0.5 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>
                    ✓ {espacios[i].respuestaCorrecta}
                  </span>
                )}
              </span>
            )}
          </span>
        )})}
      </p>
    </div>
  );
}

function RenderMatch({ pregunta, darkMode }: { pregunta: Pregunta; darkMode: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [itemPositions, setItemPositions] = useState<Record<string, { top: number; left: number }>>({});
  const respuestas = pregunta.respuestaEstudiante?.paresSeleccionados || [];
  const paresCorrectos = pregunta.paresCorrectos || [];
  const puntajeTotal = Math.abs((pregunta.respuestaEstudiante?.puntajeObtenido || 0) - pregunta.puntajeMaximo) < 0.01;

  // Preparar columnas (Memoizado para estabilidad)
  const { itemsA, itemsB } = useMemo(() => {
    const a = paresCorrectos.map(p => p.itemA);
    // Mezclar B determinísticamente para que no queden siempre alineados horizontalmente y se vean las líneas cruzadas
    const b = [...paresCorrectos.map(p => p.itemB)].sort((x, y) => (x.id * 17 % 100) - (y.id * 17 % 100));
    return { itemsA: a, itemsB: b };
  }, [paresCorrectos]);

  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;
    const positions: Record<string, { top: number; left: number }> = {};
    const containerRect = containerRef.current.getBoundingClientRect();

    itemsA.forEach(item => {
      const el = document.getElementById(`rev-match-a-${pregunta.id}-${item.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        positions[`a-${item.id}`] = {
          left: (rect.right - 2) - containerRect.left,
          top: (rect.top + rect.height / 2) - containerRect.top
        };
      }
    });

    itemsB.forEach(item => {
      const el = document.getElementById(`rev-match-b-${pregunta.id}-${item.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        positions[`b-${item.id}`] = {
          left: (rect.left + 2) - containerRect.left,
          top: (rect.top + rect.height / 2) - containerRect.top
        };
      }
    });
    setItemPositions(positions);
  }, [pregunta.id, itemsA, itemsB]);

  useEffect(() => {
    const timer = setTimeout(updatePositions, 300);

    // Observar cambios de tamaño en el contenedor (ej. al abrir el menú lateral)
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
  }, [updatePositions]);

  const getPath = (posA: { left: number; top: number }, posB: { left: number; top: number }) => {
    if (!posA || !posB) return "";
    const x1 = posA.left;
    const y1 = posA.top;
    const x2 = posB.left;
    const y2 = posB.top;
    const tension = 0.5;
    const delta = Math.abs(x2 - x1) * tension;
    return `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`;
  };

  // ¿Hay algún par incorrecto o sin conectar?
  const hayErrores = paresCorrectos.some(par => {
    const studentPair = respuestas.find(r => r.itemA.id === par.itemA.id);
    return !(studentPair?.esCorrecto || puntajeTotal);
  });

  return (
    <div className={`rounded-xl border select-none ${darkMode ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>

      {/* ── VISTA MÓVIL: lista de pares ── */}
      <div className="md:hidden p-4 space-y-2">
        {paresCorrectos.map((par) => {
          const studentPair = respuestas.find(r => r.itemA.id === par.itemA.id);
          const isCorrect = studentPair ? (studentPair.esCorrecto || puntajeTotal) : false;
          const studentAnswerText = studentPair ? studentPair.itemB.text : null;

          return (
            <div key={par.id} className={`rounded-xl border overflow-hidden ${
              isCorrect
                ? (darkMode ? "border-emerald-700/50" : "border-emerald-200")
                : (darkMode ? "border-rose-700/50" : "border-rose-200")
            }`}>
              <div className="flex items-stretch">
                {/* Item A */}
                <div className={`flex-1 px-3 py-2.5 text-sm font-medium text-right ${darkMode ? "bg-slate-800 text-slate-200" : "bg-gray-50 text-slate-700"}`}>
                  {par.itemA.text}
                </div>
                {/* Conector */}
                <div className={`flex items-center px-2 text-xs font-bold ${
                  isCorrect
                    ? (darkMode ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600")
                    : (darkMode ? "bg-rose-900/30 text-rose-400" : "bg-rose-50 text-rose-600")
                }`}>
                  →
                </div>
                {/* Item B — respuesta del estudiante */}
                <div className={`flex-1 px-3 py-2.5 text-sm font-medium ${
                  isCorrect
                    ? (darkMode ? "bg-emerald-900/20 text-emerald-300" : "bg-emerald-50 text-emerald-700")
                    : (darkMode ? "bg-rose-900/20 text-rose-300" : "bg-rose-50 text-rose-700")
                }`}>
                  {studentAnswerText ?? <span className="italic opacity-50 text-xs">Sin responder</span>}
                </div>
              </div>
              {/* Si incorrecto, mostrar la respuesta correcta */}
              {!isCorrect && (
                <div className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${darkMode ? "bg-emerald-900/10 text-emerald-400 border-t border-emerald-800/30" : "bg-emerald-50/70 text-emerald-700 border-t border-emerald-100"}`}>
                  <CheckCircle className="w-3 h-3 shrink-0" />
                  Correcto: {par.itemA.text} → {par.itemB.text}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── VISTA ESCRITORIO: columnas con SVG ── */}
      <div ref={containerRef} className="hidden md:block relative p-6">
        {/* SVG Layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
          {paresCorrectos.map((par) => {
            const studentPair = respuestas.find(r => r.itemA.id === par.itemA.id);
            const isCorrectlyAnswered = studentPair?.esCorrecto || puntajeTotal;
            if (isCorrectlyAnswered) return null;
            const posA = itemPositions[`a-${par.itemA.id}`];
            const posB = itemPositions[`b-${par.itemB.id}`];
            if (!posA || !posB) return null;
            return (
              <g key={`hint-${par.id}`}>
                <path
                  d={getPath(posA, posB)}
                  fill="none"
                  stroke={darkMode ? "rgba(52,211,153,0.55)" : "rgba(5,150,105,0.55)"}
                  strokeWidth="2.5"
                  strokeDasharray="7 4"
                  strokeLinecap="round"
                />
                <circle cx={posA.left} cy={posA.top} r="5" fill={darkMode ? "rgba(52,211,153,0.4)" : "rgba(5,150,105,0.4)"} />
                <circle cx={posB.left} cy={posB.top} r="5" fill={darkMode ? "rgba(52,211,153,0.4)" : "rgba(5,150,105,0.4)"} />
              </g>
            );
          })}
          {respuestas.map((resp, idx) => {
            const posA = itemPositions[`a-${resp.itemA.id}`];
            const posB = itemPositions[`b-${resp.itemB.id}`];
            if (!posA || !posB) return null;
            const style = getStableColor(resp.itemA.id, PAIR_COLORS);
            return (
              <g key={idx}>
                <path d={getPath(posA, posB)} fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="6" className={darkMode ? "stroke-black/20" : ""} />
                <path d={getPath(posA, posB)} fill="none" stroke="currentColor" strokeWidth="3" className={darkMode ? style.darkStroke : style.stroke} />
                <circle cx={posA.left} cy={posA.top} r="4" className={darkMode ? style.darkFill : style.fill} />
                <circle cx={posB.left} cy={posB.top} r="4" className={darkMode ? style.darkFill : style.fill} />
              </g>
            );
          })}
        </svg>

        <div className="flex justify-between gap-12 relative z-20">
          <div className="flex-1 space-y-4">
            {itemsA.map(item => {
              const pair = respuestas.find(r => r.itemA.id === item.id);
              const isConnected = !!pair;
              const style = isConnected ? getStableColor(item.id, PAIR_COLORS) : null;
              const isCorrect = pair ? (pair.esCorrecto || puntajeTotal) : false;
              return (
                <div key={item.id} id={`rev-match-a-${pregunta.id}-${item.id}`} className={`p-4 rounded-xl border text-right flex items-center justify-end relative transition-all ${isConnected ? (darkMode ? `${style?.darkBorder} ${style?.darkBg}` : `${style?.border} ${style?.bg}`) : (darkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-gray-50 border-gray-200 text-slate-700")}`}>
                  <span className={`font-medium ${isConnected ? (isCorrect ? (darkMode ? "text-emerald-400" : "text-emerald-700") : (darkMode ? "text-rose-400" : "text-rose-700")) : ""}`}>{item.text}</span>
                  <div className={`w-3 h-3 rounded-full border-2 absolute -right-1.5 top-1/2 -translate-y-1/2 ${isConnected ? (darkMode ? `bg-slate-700 ${style?.darkBorder}` : `bg-white ${style?.border}`) : (darkMode ? "bg-slate-600 border-slate-500" : "bg-gray-300 border-gray-400")}`}></div>
                </div>
              );
            })}
          </div>
          <div className="flex-1 space-y-4">
            {itemsB.map(item => {
              const pair = respuestas.find(r => r.itemB.id === item.id);
              const isConnected = !!pair;
              const style = isConnected ? getStableColor(pair.itemA.id, PAIR_COLORS) : null;
              const isCorrect = pair ? (pair.esCorrecto || puntajeTotal) : false;
              return (
                <div key={item.id} id={`rev-match-b-${pregunta.id}-${item.id}`} className={`p-4 rounded-xl border flex items-center relative transition-all ${isConnected ? (darkMode ? `${style?.darkBorder} ${style?.darkBg}` : `${style?.border} ${style?.bg}`) : (darkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-gray-50 border-gray-200 text-slate-700")}`}>
                  <div className={`w-3 h-3 rounded-full border-2 absolute -left-1.5 top-1/2 -translate-y-1/2 ${isConnected ? (darkMode ? `bg-slate-700 ${style?.darkBorder}` : `bg-white ${style?.border}`) : (darkMode ? "bg-slate-600 border-slate-500" : "bg-gray-300 border-gray-400")}`}></div>
                  <span className={`font-medium ${isConnected ? (isCorrect ? (darkMode ? "text-emerald-400" : "text-emerald-700") : (darkMode ? "text-rose-400" : "text-rose-700")) : ""}`}>{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {hayErrores && (
          <div className={`mt-4 flex flex-wrap gap-4 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            <span className="flex items-center gap-2">
              <svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" stroke={darkMode ? "rgba(52,211,153,0.7)" : "rgba(5,150,105,0.7)"} strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round"/></svg>
              Conexión correcta
            </span>
            <span className="flex items-center gap-2">
              <svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" stroke={darkMode ? "rgba(248,113,113,0.9)" : "rgba(220,38,38,0.9)"} strokeWidth="2.5" strokeLinecap="round"/></svg>
              Tu respuesta (incorrecta)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
