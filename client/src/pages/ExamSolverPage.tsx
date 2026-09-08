import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import {
  Moon,
  Sun,
  Clock,
  User,
  X,
  ZoomIn,
  ZoomOut,
  Columns,
  Rows,
  Calculator,
  FileSpreadsheet,
  Code,
  Pencil,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Battery,
  BatteryCharging,
  GripVertical,
  FileText,
  LayoutGrid,
  CheckCircle2,
  LogOut,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import ExamPanel from "../components/ExamQuestionsPanel";
import MonitoreoSupervisado from "../components/SupervisedMonitor";
import ConfirmModal from "../components/ConfirmModal";

const EditorTexto = lazy(() => import("../components/TextEditor"));
const Calculadora = lazy(() => import("../components/Calculator"));
const HojaCalculo = lazy(() => import("../components/Spreadsheet"));
const Lienzo = lazy(() => import("../components/DrawingBoard"));
const EditorJavaScript = lazy(() => import("../components/EditorJavaScript"));
const EditorPython = lazy(() => import("../components/EditorPython"));
const GRACE_SECONDS = 180;
import logoUniversidad from "../../assets/logo-universidad.webp";
import logoUniversidadNoche from "../../assets/logo-universidad-noche.webp";

// --- INTERFACES ---
interface StudentData {
  nombre?: string;
  correoElectronico?: string;
  codigoEstudiante?: string;
  attemptId?: number;
  codigo_acceso?: string;
  id_sesion?: string;
  fecha_expiracion?: string | null;
  examCode: string;
  startTime?: string;
  contrasena?: string;
  isResuming?: boolean;
  ordenPreguntas?: string | null;
}

interface ExamData {
  nombre: string;
  nombreProfesor: string;
  limiteTiempo: number;
  limiteTiempoCumplido?: string | null;
  consecuencia: string;
  incluirHerramientaDibujo: boolean;
  incluirCalculadoraCientifica: boolean;
  incluirHojaExcel: boolean;
  incluirJavascript: boolean;
  incluirPython: boolean;
  descripcion: string;
  questions: any;
  archivoPDF?: string | null;
  dividirPreguntas?: boolean;
  permitirVolverPreguntas?: boolean;
}

type PanelType =
  | "exam"
  | "answer"
  | "dibujo"
  | "calculadora"
  | "excel"
  | "javascript"
  | "python";
type Layout = "horizontal" | "vertical";

// --- INDICADOR DE GUARDADO ---
function SavingIndicator({
  savingStates,
  darkMode,
}: {
  savingStates: Record<number, boolean>;
  darkMode: boolean;
}) {
  const isSaving = Object.values(savingStates).some((s) => s);

  if (!isSaving) return null;

  return (
    <div
      className={`fixed bottom-6 left-24 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl z-50 border transition-all animate-in slide-in-from-bottom-5 duration-300 ${
        darkMode
          ? "bg-slate-800 border-blue-500/50 text-blue-200"
          : "bg-white border-blue-100 text-blue-800"
      }`}
    >
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
      <span className="text-sm font-bold tracking-tight">Guardando...</span>
    </div>
  );
}

// --- COMPONENTE NOTIFICACIÓN TIMER ---
function TimerNotification({
  alert,
  onClose,
  darkMode,
}: {
  alert: { message: string; type: "warning" | "critical" | "success" } | null;
  onClose: () => void;
  darkMode: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (alert) {
      const showTimer = setTimeout(() => setIsVisible(true), 10);
      const hideTimer = setTimeout(
        () => setIsVisible(false),
        alert.type === "success" ? 8000 : 6000,
      );
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [alert]);

  useEffect(() => {
    if (!isVisible && alert) {
      const closeTimer = setTimeout(onClose, 500); // Esperar a que termine la animación de salida
      return () => clearTimeout(closeTimer);
    }
  }, [isVisible, alert, onClose]);

  if (!alert) return null;

  const isCritical = alert.type === "critical";
  const isSuccess = alert.type === "success";

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-max px-6 py-3 rounded-xl shadow-2xl border backdrop-blur-md flex items-center gap-4 transition-all duration-500 ease-in-out ${
        isVisible
          ? "opacity-100 scale-100"
          : "opacity-0 scale-95 pointer-events-none"
      } ${
        isSuccess
          ? darkMode
            ? "bg-green-900/90 border-green-500 text-green-100"
            : "bg-green-50 border-green-200 text-green-800"
          : isCritical
            ? darkMode
              ? "bg-red-900/90 border-red-500 text-red-100"
              : "bg-red-50 border-red-200 text-red-800"
            : darkMode
              ? "bg-amber-900/90 border-amber-500 text-amber-100"
              : "bg-amber-50 border-amber-200 text-amber-800"
      }`}
    >
      <div
        className={`p-2 rounded-full flex-shrink-0 ${
          isSuccess
            ? darkMode
              ? "bg-green-800 text-green-200"
              : "bg-green-100 text-green-600"
            : isCritical
              ? darkMode
                ? "bg-red-800 text-red-200"
                : "bg-red-100 text-red-600"
              : darkMode
                ? "bg-amber-800 text-amber-200"
                : "bg-amber-100 text-amber-600"
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : isCritical ? (
          <AlertTriangle className="w-5 h-5" />
        ) : (
          <Clock className="w-5 h-5" />
        )}
      </div>
      <div>
        <h4 className="font-bold text-sm">
          {isSuccess
            ? "Aviso del profesor"
            : isCritical
              ? "¡Atención!"
              : "Recordatorio"}
        </h4>
        <p className="text-xs opacity-90 font-medium">{alert.message}</p>
      </div>
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---
// En dev (Vite), el proxy redirige /api/exam y /socket.io.
// En prod (Nginx en Docker o servidor), el mismo origen sirve todo.
// Si VITE_SOCKET_URL está definida (ej. dev directo sin proxy), se usa.
const ATTEMPTS_API_URL =
  import.meta.env.VITE_SOCKET_URL || window.location.origin;
const EXAMS_API_URL = import.meta.env.VITE_EXAMS_URL || window.location.origin;

// --- CALIDAD DE CONEXIÓN (0 = sin conexión, 1–4 = barras) ---
function useConnectionQuality(isConnected: boolean): 0 | 1 | 2 | 3 | 4 {
  const [level, setLevel] = React.useState<0 | 1 | 2 | 3 | 4>(
    isConnected ? 4 : 0,
  );

  React.useEffect(() => {
    if (!isConnected) {
      setLevel(0);
      return;
    }

    const conn = (navigator as any).connection;

    const levelFromConn = (c: any): 1 | 2 | 3 | 4 => {
      const type: string = c.effectiveType ?? "";
      const rtt: number = c.rtt ?? 0;
      if (type === "slow-2g") return 1;
      if (type === "2g") return 2;
      if (type === "3g") return 3;
      if (rtt > 300) return 2;
      if (rtt > 150) return 3;
      return 4;
    };

    if (conn) {
      const update = () => setLevel(levelFromConn(conn));
      update();
      conn.addEventListener("change", update);
      return () => conn.removeEventListener("change", update);
    }

    // Fallback: medir latencia con fetch periódico al mismo origen
    let active = true;
    const measure = async () => {
      if (!active) return;
      const start = performance.now();
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        await fetch(
          `${window.location.origin}/favicon.ico?_=${Date.now()}`,
          { method: "HEAD", cache: "no-store", signal: controller.signal },
        );
        clearTimeout(t);
        const rtt = performance.now() - start;
        if (!active) return;
        if (rtt < 100) setLevel(4);
        else if (rtt < 250) setLevel(3);
        else if (rtt < 500) setLevel(2);
        else setLevel(1);
      } catch {
        if (active) setLevel(1);
      }
    };
    measure();
    const interval = setInterval(measure, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isConnected]);

  return level;
}

// --- INDICADOR DE SEÑAL TIPO CELULAR ---
function SignalIndicator({
  level,
  darkMode,
}: {
  level: 0 | 1 | 2 | 3 | 4;
  darkMode: boolean;
}) {
  const bars = [
    { height: "h-2" },
    { height: "h-3.5" },
    { height: "h-5" },
    { height: "h-[26px]" },
  ];
  const activeCount = level === 0 ? 1 : level;
  const activeColor =
    level === 0
      ? "bg-red-500 animate-pulse"
      : level === 1
        ? "bg-red-500"
        : level === 2
          ? "bg-amber-500"
          : level === 3
            ? "bg-yellow-400"
            : "bg-emerald-500";
  const titles: Record<number, string> = {
    0: "Sin conexión — respuestas en pausa",
    1: "Señal muy débil — riesgo de desconexión",
    2: "Señal débil",
    3: "Buena señal",
    4: "Conexión estable",
  };
  return (
    <div className="flex items-end gap-[3px]" title={titles[level]}>
      {bars.map((bar, i) => (
        <div
          key={i}
          className={`w-[5px] rounded-sm transition-all duration-300 ${bar.height} ${
            i < activeCount
              ? activeColor
              : darkMode
                ? "bg-slate-600"
                : "bg-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export default function SecureExamPlatform() {
  // ----------------------------------------------------------------------
  // 1. ESTADOS
  // ----------------------------------------------------------------------
  const [examStarted, setExamStarted] = useState(false);
  const [examBlocked, setExamBlocked] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showUnlockScreen, setShowUnlockScreen] = useState(false);
  const [sessionReplaced, setSessionReplaced] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    window.innerWidth < 768,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [wasForced, setWasForced] = useState<"" | "individual" | "todos">("");
  const [wasAbandoned, setWasAbandoned] = useState(false);
  const [wasTimeExpired, setWasTimeExpired] = useState<
    "" | "enviar" | "descartar"
  >("");

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  const [remainingTime, setRemainingTime] = useState("02:30:00");
  const [timerStatus, setTimerStatus] = useState<
    "normal" | "warning" | "critical"
  >("normal");
  const [timerAlert, setTimerAlert] = useState<{
    message: string;
    type: "warning" | "critical" | "success";
  } | null>(null);
  const alertsShownRef = useRef<{ warning: boolean; critical: boolean }>({
    warning: false,
    critical: false,
  });
  const [timeLimitRemoved, setTimeLimitRemoved] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null); // Ref para acceder al socket desde event listeners

  // --- ESTADOS DE CONEXIÓN WEBSOCKET ---
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const isSocketConnectedRef = useRef(false); // Ref para evitar stale closure en saveAnswer
  const connectionLostRef = useRef(false);    // Ref para evitar stale closure en beforeunload
  const saveAnswerRef = useRef<typeof saveAnswer | null>(null); // Ref para evitar stale closure en connect handler
  // Ref con los datos de sesión activos — permite re-emitir join_attempt desde cualquier closure
  const sessionDataRef = useRef<{ attemptId?: number; id_sesion?: string }>({});
  const [connectionLost, setConnectionLost] = useState(false);
  const [connectionGraceSeconds, setConnectionGraceSeconds] = useState<
    number | null
  >(null);
  const [graceCountdown, setGraceCountdown] = useState<number | null>(null);

  const [openPanels, setOpenPanels] = useState<PanelType[]>([]);
  const [layout, setLayout] = useState<Layout>("vertical");
  const [panelSizes, setPanelSizes] = useState<number[]>([]);
  const [initialQuestionIndex, setInitialQuestionIndex] = useState(0);
  const [panelZooms, setPanelZooms] = useState<number[]>([]);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const [startPos, setStartPos] = useState(0);

  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [answerPanelContent, setAnswerPanelContent] = useState<string>("");
  const [savingStates, setSavingStates] = useState<Record<number, boolean>>({});
  const saveTimersRef = useRef<Record<number, number>>({});
  // Cola de respuestas pendientes durante desconexión — se sincronizan al reconectar
  const pendingAnswersQueueRef = useRef<
    Array<{
      preguntaId: number;
      respuesta: any;
      tipo_respuesta?: string;
      metadata_codigo?: string;
    }>
  >([]);
  const [lastSavedAnswers, setLastSavedAnswers] = useState<
    Record<string, string>
  >({});

  const [draggedPanelIndex, setDraggedPanelIndex] = useState<number | null>(
    null,
  );
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [securityViolations, setSecurityViolations] = useState<string[]>([]);

  const fullscreenRef = useRef<HTMLDivElement>(null);
  const integrityCheckRef = useRef<number>(0);
  const examFinishedRef = useRef(false);
  const startupGraceRef = useRef(false); // Ignora eventos de seguridad durante el arranque del examen

  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [examData, setExamData] = useState<ExamData | null>(null);

  // Estado persistente para el editor de Python
  const [pythonCells, setPythonCells] = useState<any[]>([
    {
      id: "1",
      type: "markdown",
      content: "# Editor Python\n",
      status: "idle",
    },
  ]);

  // Estado persistente para el editor de JavaScript
  const [jsCells, setJsCells] = useState<any[]>([
    {
      id: "1",
      type: "markdown",
      content: "# Editor JavaScript\n",
      status: "idle",
    },
  ]);

  // Estado persistente para Lienzo (Dibujo)
  const [lienzoState, setLienzoState] = useState<any>(null);

  // Estado persistente para Hoja de Cálculo
  const [hojaCalcState, setHojaCalcState] = useState<any>(null);

  // Estado persistente para Calculadora
  const [calculatorState, setCalculatorState] = useState<any>(null);

  // Estados para Modales de Confirmación
  const [showExitModal, setShowExitModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
  }>({ visible: false, titulo: "", mensaje: "" });
  const mostrarError = (titulo: string, mensaje: string) =>
    setErrorModal({ visible: true, titulo, mensaje });

  // --- IDs VIRTUALES PARA RESPUESTAS PDF ---
  // Cada herramienta usa un pregunta_id virtual diferente para guardar su respuesta por separado
  const PDF_ANSWER_ID = 0; // Panel "Responder" (texto plano)
  const PDF_PYTHON_ID = 1; // Editor Python
  const PDF_JS_ID = 2; // Editor JavaScript/HTML
  const PDF_LIENZO_ID = 4; // Lienzo / Diagrama
  const PDF_HOJA_ID = 5; // Hoja de Cálculo

  // Refs para debounce de auto-save PDF
  const pdfSaveTimersRef = useRef<Record<number, number>>({});

  const savePdfAnswer = (
    id: number,
    data: any,
    tipo: string,
    metadata?: string,
    delay = 3000,
  ) => {
    if (!studentData?.attemptId) return;
    if (pdfSaveTimersRef.current[id])
      clearTimeout(pdfSaveTimersRef.current[id]);
    pdfSaveTimersRef.current[id] = window.setTimeout(() => {
      saveAnswer(id, data, tipo, metadata);
      delete pdfSaveTimersRef.current[id];
    }, delay);
  };

  // Limpia celdas de editores para persistencia: elimina estado runtime (status, executionTime,
  // hasActiveTimers) que no se necesitan para reconstrucción. Mantiene id, type, content, output, height.
  const cleanCellsForSave = (cells: any[]) =>
    cells.map((c: any) => ({
      id: c.id,
      type: c.type,
      content: c.content,
      output: c.output || null,
      height: c.height || null,
    }));

  // Auto-save: Panel "Responder" (texto plano)
  useEffect(() => {
    if (!examData?.archivoPDF || !answerPanelContent) return;
    savePdfAnswer(PDF_ANSWER_ID, answerPanelContent, "texto_plano");
  }, [answerPanelContent]);

  // Auto-save: Python cells
  useEffect(() => {
    if (!examData?.incluirPython) return;
    if (
      pythonCells.length <= 1 &&
      pythonCells[0]?.content === "# Editor Python\n"
    )
      return;
    const cleaned = cleanCellsForSave(pythonCells);
    const codeCells = cleaned.filter((c: any) => c.type === "code").length;
    const textCells = cleaned.filter((c: any) => c.type === "markdown").length;
    savePdfAnswer(
      PDF_PYTHON_ID,
      cleaned,
      "python",
      JSON.stringify({ totalCells: cleaned.length, codeCells, textCells }),
    );
  }, [pythonCells]);

  // Auto-save: JavaScript cells
  useEffect(() => {
    if (!examData?.incluirJavascript) return;
    if (jsCells.length <= 1 && jsCells[0]?.content === "# Editor JavaScript\n")
      return;
    const cleaned = cleanCellsForSave(jsCells);
    const codeCells = cleaned.filter((c: any) => c.type === "code").length;
    const htmlCells = cleaned.filter((c: any) => c.type === "html").length;
    const textCells = cleaned.filter((c: any) => c.type === "markdown").length;
    savePdfAnswer(
      PDF_JS_ID,
      cleaned,
      "javascript",
      JSON.stringify({
        totalCells: cleaned.length,
        codeCells,
        htmlCells,
        textCells,
      }),
    );
  }, [jsCells]);

  // Limpia el estado del Lienzo para persistencia: elimina history/historyIndex (undo/redo)
  // que no se necesitan para reconstruir el diagrama y pueden ser muy pesados
  const cleanLienzoForSave = (state: any) => {
    const cleanSheets = state.sheets.map((sheet: any) => ({
      id: sheet.id,
      name: sheet.name,
      nodes: sheet.nodes,
      connections: sheet.connections,
      paintActions: sheet.paintActions,
      pan: sheet.pan,
      scale: sheet.scale,
    }));
    return { sheets: cleanSheets, activeSheetIndex: state.activeSheetIndex };
  };

  // Limpia el estado de la Hoja de Cálculo para persistencia
  const cleanHojaForSave = (state: any) => ({
    allCells: state.allCells ?? {},
    allCharts: state.allCharts ?? {},
    sheets: state.sheets ?? [],
    activeSheet: state.activeSheet ?? 1,
    colWidths: state.colWidths ?? {},
    solverConfigs: state.solverConfigs ?? {},
  });

  // Auto-save: Hoja de Cálculo
  useEffect(() => {
    if (!examData?.incluirHojaExcel || !hojaCalcState) return;
    const clean = cleanHojaForSave(hojaCalcState);
    const totalCells = Object.values(
      clean.allCells as Record<number, Record<string, any>>,
    ).reduce(
      (sum, sheet) =>
        sum +
        Object.values(sheet).filter((c: any) => c.value || c.formula).length,
      0,
    );
    const chartsCount = Object.values(
      clean.allCharts as Record<number, any[]>,
    ).reduce((sum, charts) => sum + charts.length, 0);
    savePdfAnswer(
      PDF_HOJA_ID,
      clean,
      "hoja_calculo",
      JSON.stringify({
        sheetsCount: clean.sheets.length,
        totalCells,
        chartsCount,
      }),
    );
  }, [hojaCalcState]);

  // Auto-save: Lienzo / Diagrama
  useEffect(() => {
    if (!examData?.incluirHerramientaDibujo || !lienzoState) return;
    const cleanState = cleanLienzoForSave(lienzoState);
    const totalNodes = cleanState.sheets.reduce(
      (sum: number, s: any) => sum + s.nodes.length,
      0,
    );
    const totalConnections = cleanState.sheets.reduce(
      (sum: number, s: any) => sum + s.connections.length,
      0,
    );
    savePdfAnswer(
      PDF_LIENZO_ID,
      cleanState,
      "diagrama",
      JSON.stringify({
        sheetsCount: cleanState.sheets.length,
        totalNodes,
        totalConnections,
      }),
    );
  }, [lienzoState]);

  // --- HELPERS DE DIMENSIONAMIENTO ---
  const getMinSize = (type: PanelType, panelCount: number) => {
    if (type === "dibujo") return 50; // Lienzo requiere 60% mínimo
    // Si hay 3 paneles, relajamos un poco los mínimos para que quepan
    if (type === "exam") return 50;
    if (type === "python" || type === "javascript")
      return panelCount === 3 ? 30 : 40;
    if (type === "answer") return 30;
    if (type === "calculadora") return 35;
    return 20; // Excel, etc.
  };

  const calculateOptimalSizes = (panels: PanelType[]) => {
    const count = panels.length;
    const minSizes = panels.map((p) => getMinSize(p, count));
    const totalMin = minSizes.reduce((a, b) => a + b, 0);

    // Si los mínimos superan el 100% (raro con la lógica actual), escalamos
    if (totalMin > 100) return minSizes.map((m) => (m / totalMin) * 100);

    // Si sobra espacio, se lo damos al primer panel (Examen)
    const sizes = [...minSizes];
    sizes[0] += 100 - totalMin;
    return sizes;
  };

  // ----------------------------------------------------------------------
  // 2. EFECTOS LÓGICOS (Carga, Seguridad, Timer)
  // ----------------------------------------------------------------------

  // Detectar restauración desde bfcache (historial del navegador) y forzar reload
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    const storedStudentData = localStorage.getItem("studentData");
    const storedExamData = localStorage.getItem("currentExam");
    const storedBlockState = localStorage.getItem("examBlockedState");

    if (storedStudentData) {
      const parsedStudentData = JSON.parse(storedStudentData);

      if (storedBlockState) {
        const blockState = JSON.parse(storedBlockState);
        if (blockState.attemptId === parsedStudentData.attemptId) {
          // Bloqueo activo que corresponde a este intento
          setStudentData(parsedStudentData);
          setExamBlocked(true);
          setBlockReason(blockState.reason);
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        } else {
          // examBlockedState es de una sesión anterior (stale) → ignorarlo y limpiar
          localStorage.removeItem("examBlockedState");
          setStudentData(parsedStudentData);
        }
      } else if (parsedStudentData.attemptId && !parsedStudentData.isResuming) {
        // Hay un intento activo sin isResuming → recarga durante examen en curso.
        // Marcar como reanudación para mostrar "Reconexión exitosa" en vez de "Comenzar Examen".
        const withResume = { ...parsedStudentData, isResuming: true };
        localStorage.setItem("studentData", JSON.stringify(withResume));
        setStudentData(withResume);
      } else {
        // Llegada fresca desde ExamAccessPage o ya tiene isResuming correcto.
        setStudentData(parsedStudentData);
      }
    }
    if (storedExamData) setExamData(JSON.parse(storedExamData));
  }, []);

  // Socket para recibir desbloqueo cuando la página fue recargada con examen bloqueado
  useEffect(() => {
    if (!examBlocked || examStarted || !studentData?.attemptId) return;

    const blockedSocket = io(ATTEMPTS_API_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    blockedSocket.on("connect", () => {
      blockedSocket.emit("join_attempt", {
        attemptId: studentData.attemptId,
        sessionId: studentData.id_sesion,
      });
      // Enviar evento de bloqueo pendiente que no pudo enviarse por falta de conexión
      const savedBlock = localStorage.getItem("examBlockedState");
      if (savedBlock) {
        try {
          const { pendingReport, tipoEvento: pendingTipo, attemptId: pendingId } = JSON.parse(savedBlock);
          if (pendingReport && pendingTipo && pendingId) {
            fetch(`${ATTEMPTS_API_URL}/api/exam/event`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                intento_id: pendingId,
                tipo_evento: pendingTipo,
                fecha_envio: new Date().toISOString(),
              }),
            }).then(() => {
              // Limpiar flag pendiente (mantener el resto del estado)
              const current = JSON.parse(localStorage.getItem("examBlockedState") || "{}");
              delete current.pendingReport;
              delete current.tipoEvento;
              localStorage.setItem("examBlockedState", JSON.stringify(current));
            }).catch(() => {});
          }
        } catch {}
      }
    });

    blockedSocket.on("attempt_unlocked", () => {
      setExamBlocked(false);
      setBlockReason("");
      localStorage.removeItem("examBlockedState");
      // Marcar como reanudación para que startExam use el intento existente
      setStudentData((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, isResuming: true };
        localStorage.setItem("studentData", JSON.stringify(updated));
        return updated;
      });
      setShowUnlockScreen(true);
      try {
        window.focus();
      } catch (e) {}
      blockedSocket.disconnect();
    });

    return () => {
      blockedSocket.disconnect();
    };
  }, [examBlocked, examStarted, studentData?.attemptId]);

  // Verificación de integridad
  useEffect(() => {
    integrityCheckRef.current = Math.random();
    if (!examStarted || examBlocked) return;
    const checkIntegrity = setInterval(() => {
      if (examStarted && !examBlocked) {
        const elements = document.querySelectorAll("[data-protected]");
        elements.forEach((el) => {
          if (
            el.getAttribute("data-integrity") !==
            integrityCheckRef.current.toString()
          ) {
            blockExam("Se detectó una modificación no autorizada en el contenido del examen", "CRITICAL");
          }
        });
        const widthThreshold = window.outerWidth - window.innerWidth > 200;
        const heightThreshold = window.outerHeight - window.innerHeight > 200;
        if (widthThreshold || heightThreshold) {
          addSecurityViolation("Posible DevTools detectado");
        }
      }
    }, 2000);
    return () => clearInterval(checkIntegrity);
  }, [examStarted, examBlocked]);

  // Prevenir copia y pegado
  useEffect(() => {
    if (examStarted) {
      const style = document.createElement("style");
      style.innerHTML = `
        * { user-select: none !important; -webkit-user-select: none !important; }
        textarea, input { user-select: text !important; -webkit-user-select: text !important; }
      `;
      document.head.appendChild(style);
      const preventCopy = (e: ClipboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") {
          e.preventDefault();
          blockExam("Se intentó copiar contenido del examen (Ctrl+C)", "CRITICAL");
        }
      };
      const preventCut = (e: ClipboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") {
          e.preventDefault();
          blockExam("Se intentó cortar contenido del examen (Ctrl+X)", "CRITICAL");
        }
      };
      const preventPrint = (e: Event) => {
        e.preventDefault();
        blockExam("Se intentó imprimir o exportar la pantalla del examen", "CRITICAL");
      };
      const preventContextMenu = (e: MouseEvent) => {
        e.preventDefault();
      };

      document.addEventListener("copy", preventCopy);
      document.addEventListener("cut", preventCut);
      window.addEventListener("beforeprint", preventPrint);
      document.addEventListener("contextmenu", preventContextMenu);
      return () => {
        document.head.removeChild(style);
        document.removeEventListener("copy", preventCopy);
        document.removeEventListener("cut", preventCut);
        window.removeEventListener("beforeprint", preventPrint);
        document.removeEventListener("contextmenu", preventContextMenu);
      };
    }
  }, [examStarted]);

  // Reloj
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Batería
  useEffect(() => {
    if ("getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);
        const handleLevelChange = () => {
          const level = Math.round(battery.level * 100);
          setBatteryLevel(level);
          if (level <= 10 && !battery.charging && examStarted) {
            addSecurityViolation(`Batería baja: ${level}%`);
          }
          if (level === 0 && examStarted) {
            blockExam("El dispositivo se quedó sin batería durante el examen", "CRITICAL");
          }
        };
        battery.addEventListener("levelchange", handleLevelChange);
      });
    }
  }, [examStarted]);

  // Timer del examen
  useEffect(() => {
    if (!examStarted || !studentData || !examData || timeLimitRemoved) return;

    // fecha_expiracion es la fuente de verdad: el backend la calcula como
    // min(inicio + limiteTiempo, horaCierre) al crear el intento y la preserva
    // en la BD. Sirve igual para intentos nuevos y reanudados.
    // Si es null el examen no tiene límite de tiempo de ningún tipo.
    let endTime: number;
    let duration: number;

    if (studentData.fecha_expiracion) {
      endTime = new Date(studentData.fecha_expiracion).getTime();
      // duration para calcular % de alertas: relativo al momento actual
      duration = endTime - Date.now();
      if (duration <= 0) {
        // El tiempo ya expiró antes de que el timer arrancara (raro, pero posible)
        setRemainingTime("00:00:00");
        setWasTimeExpired(examData?.limiteTiempoCumplido === "descartar" ? "descartar" : "enviar");
        submitExam();
        return;
      }
    } else {
      setRemainingTime("Sin límite");
      return;
    }

    if (examBlocked) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = endTime - now;

      if (remaining <= 0) {
        setRemainingTime("00:00:00");
        setWasTimeExpired(examData?.limiteTiempoCumplido === "descartar" ? "descartar" : "enviar");
        submitExam();
        return;
      }

      const remHours = Math.floor(remaining / (1000 * 60 * 60));
      const remMinutes = Math.floor(
        (remaining % (1000 * 60 * 60)) / (1000 * 60),
      );
      const remSeconds = Math.floor((remaining % (1000 * 60)) / 1000);

      const timeString = `${String(remHours).padStart(2, "0")}:${String(remMinutes).padStart(2, "0")}:${String(remSeconds).padStart(2, "0")}`;

      // --- LÓGICA DE ALERTAS DE TIEMPO ---
      const percentage = (remaining / duration) * 100;
      let newStatus: "normal" | "warning" | "critical" = "normal";

      const policyMsg =
        examData?.limiteTiempoCumplido === "descartar"
          ? " Su examen se descartará si se acaba el tiempo, le recomendamos finalizar pronto."
          : examData?.limiteTiempoCumplido === "enviar"
            ? " Su examen se enviará automáticamente al finalizar el tiempo."
            : "";

      if (percentage <= 10) {
        newStatus = "critical";
        if (!alertsShownRef.current.critical) {
          setTimerAlert({
            message: `Queda ${timeString} para terminar el examen.${policyMsg}`,
            type: "critical",
          });
          alertsShownRef.current.critical = true;
        }
      } else if (percentage <= 40) {
        newStatus = "warning";
        if (!alertsShownRef.current.warning) {
          setTimerAlert({
            message: `Queda ${timeString} para terminar el examen.${policyMsg}`,
            type: "warning",
          });
          alertsShownRef.current.warning = true;
        }
      }

      setTimerStatus(newStatus);
      // Solo actualizamos si el texto cambia, evitando renders innecesarios
      setRemainingTime((prev) => (prev !== timeString ? timeString : prev));
    };

    // Sincronización precisa con el reloj del sistema
    updateTimer();
    const now = Date.now();
    const msToNextSecond = 1000 - (now % 1000);

    let interval: any;
    const timeout = setTimeout(() => {
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    }, msToNextSecond);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [examStarted, studentData, examData, examBlocked, timeLimitRemoved]);

  const signalLevel = useConnectionQuality(isSocketConnected);

  // Sincronizar refs con estado React (evita stale closure en handlers)
  useEffect(() => {
    isSocketConnectedRef.current = isSocketConnected;
  }, [isSocketConnected]);

  useEffect(() => {
    connectionLostRef.current = connectionLost;
  }, [connectionLost]);

  useEffect(() => {
    sessionDataRef.current = {
      attemptId: studentData?.attemptId,
      id_sesion: studentData?.id_sesion,
    };
  }, [studentData]);

  // Safety net: limpia el overlay si el socket está realmente conectado.
  // Cubre dos casos:
  //   1. isSocketConnectedRef=true (el evento connect disparó normalmente).
  //   2. sock.connected=true pero el ref sigue en false (WiFi volvió dentro del ping-timeout
  //      y socket.io nunca llegó a desconectarse — disconnect/connect no dispararon).
  //      En ese caso re-emitimos join_attempt para que el servidor envíe connection_restored.
  useEffect(() => {
    if (!connectionLost) return;
    const poll = setInterval(() => {
      if (isSocketConnectedRef.current) {
        setConnectionLost(false);
        setConnectionGraceSeconds(null);
        return;
      }
      const sock = socketRef.current;
      if (sock && sock.connected) {
        // Socket sigue vivo (WiFi volvió antes del ping-timeout).
        // Sincronizar ref y limpiar overlay directamente.
        isSocketConnectedRef.current = true;
        setIsSocketConnected(true);
        setConnectionLost(false);
        setConnectionGraceSeconds(null);
        // También re-emitir join_attempt para sincronizar con el servidor
        const { attemptId, id_sesion } = sessionDataRef.current;
        if (attemptId && id_sesion) {
          sock.emit("join_attempt", { attemptId, sessionId: id_sesion });
        }
      } else if (sock && navigator.onLine && !sock.connected && !sock.active) {
        // Internet disponible, socket completamente inactivo.
        // Forzar reconexión (sin disconnect para no interrumpir handshakes en curso).
        console.log("🔄 Polling: internet detectado, socket inactivo, forzando reconexión...");
        sock.connect();
      }
    }, 1000);
    return () => clearInterval(poll);
  }, [connectionLost]);

  // Countdown regresivo durante pérdida de conexión
  useEffect(() => {
    if (!connectionLost || connectionGraceSeconds === null) {
      setGraceCountdown(null);
      return;
    }
    setGraceCountdown(connectionGraceSeconds);
    const interval = setInterval(() => {
      setGraceCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          // Grace expiró client-side — finalizar el examen inmediatamente.
          // El servidor también lo marca como abandonado via su propio timer,
          // pero no podemos esperar ese evento ya que el socket está desconectado.
          setWasAbandoned(true);
          setExamFinished(true);
          examFinishedRef.current = true;
          limpiarDatosExamen();
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          socketRef.current?.disconnect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [connectionLost, connectionGraceSeconds]);

  // Guardar respuestas pendientes al cambiar panel
  useEffect(() => {
    return () => {
      Object.entries(saveTimersRef.current).forEach(
        ([preguntaIdStr, timer]) => {
          const preguntaId = Number(preguntaIdStr);
          clearTimeout(timer);
          if (answers[preguntaId] !== undefined) {
            saveAnswer(preguntaId, answers[preguntaId]);
          }
        },
      );
      saveTimersRef.current = {};
    };
  }, [openPanels]);

  // ----------------------------------------------------------------------
  // 3. FUNCIONES DE ACCIÓN (StartExam, Save, Block)
  // ----------------------------------------------------------------------

  const limpiarDatosExamen = () => {
    // localStorage
    localStorage.removeItem("studentData");
    localStorage.removeItem("currentExam");
    localStorage.removeItem("examBlockedState");
    // sessionStorage
    sessionStorage.clear();
    // Cookies del dominio
    document.cookie.split(";").forEach((c) => {
      document.cookie =
        c.trim().split("=")[0] +
        "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
  };

  const addSecurityViolation = (violation: string) => {
    setSecurityViolations((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${violation}`,
    ]);
  };

  const enqueueAnswer = (
    preguntaId: number,
    respuesta: any,
    tipo_respuesta?: string,
    metadata_codigo?: string,
  ) => {
    const queue = pendingAnswersQueueRef.current;
    const idx = queue.findIndex(
      (a) => a.preguntaId === preguntaId && a.tipo_respuesta === tipo_respuesta,
    );
    const entry = { preguntaId, respuesta, tipo_respuesta, metadata_codigo };
    if (idx >= 0) queue[idx] = entry; // reemplazar con la versión más reciente
    else queue.push(entry);
  };

  const saveAnswer = async (
    preguntaId: number,
    respuesta: any,
    tipo_respuesta?: string,
    metadata_codigo?: string,
  ) => {
    if (!studentData?.attemptId) return;

    // Sin conexión: encolar para reintento al reconectar
    if (!isSocketConnectedRef.current) {
      enqueueAnswer(preguntaId, respuesta, tipo_respuesta, metadata_codigo);
      return;
    }

    const respuestaStr = JSON.stringify(respuesta);
    const cacheKey = tipo_respuesta
      ? `${preguntaId}_${tipo_respuesta}`
      : String(preguntaId);
    if (lastSavedAnswers[cacheKey] === respuestaStr) return;

    setSavingStates((prev) => ({ ...prev, [preguntaId]: true }));
    try {
      const payload: any = {
        intento_id: studentData.attemptId,
        pregunta_id: preguntaId,
        respuesta: respuestaStr,
        fecha_respuesta: new Date().toISOString(),
      };
      if (tipo_respuesta) payload.tipo_respuesta = tipo_respuesta;
      if (metadata_codigo) payload.metadata_codigo = metadata_codigo;

      const response = await fetch(`${ATTEMPTS_API_URL}/api/exam/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Error al guardar respuesta");
      setLastSavedAnswers((prev) => ({ ...prev, [cacheKey]: respuestaStr }));
    } catch (error) {
      // Encolar para reintento — cubre el caso de que el ref aún no se actualizó
      // (ventana entre caída de red y detección del socket)
      enqueueAnswer(preguntaId, respuesta, tipo_respuesta, metadata_codigo);
      console.warn(`⚠️ Respuesta encolada para reintento (pregunta ${preguntaId})`);
    } finally {
      setSavingStates((prev) => ({ ...prev, [preguntaId]: false }));
    }
  };
  saveAnswerRef.current = saveAnswer; // Actualizar en cada render para evitar stale closure

  const handleAnswerChange = (
    preguntaId: number,
    respuesta: any,
    delayMs: number = 3000,
  ) => {
    setAnswers((prev) => ({ ...prev, [preguntaId]: respuesta }));
    if (saveTimersRef.current[preguntaId])
      clearTimeout(saveTimersRef.current[preguntaId]);
    saveTimersRef.current[preguntaId] = window.setTimeout(() => {
      saveAnswer(preguntaId, respuesta);
      delete saveTimersRef.current[preguntaId];
    }, delayMs);
  };

  const mapReasonToEventType = (reason: string): string => {
    if (reason.includes("pantalla completa"))
      return "pantalla_completa_cerrada";
    if (reason.includes("combinación") || reason.includes("tecla"))
      return "combinacion_teclas_prohibida";
    if (reason.includes("foco")) return "foco_perdido";
    if (
      reason.includes("copiar") ||
      reason.includes("pegar") ||
      reason.includes("imprimir")
    )
      return "intento_copiar_pegar_imprimir";
    if (reason.includes("código")) return "manipulacion_codigo";
    if (reason.includes("pestaña")) return "pestana_cambiada";
    return "pestana_cambiada";
  };

  const blockExam = async (
    reason: string,
    severity: "INFO" | "WARNING" | "CRITICAL" = "CRITICAL",
  ) => {
    if (examBlocked) return;
    if (examData?.consecuencia === "ninguna") return;

    const tipoEvento = mapReasonToEventType(reason);
    addSecurityViolation(`[${severity}] ${reason}`);

    if (studentData?.attemptId) {
      try {
        await fetch(`${ATTEMPTS_API_URL}/api/exam/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intento_id: studentData.attemptId,
            tipo_evento: tipoEvento,
            fecha_envio: new Date().toISOString(),
          }),
        });
      } catch (e) {
        // Sin conexión: guardar el evento pendiente para enviarlo al reconectar
        console.error("Error enviando evento (sin conexión):", e);
        if (examData?.consecuencia !== "notificar") {
          localStorage.setItem(
            "examBlockedState",
            JSON.stringify({ attemptId: studentData.attemptId, reason, tipoEvento, pendingReport: true }),
          );
        }
      }
    }

    if (examData?.consecuencia === "notificar") return;
    setExamBlocked(true);
    setBlockReason(reason);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (studentData?.attemptId) {
      localStorage.setItem(
        "examBlockedState",
        JSON.stringify({ attemptId: studentData.attemptId, reason, tipoEvento }),
      );
    }
  };

  // Función para cerrar la página / salir
  const handleCloseApp = () => {
    examFinishedRef.current = true;
    if (studentData?.attemptId) {
      if (socket) socket.emit("leave_attempt", studentData.attemptId);
      fetch(
        `${ATTEMPTS_API_URL}/api/exam/attempt/${studentData.attemptId}/abandon`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        },
      ).catch(() => {});
    }

    // Salir de pantalla completa
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    // Mostrar pantalla de abandono en vez de redirigir
    setWasAbandoned(true);
    setExamFinished(true);
    limpiarDatosExamen();

    try {
      window.close();
    } catch (e) {
      console.log("No se pudo cerrar la ventana automáticamente");
    }
  };

  // Calcular preguntas sin responder
  const getUnansweredCount = () => {
    if (!examData?.questions || !Array.isArray(examData.questions)) return 0;
    let answered = 0;
    examData.questions.forEach((q: any) => {
      const ans = answers[q.id];
      if (ans) {
        if (Array.isArray(ans) && ans.length > 0) {
          // Verificar si es fill_blanks que tenga al menos un campo lleno
          if (q.type === "fill_blanks") {
            if (ans.some((s: string) => s && s.trim().length > 0)) answered++;
          } else {
            answered++;
          }
        } else if (typeof ans === "string" && ans.trim().length > 0) answered++;
      }
    });
    return examData.questions.length - answered;
  };

  // Lógica de entrega final
  const submitExam = async () => {
    setIsSubmitting(true);
    console.log("💾 Guardando respuestas pendientes antes de entregar...");

    // Guardar respuestas normales pendientes (exámenes con preguntas)
    const savePromises = Object.entries(saveTimersRef.current).map(
      async ([preguntaIdStr, timer]) => {
        const preguntaId = Number(preguntaIdStr);
        clearTimeout(timer);
        if (answers[preguntaId] !== undefined)
          await saveAnswer(preguntaId, answers[preguntaId]);
      },
    );
    await Promise.all(savePromises);
    saveTimersRef.current = {};

    // Guardar respuestas PDF pendientes (texto, código, diagrama)
    if (examData?.archivoPDF) {
      // Cancelar timers pendientes de PDF
      Object.values(pdfSaveTimersRef.current).forEach((t) => clearTimeout(t));
      pdfSaveTimersRef.current = {};

      const pdfSaves: Promise<void>[] = [];
      if (answerPanelContent) {
        pdfSaves.push(
          saveAnswer(PDF_ANSWER_ID, answerPanelContent, "texto_plano"),
        );
      }
      if (examData.incluirPython && pythonCells.length > 0) {
        const cleaned = cleanCellsForSave(pythonCells);
        const codeCells = cleaned.filter((c: any) => c.type === "code").length;
        const textCells = cleaned.filter(
          (c: any) => c.type === "markdown",
        ).length;
        pdfSaves.push(
          saveAnswer(
            PDF_PYTHON_ID,
            cleaned,
            "python",
            JSON.stringify({
              totalCells: cleaned.length,
              codeCells,
              textCells,
            }),
          ),
        );
      }
      if (examData.incluirJavascript && jsCells.length > 0) {
        const cleaned = cleanCellsForSave(jsCells);
        const codeCells = cleaned.filter((c: any) => c.type === "code").length;
        const htmlCells = cleaned.filter((c: any) => c.type === "html").length;
        const textCells = cleaned.filter(
          (c: any) => c.type === "markdown",
        ).length;
        pdfSaves.push(
          saveAnswer(
            PDF_JS_ID,
            cleaned,
            "javascript",
            JSON.stringify({
              totalCells: cleaned.length,
              codeCells,
              htmlCells,
              textCells,
            }),
          ),
        );
      }
      if (examData.incluirHojaExcel && hojaCalcState) {
        const clean = cleanHojaForSave(hojaCalcState);
        const totalCells = Object.values(
          clean.allCells as Record<number, Record<string, any>>,
        ).reduce(
          (sum, sheet) =>
            sum +
            Object.values(sheet).filter((c: any) => c.value || c.formula)
              .length,
          0,
        );
        const chartsCount = Object.values(
          clean.allCharts as Record<number, any[]>,
        ).reduce((sum, charts) => sum + charts.length, 0);
        pdfSaves.push(
          saveAnswer(
            PDF_HOJA_ID,
            clean,
            "hoja_calculo",
            JSON.stringify({
              sheetsCount: clean.sheets.length,
              totalCells,
              chartsCount,
            }),
          ),
        );
      }
      if (examData.incluirHerramientaDibujo && lienzoState) {
        const cleanState = cleanLienzoForSave(lienzoState);
        const totalNodes = cleanState.sheets.reduce(
          (sum: number, s: any) => sum + s.nodes.length,
          0,
        );
        const totalConnections = cleanState.sheets.reduce(
          (sum: number, s: any) => sum + s.connections.length,
          0,
        );
        pdfSaves.push(
          saveAnswer(
            PDF_LIENZO_ID,
            cleanState,
            "diagrama",
            JSON.stringify({
              sheetsCount: cleanState.sheets.length,
              totalNodes,
              totalConnections,
            }),
          ),
        );
      }
      await Promise.all(pdfSaves);
      console.log("✅ Respuestas PDF guardadas");
    }
    console.log("✅ Todas las respuestas guardadas, entregando examen...");

    if (studentData?.attemptId) {
      try {
        await fetch(
          `${ATTEMPTS_API_URL}/api/exam/attempt/${studentData.attemptId}/finish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );
        // Mostrar pantalla de finalización
        examFinishedRef.current = true;
        setExamFinished(true);
        limpiarDatosExamen();

        // Salir de pantalla completa
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }

        try {
          window.close();
        } catch (e) {
          console.log("No se pudo cerrar automáticamente");
        }
      } catch (error: any) {
        console.error("Error al entregar el examen:", error);
        mostrarError(
          "Error al entregar el examen",
          error?.message ||
            "No se pudo completar la entrega. Intenta nuevamente o contacta a tu profesor.",
        );
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(false);
    }
  };

  // Fisher-Yates usando crypto.getRandomValues() para mayor aleatoriedad
  const shuffleArray = (array: any[]) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      const j = randomBytes[0] % (i + 1);
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  // ✅ FUNCION startExam RESTAURADA COMPLETAMENTE
  const startExam = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      if (!studentData || !examData) {
        mostrarError(
          "Error al iniciar",
          "No se encontraron los datos del examen. Regresa al acceso y vuelve a intentarlo.",
        );
        setIsStarting(false);
        return;
      }

      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      if (widthDiff > 200 || heightDiff > 200) {
        return;
      }

      let attempt: { id: number };
      let examInProgress: {
        codigo_acceso: string;
        id_sesion: string;
        fecha_expiracion: string | null;
      };

      if (
        studentData.isResuming &&
        studentData.attemptId &&
        studentData.id_sesion
      ) {
        // Caso reanudación: usar datos de sesión existentes, sin crear nuevo intento
        console.log("🔄 Reanudando intento:", studentData.attemptId);
        attempt = { id: studentData.attemptId };
        examInProgress = {
          codigo_acceso: studentData.codigo_acceso!,
          id_sesion: studentData.id_sesion,
          fecha_expiracion: studentData.fecha_expiracion ?? null,
        };
      } else {
        // Caso normal: crear nuevo intento
        const attemptPayload = {
          codigo_examen: studentData.examCode,
          nombre_estudiante: studentData.nombre || undefined,
          correo_estudiante: studentData.correoElectronico || undefined,
          identificacion_estudiante: studentData.codigoEstudiante || undefined,
          contrasena: studentData.contrasena || undefined,
        };

        console.log("🚀 Creando intento con:", attemptPayload);

        const res = await fetch(`${ATTEMPTS_API_URL}/api/exam/attempt/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attemptPayload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Error al crear intento");
        }

        const result = await res.json();
        attempt = result.attempt;
        examInProgress = result.examInProgress;
        console.log("✅ Intento creado:", attempt);
      }

      console.log("📘 Cargando preguntas del examen...");

      const examDetailsRes = await fetch(
        `${EXAMS_API_URL}/api/exams/forAttempt/${studentData.examCode}`,
      );

      if (!examDetailsRes.ok)
        throw new Error("Error al cargar detalles del examen");

      const examDetails = await examDetailsRes.json();

      // Aleatorizar el orden de las preguntas
      if (examDetails.questions && Array.isArray(examDetails.questions)) {
        if (!studentData.isResuming && examDetails.ordenAleatorio) {
          // Intento nuevo: mezclar y guardar el orden en el backend
          examDetails.questions = shuffleArray(examDetails.questions);
          const questionIds = examDetails.questions.map((q: any) => q.id);
          try {
            await fetch(
              `${ATTEMPTS_API_URL}/api/exam/attempt/${attempt.id}/question-order`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ questionIds }),
              },
            );
          } catch (e) {
            console.warn("No se pudo guardar el orden de preguntas:", e);
          }
        } else if (studentData.isResuming && studentData.ordenPreguntas) {
          // Reanudación: aplicar el orden guardado
          try {
            const savedOrder: number[] = JSON.parse(studentData.ordenPreguntas);
            const questionMap = new Map(
              examDetails.questions.map((q: any) => [q.id, q]),
            );
            const ordered = savedOrder
              .map((id: number) => questionMap.get(id))
              .filter(Boolean);
            // Si hay preguntas nuevas que no estaban en el orden guardado, agregarlas al final
            const savedSet = new Set(savedOrder);
            const extras = examDetails.questions.filter(
              (q: any) => !savedSet.has(q.id),
            );
            examDetails.questions = [...ordered, ...extras];
          } catch (e) {
            console.warn("No se pudo aplicar el orden guardado:", e);
          }
        }
      }

      console.log("✅ Preguntas cargadas:", examDetails);

      setExamData(examDetails);

      const updatedStudentData: StudentData = {
        ...studentData,
        isResuming: false,
        startTime: studentData.startTime || new Date().toISOString(),
        attemptId: attempt.id,
        codigo_acceso: examInProgress.codigo_acceso,
        id_sesion: examInProgress.id_sesion,
        fecha_expiracion: examInProgress.fecha_expiracion,
      };

      setStudentData(updatedStudentData);
      localStorage.setItem("studentData", JSON.stringify(updatedStudentData));

      // Restaurar respuestas guardadas al reanudar
      if (studentData.isResuming) {
        const savedAnswersRaw = localStorage.getItem("savedAnswers");

        // Para exámenes secuenciales sin retroceso: restaurar posición de pregunta
        if (savedAnswersRaw && !examDetails.permitirVolverPreguntas) {
          try {
            const savedAns: Array<{ pregunta_id: number }> = JSON.parse(savedAnswersRaw);
            const answeredIds = new Set(savedAns.map((a: any) => a.pregunta_id));
            const questionList: Array<{ id: number }> = examDetails.questions;
            let idx = 0;
            for (let i = 0; i < questionList.length; i++) {
              if (answeredIds.has(questionList[i].id)) idx = i + 1;
              else break;
            }
            setInitialQuestionIndex(idx); // >= length means allDone screen
          } catch {
            // Dejar en 0
          }
        }
        if (savedAnswersRaw) {
          try {
            const savedAnswers: Array<{
              pregunta_id: number;
              respuesta: string;
              tipo_respuesta: string;
            }> = JSON.parse(savedAnswersRaw);

            const restoredAnswers: Record<number, any> = {};
            for (const answer of savedAnswers) {
              try {
                const parsed = JSON.parse(answer.respuesta);
                if (answer.tipo_respuesta === "texto_plano") {
                  setAnswerPanelContent(parsed);
                } else if (answer.tipo_respuesta === "python") {
                  setPythonCells(parsed);
                } else if (answer.tipo_respuesta === "javascript") {
                  setJsCells(parsed);
                } else if (answer.tipo_respuesta === "hoja_calculo") {
                  setHojaCalcState(parsed);
                } else if (answer.tipo_respuesta === "diagrama") {
                  setLienzoState(parsed);
                } else {
                  restoredAnswers[answer.pregunta_id] = parsed;
                }
              } catch {
                restoredAnswers[answer.pregunta_id] = answer.respuesta;
              }
            }
            if (Object.keys(restoredAnswers).length > 0) {
              setAnswers(restoredAnswers);
            }
          } catch (e) {
            console.error("Error al restaurar respuestas guardadas:", e);
          }
          localStorage.removeItem("savedAnswers");
        }
      }

      const newSocket = io(ATTEMPTS_API_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      newSocket.on("connect", () => {
        console.log("✅ Conectado al WebSocket");
        // Re-join en cada conexión (incluye reconexiones)
        newSocket.emit("join_attempt", {
          attemptId: attempt.id,
          sessionId: examInProgress.id_sesion,
        });
      });

      newSocket.on("session_conflict", (data) => {
        blockExam(data.message, "CRITICAL");
      });

      newSocket.on("session_replaced", () => {
        // No usar blockExam — no escribir examBlockedState ni enviar evento de seguridad.
        // Solo notificar al usuario que su sesión fue desplazada por un acceso nuevo.
        setSessionReplaced(true);
        newSocket.disconnect();
      });

      // Si el tiempo límite fue eliminado mientras el estudiante estaba desconectado,
      // el servidor devuelve fecha_expiracion: null en joined_attempt al reconectar.
      newSocket.on("joined_attempt", (data: { fecha_expiracion: string | null }) => {
        if (!data.fecha_expiracion && examInProgress.fecha_expiracion) {
          setTimeLimitRemoved(true);
          setTimerStatus("normal");
          setTimerAlert(null);
        }
      });
      newSocket.on(
        "time_expired",
        (data: { limiteTiempoCumplido?: string }) => {
          setWasTimeExpired(
            data?.limiteTiempoCumplido === "descartar" ? "descartar" : "enviar",
          );
          setExamFinished(true);
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
        },
      );
      newSocket.on("fraud_detected", (data) =>
        addSecurityViolation(`Fraude: ${data.tipo_evento}`),
      );
      newSocket.on("attempt_blocked", (data) => {
        setExamBlocked(true);
        setBlockReason(data.message);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      });
      newSocket.on("attempt_unlocked", (data) => {
        console.log("✅ Examen desbloqueado por el profesor", data);
        setExamBlocked(false);
        setBlockReason("");
        localStorage.removeItem("examBlockedState");
        // Marcar isResuming por si examStarted es false (socket caído + recarga)
        setStudentData((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, isResuming: true };
          localStorage.setItem("studentData", JSON.stringify(updated));
          return updated;
        });
        setShowUnlockScreen(true);

        try {
          window.focus();
        } catch (err) {
          console.warn("⚠️ No se pudo dar foco a la ventana:", err);
        }
      });
      newSocket.on("attempt_finished", () => {
        setExamFinished(true);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      });

      newSocket.on("time_limit_removed", () => {
        console.log("✅ Profesor eliminó el tiempo límite");
        setTimeLimitRemoved(true);
        setTimerStatus("normal");
        setTimerAlert({
          message: "El profesor ha quitado el tiempo límite del examen",
          type: "success",
        });
        alertsShownRef.current = { warning: false, critical: false };
      });

      newSocket.on("forced_finish", (data) => {
        console.log("⚠️ Examen forzado a terminar por el profesor", data);
        setWasForced(data.tipo === "individual" ? "individual" : "todos");
        setExamFinished(true);
        limpiarDatosExamen();

        // Salir de pantalla completa
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }

        // Desconectar el socket
        newSocket.disconnect();
      });

      // --- EVENTOS DE CONEXIÓN / DESCONEXIÓN ---
      newSocket.on("connect", () => {
        // Actualizar refs de señal
        isSocketConnectedRef.current = true;
        setIsSocketConnected(true);

        // Si el overlay de "sin conexión" estaba activo, limpiarlo directamente.
        // No depender solo de connection_restored del servidor (puede fallar si la DB
        // del servidor aún no está disponible al reconectar).
        if (connectionLostRef.current) {
          connectionLostRef.current = false;
          setConnectionLost(false);
          setConnectionGraceSeconds(null);
          setGraceCountdown(null);
        }

        // Reenviar respuestas encoladas durante la desconexión
        const pending = [...pendingAnswersQueueRef.current];
        pendingAnswersQueueRef.current = [];
        for (const a of pending) {
          saveAnswerRef.current?.(a.preguntaId, a.respuesta, a.tipo_respuesta, a.metadata_codigo);
        }
      });

      newSocket.on("disconnect", (reason) => {
        isSocketConnectedRef.current = false;
        setIsSocketConnected(false);

        const isTransient =
          reason === "transport close" ||
          reason === "transport error" ||
          reason === "ping timeout";

        if (isTransient) {
          setConnectionLost(true);
          setConnectionGraceSeconds(GRACE_SECONDS);
          if (studentData?.attemptId) {
            fetch(
              `${ATTEMPTS_API_URL}/api/exam/attempt/${studentData.attemptId}/connection-lost`,
              { method: "POST", keepalive: true },
            ).catch(() => {});
          }
        }
      });

      // connection_restored = servidor confirmó reconexión exitosa → limpiar overlay
      newSocket.on("connection_restored", () => {
        setConnectionLost(false);
        setConnectionGraceSeconds(null);
        setGraceCountdown(null);
      });

      // connect_error: el polling del useEffect se encarga de reintentar automáticamente.

      // El timer de gracia expiró — intento marcado como abandonado mientras no había conexión
      newSocket.on("attempt_auto_abandoned", () => {
        setConnectionLost(false);
        setGraceCountdown(null);
        setWasAbandoned(true);
        setExamFinished(true);
        limpiarDatosExamen();
        if (document.fullscreenElement)
          document.exitFullscreen().catch(() => {});
        newSocket.disconnect();
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
      // Silenciar eventos de seguridad hasta que la pantalla completa esté activa
      startupGraceRef.current = true;
      setExamStarted(true);

      // Resetear alertas de tiempo
      alertsShownRef.current = { warning: false, critical: false };
      setTimerStatus("normal");
      setTimerAlert(null);

      setOpenPanels(["exam"]);
      setPanelSizes([100]);
      setPanelZooms([100]);

      // Usar document.documentElement en lugar de fullscreenRef: el ref apunta al contenedor
      // del examen que React aún no ha renderizado (setExamStarted acaba de llamarse arriba).
      // La gracia se libera inmediatamente tras entrar en fullscreen — sin ventana ciega.
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (err) {
          if (!document.hidden)
            addSecurityViolation("No se pudo activar pantalla completa");
        }
      }
      startupGraceRef.current = false;
    } catch (error: any) {
      console.error("❌ Error al iniciar examen:", error);
      mostrarError(
        "Error al iniciar el examen",
        error?.message ||
          "Ocurrió un error inesperado. Recarga la página e intenta nuevamente.",
      );
      setIsStarting(false);
    }
  };

  // ----------------------------------------------------------------------
  // 4. HANDLERS DE UI Y EVENTOS
  // ----------------------------------------------------------------------

  useEffect(() => {
    let fullscreenTimeout: ReturnType<typeof setTimeout>;
    const handleFullscreenChange = () => {
      clearTimeout(fullscreenTimeout);
      fullscreenTimeout = setTimeout(() => {
        if (
          !examStarted ||
          document.fullscreenElement ||
          examBlocked ||
          isSubmitting ||
          examFinished ||
          connectionLostRef.current
        ) return;
        // Si la pantalla completa se perdió después de estar activa → bloquear.
        // Si aún no se había establecido (arranque), startupGraceRef silencia esto.
        if (startupGraceRef.current) return;
        blockExam("El examen requiere pantalla completa. Se detectó que saliste de ella", "CRITICAL");
      }, 100);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!examStarted || examBlocked) return;
      // Bloquear Tab solo si el foco está fuera de elementos interactivos (inputs, editores, canvas)
      if (e.key === "Tab") {
        const active = document.activeElement;
        const enElementoInteractivo = active && (
          active.tagName === "TEXTAREA" ||
          active.tagName === "INPUT" ||
          active.getAttribute("contenteditable") === "true" ||
          !!active.closest("[contenteditable='true']") ||
          !!active.closest(".cm-editor") ||       // CodeMirror
          !!active.closest(".monaco-editor") ||   // Monaco
          !!active.closest("canvas")              // Lienzo / dibujo
        );
        if (!enElementoInteractivo) {
          e.preventDefault();
        }
        return;
      }
      const blockedKeys = ["F11", "F12", "F1", "F5", "PrintScreen"];
      if (e.metaKey || blockedKeys.includes(e.key)) {
        e.preventDefault();
        blockExam(`Se presionó una tecla no permitida durante el examen (${e.key})`, "CRITICAL");
      }
    };

    const handleVisibilityChange = () => {
      if (!examStarted || examBlocked || isSubmitting || examFinished || connectionLostRef.current) return;
      if (startupGraceRef.current) return;
      if (document.hidden) {
        blockExam("Se detectó que cambiaste de pestaña o minimizaste el navegador", "CRITICAL");
      }
      // "visible sin fullscreen" lo detecta handleFullscreenChange
    };

    const handleWindowFocus = () => {
      // Ganar foco no es una violación; la pérdida de fullscreen la detecta handleFullscreenChange.
    };

    const handleBlur = () => {
      // Solo es violación perder el foco cuando YA estamos en pantalla completa.
      // Durante el arranque (requestFullscreen aún no se ha establecido) el navegador
      // dispara blur/focus de forma normal — ignorarlo evita falsos bloqueos al reanudar.
      if (!document.fullscreenElement) return;
      if (!examStarted || examBlocked || isSubmitting || examFinished || connectionLostRef.current) return;
      // Durante el arranque, el navegador puede disparar blur al mostrar la barra de
      // notificación de pantalla completa — silenciar igual que handleFullscreenChange.
      if (startupGraceRef.current) return;
      blockExam("Se detectó que la ventana del examen perdió el foco (posible cambio de aplicación)", "CRITICAL");
    };

    const handleBeforeUnload = () => {
      // No marcar como abandonado si la red ya estaba caída — el server maneja el grace period
      if (examStarted && !examFinishedRef.current && !connectionLostRef.current && studentData?.attemptId) {
        fetch(
          `${ATTEMPTS_API_URL}/api/exam/attempt/${studentData.attemptId}/abandon`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
          },
        ).catch(() => {});
      }
    };

    // Detección inmediata de pérdida de red (antes de que socket.io detecte el disconnect)
    const handleOffline = () => {
      if (!examStarted || examFinishedRef.current) return;
      // Marcar inmediatamente como desconectado para el overlay y el polling.
      // isSocketConnectedRef=false evita que el polling lo limpie antes de reconectar.
      isSocketConnectedRef.current = false;
      connectionLostRef.current = true;
      setIsSocketConnected(false);
      setConnectionLost(true);
      setConnectionGraceSeconds(GRACE_SECONDS);

      if (studentData?.attemptId) {
        fetch(
          `${ATTEMPTS_API_URL}/api/exam/attempt/${studentData.attemptId}/connection-lost`,
          { method: "POST", keepalive: true },
        ).catch(() => {});
      }
    };

    // Con reconnection:true, socket.io reconecta automáticamente.
    // handleOnline cubre dos casos adicionales:
    //   A) WiFi volvió dentro del ping-timeout: sock.connected=true pero isSocketConnectedRef=false.
    //      Re-emitir join_attempt para que el servidor envíe connection_restored.
    //   B) sock.active=false (socket completamente desconectado): forzar reconexión inmediata.
    const handleOnline = () => {
      if (!examStarted || examFinishedRef.current) return;
      const sock = socketRef.current;
      if (!sock) return;

      if (sock.connected) {
        // Caso A: socket nunca se desconectó realmente (caída rápida de WiFi).
        isSocketConnectedRef.current = true;
        connectionLostRef.current = false;
        setIsSocketConnected(true);
        setConnectionLost(false);
        setConnectionGraceSeconds(null);
        setGraceCountdown(null);
        const { attemptId, id_sesion } = sessionDataRef.current;
        if (attemptId && id_sesion) {
          sock.emit("join_attempt", { attemptId, sessionId: id_sesion });
        }
      } else {
        // Socket no está conectado — forzar reconexión inmediata.
        console.log("🔄 handleOnline: forzando reconexión de socket...");
        sock.connect();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearTimeout(fullscreenTimeout);
    };
  }, [examStarted, examBlocked, isSubmitting, examFinished, studentData]);

  const handleEscapeFromBlock = () => {
    if (document.fullscreenElement) document.exitFullscreen();
  };

  // Reanudación via código de acceso: fullscreen ANTES de iniciar para que el gesto del usuario sea directo
  const handleLaunchResume = async () => {
    startupGraceRef.current = true;
    // requestFullscreen debe estar en el hilo del gesto del usuario — llamarlo aquí garantiza que funcione
    await document.documentElement.requestFullscreen().catch(() => {});
    await startExam();
  };

  const openPanel = (panelType: PanelType) => {
    // En mobile: un solo panel a la vez — siempre reemplaza
    if (window.innerWidth < 768) {
      if (openPanels[0] === panelType) {
        // Ya está activo, solo cerrar sidebar
        setSidebarCollapsed(true);
        return;
      }
      setOpenPanels([panelType]);
      setPanelSizes([100]);
      setPanelZooms([100]);
      setSidebarCollapsed(true);
      return;
    }

    const panelIndex = openPanels.indexOf(panelType);
    if (panelIndex !== -1) {
      closePanel(panelIndex);
      return;
    }

    // Lógica para reemplazar herramientas si ya hay una abierta (o el panel "answer")
    const tools: PanelType[] = [
      "calculadora",
      "excel",
      "dibujo",
      "javascript",
      "python",
    ];

    // Si se abre "answer" y hay una herramienta abierta, reemplazarla
    if (panelType === "answer") {
      const existingToolIndex = openPanels.findIndex((p) => tools.includes(p));
      if (existingToolIndex !== -1) {
        const newPanels = [...openPanels];
        newPanels[existingToolIndex] = panelType;
        setOpenPanels(newPanels);
        const newZooms = [...panelZooms];
        newZooms[existingToolIndex] = 100;
        setPanelZooms(newZooms);
        setPanelSizes(calculateOptimalSizes(newPanels));
        return;
      }
    }

    if (tools.includes(panelType)) {
      let existingToolIndex = openPanels.findIndex((p) => tools.includes(p));
      // Si no hay herramienta abierta, revisar si "answer" está abierto para reemplazarlo
      if (existingToolIndex === -1) {
        existingToolIndex = openPanels.indexOf("answer");
      }
      if (existingToolIndex !== -1) {
        let newPanels = [...openPanels];
        newPanels[existingToolIndex] = panelType;

        // Restricción Lienzo: Si hay dibujo, máximo 2 paneles para evitar bugs visuales
        if (newPanels.includes("dibujo") && newPanels.length > 2) {
          newPanels = [newPanels[0], panelType];
          setOpenPanels(newPanels);
          setPanelSizes(calculateOptimalSizes(newPanels));
          setPanelZooms([panelZooms[0], 100]);
          return;
        }

        setOpenPanels(newPanels);
        const newZooms = [...panelZooms];
        newZooms[existingToolIndex] = 100;
        setPanelZooms(newZooms);

        // Recalcular tamaños óptimos al cambiar de herramienta
        setPanelSizes(calculateOptimalSizes(newPanels));
        return;
      }
    }

    // Restricción Lienzo al agregar nuevo panel: Si ya hay 2 y uno es dibujo o el nuevo es dibujo -> Reemplazar el segundo
    if (
      openPanels.length >= 2 &&
      (panelType === "dibujo" || openPanels.includes("dibujo"))
    ) {
      const newPanels = [openPanels[0], panelType];
      setOpenPanels(newPanels);
      setPanelSizes(calculateOptimalSizes(newPanels));
      setPanelZooms([panelZooms[0], 100]);
      return;
    }

    if (openPanels.length >= 2) {
      return;
    }
    const newPanels = [...openPanels, panelType];
    setOpenPanels(newPanels);

    // Calcular tamaños iniciales basados en los mínimos de cada panel
    setPanelSizes(calculateOptimalSizes(newPanels));
    setPanelZooms([...panelZooms, 100]);
  };

  const closePanel = (index: number) => {
    const newPanels = openPanels.filter((_, i) => i !== index);
    setOpenPanels(newPanels);
    setPanelSizes(newPanels.map(() => 100 / newPanels.length));
    setPanelZooms(panelZooms.filter((_, i) => i !== index));
  };

  const adjustPanelZoom = (index: number, delta: number) => {
    const newZooms = [...panelZooms];
    newZooms[index] = Math.max(50, Math.min(200, newZooms[index] + delta));
    setPanelZooms(newZooms);
  };

  const handleDragStart = (index: number) => setDraggedPanelIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPanelIndex !== null && draggedPanelIndex !== index)
      setDragOverIndex(index);
  };
  const handleDrop = (index: number) => {
    if (draggedPanelIndex !== null && draggedPanelIndex !== index) {
      const newPanels = [...openPanels];
      const newSizes = [...panelSizes];
      const newZooms = [...panelZooms];

      [newPanels[draggedPanelIndex], newPanels[index]] = [
        newPanels[index],
        newPanels[draggedPanelIndex],
      ];
      [newSizes[draggedPanelIndex], newSizes[index]] = [
        newSizes[index],
        newSizes[draggedPanelIndex],
      ];
      [newZooms[draggedPanelIndex], newZooms[index]] = [
        newZooms[index],
        newZooms[draggedPanelIndex],
      ];

      setOpenPanels(newPanels);
      setPanelSizes(newSizes);
      setPanelZooms(newZooms);
    }
    setDraggedPanelIndex(null);
    setDragOverIndex(null);
  };

  const startResize = (index: number, e: React.MouseEvent) => {
    setIsResizing(true);
    setResizingIndex(index);
    setStartPos(layout === "vertical" ? e.clientX : e.clientY);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing && resizingIndex !== null) {
        const currentPos = layout === "vertical" ? e.clientX : e.clientY;
        const containerSize =
          layout === "vertical"
            ? window.innerWidth - (sidebarCollapsed ? 80 : 256)
            : window.innerHeight;
        const delta = ((currentPos - startPos) / containerSize) * 100;
        const newSizes = [...panelSizes];

        const minSizeLeft = getMinSize(
          openPanels[resizingIndex],
          openPanels.length,
        );
        const minSizeRight = getMinSize(
          openPanels[resizingIndex + 1],
          openPanels.length,
        );

        if (
          newSizes[resizingIndex] + delta >= minSizeLeft &&
          newSizes[resizingIndex + 1] - delta >= minSizeRight
        ) {
          newSizes[resizingIndex] += delta;
          newSizes[resizingIndex + 1] -= delta;
          setPanelSizes(newSizes);
          setStartPos(currentPos);
        }
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isResizing,
    resizingIndex,
    layout,
    sidebarCollapsed,
    panelSizes,
    openPanels,
  ]);

  // ----------------------------------------------------------------------
  // 5. RENDERIZADO DE PANELES - ✅ AQUÍ ESTÁN LAS HERRAMIENTAS INTEGRADAS
  // ----------------------------------------------------------------------

  const renderPanel = (panel: PanelType, zoomLevel: number = 100) => {
    switch (panel) {
      case "exam":
        return (
          <div className="relative h-full w-full">
            <ExamPanel
              examData={examData}
              darkMode={darkMode}
              answers={answers}
              onAnswerChange={handleAnswerChange}
              onTerminarRevision={() => setShowSubmitModal(true)}
              remainingTime={remainingTime}
              timerStatus={timerStatus}
              timeLimitRemoved={timeLimitRemoved}
              initialQuestionIndex={initialQuestionIndex}
              onQuestionIndexChange={setInitialQuestionIndex}
              attemptId={studentData?.attemptId}
            />
          </div>
        );

      case "answer":
        return (
          <div className="h-full w-full">
            <EditorTexto
              value={answerPanelContent}
              onChange={setAnswerPanelContent}
              darkMode={darkMode}
              fullHeight={true}
              maxLength={10000}
            />
          </div>
        );

      case "calculadora":
        return (
          <Calculadora
            darkMode={darkMode}
            initialState={calculatorState}
            onSave={setCalculatorState}
          />
        );

      case "excel":
        return (
          <HojaCalculo
            darkMode={darkMode}
            initialData={hojaCalcState}
            onSave={setHojaCalcState}
          />
        );

      case "dibujo":
        return (
          <Lienzo
            darkMode={darkMode}
            initialData={lienzoState}
            onSave={setLienzoState}
          />
        );

      case "javascript":
        return (
          <EditorJavaScript
            darkMode={darkMode}
            initialCells={jsCells}
            onSave={(data) => setJsCells(data.cells)}
            zoomLevel={zoomLevel}
          />
        );

      case "python":
        return (
          <EditorPython
            darkMode={darkMode}
            initialCells={pythonCells}
            onSave={(data) => setPythonCells(data.cells)}
            zoomLevel={zoomLevel}
          />
        );

      default:
        return null;
    }
  };

  // ----------------------------------------------------------------------
  // 6. RENDERIZADO PRINCIPAL (Layout Dashboard)
  // ----------------------------------------------------------------------

  // Guard: si no hay datos de sesión y el examen no está activo, redirigir a acceso
  if (!examStarted && !examFinished && !localStorage.getItem("studentData")) {
    return <Navigate to="/exam-access" replace />;
  }

  if (examFinished) {
    const isRedScreen = wasAbandoned || wasTimeExpired === "descartar";
    const isAmberScreen = wasForced || wasTimeExpired === "enviar";

    const accent = isRedScreen
      ? {
          bar: "bg-red-500",
          ring: "ring-red-500/20",
          iconBg: darkMode ? "bg-red-500/15" : "bg-red-50",
          iconText: darkMode ? "text-red-400" : "text-red-500",
          title: darkMode ? "text-red-400" : "text-red-600",
        }
      : isAmberScreen
        ? {
            bar: "bg-blue-500",
            ring: "ring-blue-500/20",
            iconBg: darkMode ? "bg-blue-500/15" : "bg-blue-50",
            iconText: darkMode ? "text-blue-400" : "text-blue-500",
            title: darkMode ? "text-blue-400" : "text-blue-600",
          }
        : {
            bar: "bg-emerald-500",
            ring: "ring-emerald-500/20",
            iconBg: darkMode ? "bg-emerald-500/15" : "bg-emerald-50",
            iconText: darkMode ? "text-emerald-400" : "text-emerald-600",
            title: darkMode ? "text-emerald-400" : "text-emerald-700",
          };

    const titleText = wasAbandoned
      ? "Examen Abandonado"
      : wasTimeExpired
        ? "Tiempo Agotado"
        : wasForced
          ? "Examen Finalizado por el Profesor"
          : "¡Examen Entregado!";

    const bodyText = wasAbandoned
      ? "Has abandonado el examen. Solo podrás reanudarlo si tu profesor lo autoriza."
      : wasTimeExpired === "descartar"
        ? "El tiempo del examen ha finalizado. Tus respuestas han sido descartadas por superar el límite permitido."
        : wasTimeExpired === "enviar"
          ? "El tiempo del examen ha finalizado. Tus respuestas fueron guardadas y enviadas automáticamente."
          : wasForced === "todos"
            ? "El profesor ha cerrado el examen para todos los estudiantes. Tus respuestas han sido guardadas correctamente."
            : wasForced === "individual"
              ? "El profesor ha finalizado tu examen de forma individual. Tus respuestas han sido guardadas correctamente."
              : "Tus respuestas han sido registradas con éxito. El profesor podrá ver tus resultados.";

    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${darkMode ? "bg-slate-900" : "bg-gray-50"}`}>
        <div className={`w-full max-w-sm rounded-2xl shadow-xl overflow-hidden ring-1 ${accent.ring} ${darkMode ? "bg-slate-800" : "bg-white"}`}>
          <div className={`h-1 w-full ${accent.bar}`} />

          <div className="px-8 py-9 text-center space-y-4">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${accent.iconBg}`}>
              {isRedScreen ? (
                <AlertTriangle className={`w-8 h-8 ${accent.iconText}`} />
              ) : wasTimeExpired ? (
                <Clock className={`w-8 h-8 ${accent.iconText}`} />
              ) : (
                <CheckCircle2 className={`w-8 h-8 ${accent.iconText}`} />
              )}
            </div>

            <h1 className={`text-xl font-bold ${accent.title}`}>
              {titleText}
            </h1>

            <p className={`text-sm leading-relaxed ${darkMode ? "text-slate-400" : "text-gray-500"}`}>
              {bodyText}
            </p>

            <div className={`border-t pt-3 ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
              <p className={`text-xs ${darkMode ? "text-slate-500" : "text-gray-400"}`}>
                Ya puedes cerrar esta ventana.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionReplaced) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-800 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-10 text-center max-w-lg">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Sesión reemplazada</h1>
          <p className="text-gray-600">
            Accediste al examen desde otro lugar. Esta pestaña ha sido cerrada.
          </p>
        </div>
      </div>
    );
  }

  if (examBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-900 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-10 text-center max-w-lg">
          <AlertTriangle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Examen Bloqueado</h1>
          <p className="text-gray-600">{blockReason}</p>
        </div>
      </div>
    );
  }

  if (!examStarted) {
    // Pantalla de reanudación: el botón solicita fullscreen directamente (gesto del usuario)
    if (studentData?.isResuming) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 to-blue-900 p-4">
          <div className={`rounded-2xl shadow-2xl p-10 text-center max-w-lg w-full ${darkMode ? "bg-slate-900" : "bg-white"}`}>
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12 text-blue-600" />
            </div>
            <h1 className={`text-3xl font-bold mb-3 ${darkMode ? "text-white" : "text-slate-800"}`}>
              Reconexión exitosa
            </h1>
            <p className={`mb-2 text-base ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
              Tus respuestas han sido cargadas correctamente.
            </p>
            <p className={`mb-8 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Cuando estés listo presiona el botón para reanudar el examen en pantalla completa.
            </p>
            <button
              onClick={handleLaunchResume}
              disabled={isStarting}
              className="w-full py-4 rounded-xl font-bold text-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 transition-colors shadow-lg"
            >
              {isStarting ? "Reanudando..." : "Reanudar examen"}
            </button>

          </div>
        </div>
      );
    }

    return (
      <div
        className={`min-h-screen ${darkMode ? "bg-slate-900" : "bg-gray-50"}`}
      >
        <button
          onClick={toggleTheme}
          className={`fixed bottom-6 right-6 z-50 p-3 rounded-full shadow-lg border ${darkMode ? "bg-slate-800 border-slate-700 text-yellow-400" : "bg-white border-gray-200 text-gray-600"}`}
        >
          {darkMode ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>
        <MonitoreoSupervisado
          darkMode={darkMode}
          onStartExam={startExam}
          isStarting={isStarting}
        />
        <ConfirmModal
          visible={errorModal.visible}
          tipo="error"
          titulo={errorModal.titulo}
          mensaje={errorModal.mensaje}
          darkMode={darkMode}
          textoConfirmar="Aceptar"
          onConfirmar={() => setErrorModal((prev) => ({ ...prev, visible: false }))}
        />
      </div>
    );
  }

  if (showUnlockScreen) {
    return (
      <div
        ref={fullscreenRef}
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-600 to-emerald-700 p-4"
      >
        <div className="bg-white rounded-xl shadow-2xl p-10 text-center max-w-lg animate-in zoom-in duration-500">
          <CheckCircle2 className="w-20 h-20 text-green-600 mx-auto mb-6 animate-bounce" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            ¡Examen Desbloqueado!
          </h1>
          <p className="text-gray-600 mb-8 text-lg">
            El profesor ha desbloqueado tu examen. Puedes continuar respondiendo
            donde lo dejaste.
          </p>
          <button
            type="button"
            onClick={async () => {
              startupGraceRef.current = true;
              // Garantizar isResuming antes de startExam, leyendo y escribiendo
              // localStorage directamente para evitar estado React stale.
              try {
                const raw = localStorage.getItem("studentData");
                if (raw) {
                  const parsed = JSON.parse(raw);
                  if (!parsed.isResuming) {
                    parsed.isResuming = true;
                    localStorage.setItem("studentData", JSON.stringify(parsed));
                    setStudentData(parsed);
                  }
                }
              } catch {}
              if (!examStarted) {
                await document.documentElement.requestFullscreen().catch(() => {});
                setShowUnlockScreen(false);
                await startExam();
              } else {
                await document.documentElement.requestFullscreen().catch(() => {});
                setShowUnlockScreen(false);
                startupGraceRef.current = false;
              }
            }}
            className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg shadow-xl hover:from-green-600 hover:to-emerald-700 transition-all hover:scale-105 flex items-center gap-3 mx-auto"
          >
            <ZoomIn className="w-6 h-6" />
            Continuar Examen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={fullscreenRef}
      className={`h-screen relative font-sans anim-fadeIn ${darkMode ? "bg-slate-900" : "bg-white"}`}
    >
      {/* Estilos de Scrollbar personalizados (Sincronizados con CrearExamen) */}
      <style>{`
          /* Estilos Base (Modo Día) */
          ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          ::-webkit-scrollbar-track {
            background: #f3f4f6;
          }
          ::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 5px;
            border: 2px solid #f3f4f6;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: #9ca3af;
          }
          * {
            scrollbar-width: thin;
            scrollbar-color: #d1d5db #f3f4f6;
          }

          /* Estilos Modo Noche (Overrides) */
          .dark ::-webkit-scrollbar-track {
            background: #0f172a;
          }
          .dark ::-webkit-scrollbar-thumb {
            background: #334155;
            border: 2px solid #0f172a;
          }
          .dark ::-webkit-scrollbar-thumb:hover {
            background: #475569;
          }
          .dark * {
            scrollbar-color: #334155 #0f172a;
          }
      `}</style>

      {/* --- MODALES DE CONFIRMACIÓN --- */}
      {showExitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md p-6 rounded-2xl shadow-2xl transform transition-all scale-100 border-2 ${darkMode ? "bg-slate-800 border-red-800" : "bg-white border-red-200"}`}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div
                className={`p-3 rounded-full ${darkMode ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-600"}`}
              >
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3
                className={`text-xl font-bold ${darkMode ? "text-red-400" : "text-red-700"}`}
              >
                ¿Estás seguro de abandonar el examen?
              </h3>
              <p
                className={`text-sm ${darkMode ? "text-slate-400" : "text-gray-600"}`}
              >
                Solo podrás reanudarlo si tu profesor lo autoriza.
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setShowExitModal(false)}
                  className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${darkMode ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"}`}
                >
                  Volver al examen
                </button>
                <button
                  onClick={handleCloseApp}
                  className="flex-1 py-2.5 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20"
                >
                  Sí, abandonar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md p-6 rounded-2xl shadow-2xl transform transition-all scale-100 ${darkMode ? "bg-slate-800 border border-slate-700" : "bg-white border border-gray-100"}`}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div
                className={`p-3 rounded-full ${getUnansweredCount() > 0 ? (darkMode ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-600") : darkMode ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}
              >
                {getUnansweredCount() > 0 ? (
                  <AlertTriangle className="w-8 h-8" />
                ) : (
                  <CheckCircle2 className="w-8 h-8" />
                )}
              </div>
              <h3
                className={`text-xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                ¿Entregar examen?
              </h3>

              <div
                className={`text-sm ${darkMode ? "text-slate-400" : "text-gray-600"}`}
              >
                {getUnansweredCount() > 0 ? (
                  <p>
                    <span className="block text-amber-500 font-bold mb-1">
                      ¡Atención!
                    </span>
                    Te faltan <strong>{getUnansweredCount()} preguntas</strong>{" "}
                    por contestar.
                    <br />
                    ¿Estás seguro de que deseas entregar así?
                  </p>
                ) : (
                  <p>
                    Has contestado todas las preguntas.
                    <br />
                    ¿Estás listo para finalizar?
                  </p>
                )}
              </div>

              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${darkMode ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"}`}
                >
                  Revisar
                </button>
                <button
                  onClick={() => {
                    setShowSubmitModal(false);
                    submitExam();
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-medium text-white transition-colors shadow-lg ${getUnansweredCount() > 0 ? "bg-amber-600 hover:bg-amber-700 shadow-amber-900/20" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20"}`}
                >
                  Sí, entregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-0 backdrop-blur-sm transition-all duration-300 ${
          darkMode
            ? "bg-gradient-to-br from-gray-900/80 via-slate-900/70 to-gray-900/80"
            : "bg-white"
        }`}
      ></div>

      <div className="relative z-10 h-full w-full flex overflow-hidden">
        <SavingIndicator savingStates={savingStates} darkMode={darkMode} />
        <TimerNotification
          alert={timerAlert}
          onClose={() => setTimerAlert(null)}
          darkMode={darkMode}
        />

        {/* Banner pérdida de conexión */}
        {connectionLost && examStarted && !examBlocked && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm bg-black/60 pointer-events-auto select-none">
            <div className={`relative flex flex-col items-center gap-5 px-8 py-8 rounded-2xl shadow-2xl w-full max-w-sm mx-4 ring-1 overflow-hidden ${
              graceCountdown !== null && graceCountdown <= 15
                ? darkMode ? "bg-slate-800 ring-red-500/30" : "bg-white ring-red-300"
                : darkMode ? "bg-slate-800 ring-amber-500/30" : "bg-white ring-amber-300"
            }`}>
              {/* Barra de acento superior */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${graceCountdown !== null && graceCountdown <= 15 ? "bg-red-500" : "bg-amber-500"}`} />

              {/* Ícono WiFi cortado */}
              <div className={`p-4 rounded-full ${graceCountdown !== null && graceCountdown <= 15 ? "bg-red-500/10" : darkMode ? "bg-amber-500/10" : "bg-amber-50"}`}>
                <svg
                  className={`w-9 h-9 animate-pulse ${graceCountdown !== null && graceCountdown <= 15 ? "text-red-500" : "text-amber-500"}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                >
                  <path d="M1 6s4-4 11-4 11 4 11 4" />
                  <path d="M5 10s2.5-2 7-2 7 2 7 2" />
                  <path d="M9 14s1.5-1 3-1 3 1 3 1" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                  <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" />
                </svg>
              </div>

              {/* Texto */}
              <div className="text-center space-y-1.5">
                <p className={`font-bold text-base ${darkMode ? "text-white" : "text-slate-800"}`}>
                  Sin conexión a internet
                </p>
                <p className={`text-sm leading-relaxed ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  No puedes usar el examen mientras no hay conexión.<br />
                  Tus respuestas anteriores están guardadas.
                </p>
              </div>

              {/* Countdown */}
              {graceCountdown !== null && graceCountdown > 0 && (
                <div className="flex flex-col items-center gap-2 w-full">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-5xl font-black tabular-nums ${graceCountdown <= 15 ? "text-red-500 animate-pulse" : darkMode ? "text-amber-400" : "text-amber-600"}`}>
                      {graceCountdown}
                    </span>
                    <span className={`text-base font-semibold ${graceCountdown <= 15 ? "text-red-400" : "text-amber-500"}`}>s</span>
                  </div>
                  <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    tiempo para reconectar
                  </span>
                  <div className={`w-full h-1.5 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${graceCountdown <= 15 ? "bg-red-500" : "bg-amber-500"}`}
                      style={{ width: `${connectionGraceSeconds ? (graceCountdown / connectionGraceSeconds) * 100 : 100}%` }}
                    />
                  </div>
                </div>
              )}

              {graceCountdown === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 w-full">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <p className="text-xs font-semibold text-red-500 text-center w-full">
                    Tiempo agotado — procesando abandono
                  </p>
                </div>
              )}

              <p className={`text-xs text-center ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                No cierres esta ventana. Si reconectas a tiempo, el examen continuará normalmente.
              </p>
            </div>
          </div>
        )}

        {/* Backdrop para sidebar en mobile */}
        {!sidebarCollapsed && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}

        {/* --- SIDEBAR REFACTORIZADO (Estilo Dashboard) --- */}
        <div
          className={`fixed md:relative inset-y-0 left-0 z-40 flex-shrink-0 flex flex-col transition-transform md:transition-all duration-300 ease-in-out border-r ${
            sidebarCollapsed
              ? "-translate-x-full md:translate-x-0 md:w-20"
              : "translate-x-0 w-64"
          } ${
            darkMode
              ? "bg-slate-900/80 backdrop-blur-md border-slate-800"
              : "bg-white border-gray-200"
          }`}
        >
          {/* Botón de contraer/expandir flotante en el borde (Estilo Pestaña) — solo desktop */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`hidden md:flex absolute -right-2.5 top-1/2 transform -translate-y-1/2 z-50 items-center justify-center w-5 h-12 rounded-full shadow-md border transition-all duration-200 ${
              darkMode
                ? "bg-slate-800 border-slate-700 text-gray-400 hover:text-white hover:bg-slate-700"
                : "bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
            title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronLeft className="w-3 h-3" />
            )}
          </button>

          {/* Header Sidebar */}
          <div className="p-4">
            <div
              className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-lg flex-shrink-0 ${darkMode ? "bg-blue-900/50 text-blue-100" : "bg-slate-800"}`}
              >
                <User className="w-5 h-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div className="overflow-hidden transition-all duration-300">
                  <p
                    className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"}`}
                  >
                    Candidato
                  </p>
                  <p
                    className={`font-bold text-sm truncate ${darkMode ? "text-slate-200" : "text-slate-800"}`}
                  >
                    {studentData?.nombre || "Usuario"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Navegación */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
            {!sidebarCollapsed && (
              <p
                className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-gray-400"}`}
              >
                Evaluación
              </p>
            )}

            <SidebarNavItem
              icon={FileText}
              label="Examen"
              active={openPanels.includes("exam")}
              collapsed={sidebarCollapsed}
              darkMode={darkMode}
              onClick={() => openPanel("exam")}
            />
            {examData?.archivoPDF && (
              <SidebarNavItem
                icon={Pencil}
                label="Responder"
                active={openPanels.includes("answer")}
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                onClick={() => openPanel("answer")}
              />
            )}

            {!sidebarCollapsed && (
              <p
                className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-gray-400"}`}
              >
                Herramientas
              </p>
            )}

            {examData?.incluirCalculadoraCientifica && (
              <SidebarNavItem
                icon={Calculator}
                label="Calculadora"
                active={openPanels.includes("calculadora")}
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                onClick={() => openPanel("calculadora")}
              />
            )}
            {examData?.incluirHojaExcel && (
              <SidebarNavItem
                icon={FileSpreadsheet}
                label="Hoja de cálculo"
                active={openPanels.includes("excel")}
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                onClick={() => openPanel("excel")}
              />
            )}
            {examData?.incluirHerramientaDibujo && (
              <SidebarNavItem
                icon={Pencil}
                label="Dibujo"
                active={openPanels.includes("dibujo")}
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                onClick={() => openPanel("dibujo")}
              />
            )}
            {examData?.incluirJavascript && (
              <SidebarNavItem
                icon={Code}
                label="JavaScript/HTML"
                active={openPanels.includes("javascript")}
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                onClick={() => openPanel("javascript")}
              />
            )}
            {examData?.incluirPython && (
              <SidebarNavItem
                icon={Code}
                label="Python"
                active={openPanels.includes("python")}
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                onClick={() => openPanel("python")}
              />
            )}
          </nav>

          {/* Footer Sidebar (Botones de acción) */}
          <div
            className={`p-3 space-y-2 ${darkMode ? "bg-slate-900/50" : "bg-gray-50/50"}`}
          >
            {/* Botón Entregar */}
            <button
              onClick={() => setShowSubmitModal(true)}
              className={`w-full flex items-center rounded-lg transition-all shadow-md group ${
                sidebarCollapsed ? "justify-center p-3" : "px-4 py-3 gap-3"
              } bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white`}
              title="Entregar Examen"
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="font-bold text-lg">Entregar</span>
              )}
            </button>

            {/* Botón Salir */}
            <div
              className={`${sidebarCollapsed ? "flex justify-center" : "px-1"}`}
            >
              <button
                onClick={() => setShowExitModal(true)}
                className={`flex items-center rounded-lg p-2 transition-colors w-full ${sidebarCollapsed ? "justify-center" : "gap-3"} ${darkMode ? "text-red-400 hover:bg-red-900/20" : "text-red-600 hover:bg-red-50"}`}
              >
                <LogOut className="w-5 h-5" />
                {!sidebarCollapsed && (
                  <span className="text-lg font-medium">Salir</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* --- ÁREA PRINCIPAL --- */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header Superior Flotante */}
          <div className="h-20 md:h-24 px-3 md:px-6 flex items-center justify-between absolute top-0 left-0 right-0 z-20">
            {/* Left: Hamburger (mobile) + Control Layout */}
            <div className="flex items-center gap-2">
              {/* Hamburger solo en mobile */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`md:hidden p-2 rounded-lg border shadow-md ${darkMode ? "bg-slate-900/80 border-slate-700 text-gray-300" : "bg-white/80 border-gray-200 text-gray-700"}`}
                title="Menú"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <div
                className={`hidden md:flex p-1 rounded-lg ${darkMode ? "bg-slate-900/50 backdrop-blur-sm border border-slate-700" : "bg-white/50 backdrop-blur-sm border-gray-200/50 shadow-md"}`}
              >
                <button
                  onClick={() => openPanels.length >= 2 && setLayout("vertical")}
                  disabled={openPanels.length < 2}
                  className={`p-1.5 rounded transition-colors ${openPanels.length < 2 ? "opacity-30 cursor-not-allowed" : ""} ${layout === "vertical" && openPanels.length >= 2 ? (darkMode ? "bg-blue-900/50 text-blue-100 border border-blue-800/50" : "bg-slate-800 text-white shadow-sm") : darkMode ? "text-slate-400" : "text-slate-400"}`}
                  title={openPanels.length < 2 ? "Abre al menos 2 herramientas para dividir la vista" : "Vista vertical"}
                >
                  <Columns className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openPanels.length >= 2 && setLayout("horizontal")}
                  disabled={openPanels.length < 2}
                  className={`p-1.5 rounded transition-colors ${openPanels.length < 2 ? "opacity-30 cursor-not-allowed" : ""} ${layout === "horizontal" && openPanels.length >= 2 ? (darkMode ? "bg-blue-900/50 text-blue-100 border border-blue-800/50" : "bg-slate-800 text-white shadow-sm") : darkMode ? "text-slate-400" : "text-slate-400"}`}
                  title={openPanels.length < 2 ? "Abre al menos 2 herramientas para dividir la vista" : "Vista horizontal"}
                >
                  <Rows className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right: Timer and logo */}
            <div className="flex items-center gap-4">
              {/* Info Hora y Batería */}
              <div
                className={`hidden md:flex items-center gap-5 px-5 py-2 rounded-xl border ${darkMode ? "bg-slate-900/50 backdrop-blur-sm border-slate-700" : "bg-white/50 backdrop-blur-sm border-gray-200/50 shadow-md"}`}
              >
                <span
                  className={`tabular-nums text-lg font-bold tracking-widest ${darkMode ? "text-slate-300" : "text-slate-600"}`}
                >
                  {currentTime.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {/* Indicador de señal WiFi */}
                <SignalIndicator
                  level={signalLevel}
                  darkMode={darkMode}
                />
                <div
                  className={`w-px h-6 ${darkMode ? "bg-slate-700" : "bg-gray-300"}`}
                ></div>
                <div
                  className={`flex items-center gap-2 tabular-nums text-lg font-bold ${darkMode ? "text-slate-300" : "text-slate-600"}`}
                >
                  <span>{batteryLevel ?? "--"}%</span>
                  {isCharging ? (
                    <BatteryCharging className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <Battery
                      className={`w-6 h-6 ${batteryLevel !== null && batteryLevel <= 20 ? "text-red-500 animate-pulse" : ""}`}
                    />
                  )}
                </div>
                {!timeLimitRemoved && (
                  <>
                    <div
                      className={`w-px h-6 ${darkMode ? "bg-slate-700" : "bg-gray-300"}`}
                    ></div>
                    <div
                      className={`flex items-center gap-3 ${
                        timerStatus === "critical"
                          ? "text-red-500 animate-pulse"
                          : timerStatus === "warning"
                            ? "text-amber-500"
                            : darkMode
                              ? "text-blue-400"
                              : "text-blue-700"
                      }`}
                    >
                      <Clock className="w-5 h-5" />
                      <span
                        className={`tabular-nums text-lg font-bold ${
                          timerStatus === "critical"
                            ? "text-red-500"
                            : timerStatus === "warning"
                              ? "text-amber-500"
                              : darkMode
                                ? "text-white"
                                : "text-slate-800"
                        }`}
                      >
                        {remainingTime}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Logo */}
              <img
                src={darkMode ? logoUniversidadNoche : logoUniversidad}
                alt="Logo Universidad"
                className="h-7 md:h-10 w-auto object-contain transition-opacity duration-300"
              />
            </div>
          </div>

          {/* Contenedor de Paneles */}
          <div
            className={`flex-1 flex ${layout === "vertical" ? "flex-row" : "flex-col"} p-2 md:p-4 pt-20 md:pt-24 gap-2 overflow-hidden`}
          >
            {openPanels.length === 0 ? (
              <div
                className={`flex-1 flex flex-col items-center justify-center opacity-50 ${darkMode ? "text-slate-600" : "text-gray-300"}`}
              >
                <LayoutGrid className="w-24 h-24 mb-4" />
                <p className="text-xl font-medium">
                  Selecciona una herramienta para comenzar
                </p>
              </div>
            ) : (
              openPanels.map((panel, index) => (
                <React.Fragment key={panel}>
                  <div
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    style={{
                      [layout === "vertical" ? "width" : "height"]:
                        `${panelSizes[index]}%`,
                    }}
                    className={`flex flex-col rounded-xl border shadow-sm overflow-hidden ${darkMode ? "bg-slate-900/80 backdrop-blur-md border-slate-800" : "bg-white border-gray-200"}`}
                  >
                    {/* Panel Header */}
                    <div
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      className={`h-10 flex items-center justify-between px-4 border-b cursor-move ${darkMode ? "bg-blue-900/20 border-blue-800/30" : "bg-slate-800 border-slate-800"}`}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          className={`w-4 h-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}
                        />
                        <span
                          className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-gray-400" : "text-white"}`}
                        >
                          {panel === "excel" ? "Hoja de Cálculo" : panel === "calculadora" ? "Calculadora" : panel === "dibujo" ? "Dibujo" : panel === "answer" ? "Respuesta" : panel === "javascript" ? "JavaScript" : panel === "python" ? "Python" : panel === "exam" ? "Examen" : panel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {panel !== "calculadora" && (
                          <>
                            <button
                              onClick={() => adjustPanelZoom(index, -10)}
                              className={`p-1 rounded ${darkMode ? "hover:bg-gray-200/20" : "hover:bg-white/10"}`}
                            >
                              <ZoomOut
                                className={`w-4 h-4 ${darkMode ? "text-gray-400" : "text-gray-300"}`}
                              />
                            </button>
                            <button
                              onClick={() => adjustPanelZoom(index, 10)}
                              className={`p-1 rounded ${darkMode ? "hover:bg-gray-200/20" : "hover:bg-white/10"}`}
                            >
                              <ZoomIn
                                className={`w-4 h-4 ${darkMode ? "text-gray-400" : "text-gray-300"}`}
                              />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => closePanel(index)}
                          className={`p-1 rounded ml-2 ${darkMode ? "hover:bg-red-500/10 text-gray-400 hover:text-red-500" : "hover:bg-red-500/20 text-gray-300 hover:text-red-400"}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                      <div
                        className="h-full w-full"
                        style={
                          panel === "python" ||
                          panel === "javascript"
                            ? {} // Sin zoom para editores persistentes
                            : {
                                transform: `scale(${panelZooms[index] / 100})`,
                                transformOrigin: "top left",
                                width: `${10000 / panelZooms[index]}%`,
                                height: `${10000 / panelZooms[index]}%`,
                              }
                        }
                      >
                        <Suspense
                          fallback={
                            <div className="flex items-center justify-center h-full">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                            </div>
                          }
                        >
                          {renderPanel(panel, panelZooms[index])}
                        </Suspense>
                      </div>
                    </div>
                  </div>
                  {index < openPanels.length - 1 &&
                    !(
                      (panel === "exam" &&
                        openPanels[index + 1] === "dibujo") ||
                      (panel === "dibujo" && openPanels[index + 1] === "exam")
                    ) && (
                      <div
                        onMouseDown={(e) => startResize(index, e)}
                        className={`${layout === "vertical" ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"} transition-all z-20 flex-shrink-0 rounded-full ${darkMode ? "bg-slate-700 hover:bg-blue-500" : "bg-gray-200 hover:bg-blue-400"}`}
                      />
                    )}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
        {/* Botón de tema flotante */}
        <button
          onClick={toggleTheme}
          className={`fixed bottom-25 right-8 z-50 p-3 rounded-full shadow-lg transition-all duration-300 border ${
            darkMode
              ? "bg-slate-800/90 backdrop-blur-md text-yellow-400 hover:bg-slate-700/90 border-slate-700"
              : "bg-white text-gray-700 hover:bg-gray-50 border-gray-200"
          }`}
          title={darkMode ? "Cambiar a modo día" : "Cambiar a modo noche"}
        >
          {darkMode ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>

        {/* Modal de error */}
        <ConfirmModal
          visible={errorModal.visible}
          tipo="error"
          titulo={errorModal.titulo}
          mensaje={errorModal.mensaje}
          darkMode={darkMode}
          textoConfirmar="Aceptar"
          onConfirmar={() =>
            setErrorModal((prev) => ({ ...prev, visible: false }))
          }
        />
      </div>
    </div>
  );
}

// --- SUB-COMPONENTE NAV ITEM (Estilo Dashboard) ---
function SidebarNavItem({
  icon: Icon,
  label,
  active,
  collapsed,
  darkMode,
  onClick,
}: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center rounded-lg text-lg transition-all duration-200 group ${
        collapsed ? "justify-center p-2" : "px-3 py-2.5 gap-3"
      } ${
        active
          ? darkMode
            ? "bg-blue-900/30 text-blue-100 border border-blue-800/50"
            : "bg-slate-800 text-white shadow-md"
          : darkMode
            ? "text-gray-400 hover:bg-slate-800 hover:text-white"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
      title={collapsed ? label : ""}
    >
      <div
        className={`relative flex-shrink-0 transition-transform duration-200 ${active ? "scale-110" : "group-hover:scale-105"}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      {!collapsed && (
        <span className="font-medium truncate transition-opacity duration-300">
          {label}
        </span>
      )}
    </button>
  );
}
