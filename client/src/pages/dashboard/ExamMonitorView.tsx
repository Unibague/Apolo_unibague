import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  Ban,
  Search,
  Eye,
  Activity,
  Send,
  FileText,
  Download,
  Mail,
  Zap,
  ArrowLeft,
  Maximize,
  MousePointer,
  BookOpen,
  Trash2,
  User,
  EyeOff,
  TimerOff,
  Archive,
  ArchiveRestore,
  RotateCcw,
} from "lucide-react";
import { io } from "socket.io-client";
import AlertsModal from "../../components/AlertsModal";
import { examsService } from "../../services/examsService";
import { examsAttemptsService } from "../../services/examsAttempts";
import { buildPdfViewUrl } from "../../utils/examUtils";
import ConfirmModal from "../../components/ConfirmModal";
import GradeReview from "../../components/GradeReview";
import PageLoader from "../../components/PageLoader";

// ============================================
// INTERFACES
// ============================================
interface Examen {
  id: number;
  nombre: string;
  codigoExamen: string;
  estado: "open" | "closed" | "archivado";
  descripcion?: string;
  duracion?: number;
  mostrarCalificaciones?: boolean;
  tipo?: string;
  archivoPDF?: string | null;
}

interface VigilanciaExamenesListaProps {
  darkMode: boolean;
  usuarioData: any;
}

interface ExamAttempt {
  id: number;
  nombre_estudiante: string;
  correo_estudiante: string | null;
  identificacion_estudiante?: string | null;
  estado: string;
  fecha_inicio: string;
  fecha_fin?: string | null;
  tiempoTranscurrido: string;
  progreso: number;
  alertas: number;
  alertasNoLeidas?: number;
  calificacion?: number;
  notaFinal?: number | null;
  preguntasPendientes?: boolean;
  calificacionPendiente?: boolean;
  esExamenPDF?: boolean;
  codigo_acceso?: string | null;
  connectionLost?: boolean; // Perdida de conexión WebSocket
}

interface Alerta {
  id: number;
  tipo_evento: string;
  descripcion?: string;
  fecha_envio: string;
  leida: boolean;
  leido: boolean;
  leida_ts?: string | null;
}

type EstadoDisplay = "Activo" | "Bloqueado" | "Pausado" | "Terminado" | "Abandonado" | "Calificado";
type FiltroEstado = "todos" | "activos" | "bloqueados" | "pausados" | "terminados" | "abandonados" | "calificados";

const EXAMS_API_URL = import.meta.env.VITE_EXAMS_URL || window.location.origin;


const obtenerColoresExamen = (tipo: string): { borde: string; fondo: string } => {
  if (tipo === "pdf") return { borde: "border-rose-500", fondo: "bg-rose-600" };
  return { borde: "border-indigo-500", fondo: "bg-indigo-600" };
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function VigilanciaExamenesLista({
  darkMode,
  usuarioData,
}: VigilanciaExamenesListaProps) {
  const [examenes, setExamenes] = useState<Examen[]>([]);
  const [examenExpandido, setExamenExpandido] = useState<number | null>(null);
  const [loadingExamenes, setLoadingExamenes] = useState(true);

  const calcularTiempoDisplay = (att: ExamAttempt): string => {
    if (!att.fecha_inicio) return att.tiempoTranscurrido;
    const end = att.fecha_fin ? new Date(att.fecha_fin) : new Date();
    const minutes = Math.floor(Math.max(0, end.getTime() - new Date(att.fecha_inicio).getTime()) / 60000);
    return `${minutes} min`;
  };

  // Estados
  const [examAttempts, setExamAttempts] = useState<{ [key: number]: ExamAttempt[] }>({});
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<ExamAttempt | null>(null);
  const [vistaTransicionando, setVistaTransicionando] = useState(false);
  const [examenActual, setExamenActual] = useState<Examen | null>(null);
  const [alertasEstudiante, setAlertasEstudiante] = useState<Alerta[]>([]);
  const [mostrarModalAlertas, setMostrarModalAlertas] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [mostrarArchivadosMonitor, setMostrarArchivadosMonitor] = useState(false);
  const [searchExamen, setSearchExamen] = useState("");
  const [filtrosPorExamen, setFiltrosPorExamen] = useState<{ [key: number]: FiltroEstado }>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mostrarOpcionesPostCalificacion, setMostrarOpcionesPostCalificacion] = useState(false);
  const [criterioOrden, setCriterioOrden] = useState<"defecto" | "az" | "za" | "duracion" | "nota">("defecto");
  const [modoPrivacidad, setModoPrivacidad] = useState(false);
  const [estudiantesRevelados, setEstudiantesRevelados] = useState<Set<number>>(new Set());
  const [modoRevision, setModoRevision] = useState(false);
  const [mostrarPDFRevision, setMostrarPDFRevision] = useState(true);

  const [modal, setModal] = useState<{ visible: boolean; tipo: "exito" | "error" | "advertencia" | "info" | "confirmar"; titulo: string; mensaje: string; onConfirmar: () => void; onCancelar?: () => void }>({ visible: false, tipo: "info", titulo: "", mensaje: "", onConfirmar: () => {} });
  const mostrarModal = (tipo: "exito" | "error" | "advertencia" | "info" | "confirmar", titulo: string, mensaje: string, onConfirmar: () => void, onCancelar?: () => void) => setModal({ visible: true, tipo, titulo, mensaje, onConfirmar, onCancelar });
  const cerrarModal = () => setModal(prev => ({ ...prev, visible: false }));

  // Refs para evitar stale closures en callbacks del WebSocket y timers
  const estudianteSeleccionadoRef = useRef<ExamAttempt | null>(null);
  useEffect(() => { estudianteSeleccionadoRef.current = estudianteSeleccionado; }, [estudianteSeleccionado]);

  const examenActualRef = useRef<Examen | null>(null);
  useEffect(() => { examenActualRef.current = examenActual; }, [examenActual]);

  // Polling cada 60 segundos para actualizar tiempos y datos en vivo
  useEffect(() => {
    if (!examenActual) return;
    const interval = setInterval(() => {
      const examId = examenActualRef.current?.id;
      if (examId) cargarIntentosExamen(examId, true);
    }, 60000);
    return () => clearInterval(interval);
  }, [examenActual?.id]);

  // ============================================
  // CARGAR DATOS
  // ============================================
  useEffect(() => { cargarExamenes(); }, [usuarioData]);

  const cargarIntentosExamen = async (examenId: number, silencioso = false) => {
    try {
      const intentos = await examsAttemptsService.getActiveAttemptsByExam(examenId);
      const intentosMapped = intentos.map((i: ExamAttempt) => ({
        ...i,
        calificacion: i.notaFinal != null ? i.notaFinal : i.calificacion,
      }));
      setExamAttempts((prev) => ({ ...prev, [examenId]: intentosMapped }));
      const seleccionado = estudianteSeleccionadoRef.current;
      if (seleccionado) {
        const est = intentosMapped.find((i: ExamAttempt) => i.id === seleccionado.id);
        if (est) setEstudianteSeleccionado(est);
      }
    } catch (error: any) {
      console.error("Error cargando intentos:", error);
      if (!silencioso) mostrarModal("error", "Error al cargar intentos", error?.message || "No se pudieron cargar los intentos del examen.", cerrarModal);
    }
  };

  const cargarExamenes = async () => {
    if (!usuarioData?.id) { setLoadingExamenes(false); return; }
    try {
      setLoadingExamenes(true);
      const exams = await examsService.obtenerMisExamenes(usuarioData.id);
      setExamenes(exams);

      // Restaurar estado del examen seleccionado
      const savedExamId = sessionStorage.getItem("vigilancia_examenId");
      if (savedExamId) {
        const examFound = exams.find((e: Examen) => e.id === parseInt(savedExamId));
        if (examFound) {
          setExamenExpandido(examFound.id);
          setExamenActual(examFound);
          cargarIntentosExamen(examFound.id);
        }
      }
    } catch (error) { console.error("Error cargando exámenes:", error); } 
    finally { setLoadingExamenes(false); }
  };

  // Efecto para restaurar estudiante seleccionado una vez que cargan los intentos
  useEffect(() => {
    if (examenActual && examAttempts[examenActual.id] && !estudianteSeleccionado) {
      const savedStudentId = sessionStorage.getItem("vigilancia_estudianteId");
      if (savedStudentId) {
        const student = examAttempts[examenActual.id].find(i => i.id === parseInt(savedStudentId));
        if (student) seleccionarEstudiante(student);
      }
    }
  }, [examAttempts, examenActual]);

  // Efecto para verificar si ya existen calificaciones
  useEffect(() => {
    if (examenActual && examAttempts[examenActual.id]) {
        const hasGrades = examAttempts[examenActual.id].some(a => a.calificacion !== undefined && a.calificacion !== null);
        setMostrarOpcionesPostCalificacion(!!hasGrades);
    } else {
        setMostrarOpcionesPostCalificacion(false);
    }
  }, [examenActual, examAttempts]);

  // ============================================
  // WEBSOCKET
  // ============================================
  useEffect(() => {
    if (!examenActual) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const newSocket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    const examId = examenActual.id;

    newSocket.on("connect", () => {
      newSocket.emit("join_exam_monitoring", examId);
    });

    // Nuevo estudiante empezó el examen - agregar directamente sin recargar
    newSocket.on("student_started_exam", (data: { attemptId: number; codigo_acceso?: string; estudiante: { nombre: string; correo: string; identificacion: string }; fecha_inicio: string }) => {
      const nuevoEstudiante: ExamAttempt = {
        id: data.attemptId,
        nombre_estudiante: data.estudiante?.nombre || "Sin nombre",
        correo_estudiante: data.estudiante?.correo || null,
        identificacion_estudiante: data.estudiante?.identificacion || null,
        estado: "activo",
        fecha_inicio: data.fecha_inicio || new Date().toISOString(),
        fecha_fin: null,
        tiempoTranscurrido: "0 min",
        progreso: 0,
        alertas: 0,
        alertasNoLeidas: 0,
        codigo_acceso: data.codigo_acceso ?? null,
      };

      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        // Evitar duplicados
        if (intentos.some((i) => i.id === data.attemptId)) return prev;
        return { ...prev, [examId]: [nuevoEstudiante, ...intentos] };
      });
    });

    // Estudiante terminó el examen
    newSocket.on("student_finished_exam", (data: { attemptId: number; estudiante: any; puntaje: number; notaFinal?: number | null }) => {
      const calificacion = data.notaFinal != null ? data.notaFinal : data.puntaje;
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId
            ? { ...att, estado: "submitted", calificacion }
            : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, estado: "submitted", calificacion } : null);
      }
    });

    // Estudiante abandonó el examen
    newSocket.on("student_abandoned_exam", (data: { attemptId: number; estudiante: any; fecha_abandono: string }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId
            ? { ...att, estado: "abandonado" }
            : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, estado: "abandonado" } : null);
      }
    });

    // Progreso actualizado
    newSocket.on("progress_updated", (data: { attemptId: number; progreso: number }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId
            ? { ...att, progreso: data.progreso }
            : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, progreso: data.progreso } : null);
      }
    });

    // Nueva alerta de fraude
    newSocket.on("new_alert", (data: { attemptId: number; event: any }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) => att.id === data.attemptId ?
           { ...att, alertas: (att.alertas || 0) + 1, alertasNoLeidas: (att.alertasNoLeidas || 0) + 1 } : att);
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
         setEstudianteSeleccionado((prev) => prev ? { ...prev, alertas: (prev.alertas||0)+1, alertasNoLeidas: (prev.alertasNoLeidas||0)+1 } : null);
         cargarAlertasEstudiante(data.attemptId);
      }
    });

    // Alerta de fraude con consecuencia
    newSocket.on("fraud_alert", (data: { attemptId: number; blocked: boolean; estudiante: any }) => {
      if (data.blocked) {
        const fechaBloqueo = new Date().toISOString();
        setExamAttempts((prev) => {
          const intentos = prev[examId] || [];
          const nuevos = intentos.map((att) =>
            att.id === data.attemptId ? { ...att, estado: "blocked", fecha_fin: fechaBloqueo } : att
          );
          return { ...prev, [examId]: nuevos };
        });

        if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
          setEstudianteSeleccionado((prev) => prev ? { ...prev, estado: "blocked", fecha_fin: fechaBloqueo } : null);
        }
      }
    });

    // Intento bloqueado
    newSocket.on("attempt_blocked_notification", (data: { attemptId: number; codigo_acceso?: string; estudiante: any }) => {
      const fechaBloqueo = new Date().toISOString();
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId
            ? { ...att, estado: "blocked", fecha_fin: fechaBloqueo, ...(data.codigo_acceso ? { codigo_acceso: data.codigo_acceso } : {}) }
            : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, estado: "blocked", fecha_fin: fechaBloqueo, ...(data.codigo_acceso ? { codigo_acceso: data.codigo_acceso } : {}) } : null);
      }
    });

    // Alertas marcadas como leídas
    newSocket.on("alerts_read", (data: { attemptId: number }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId ? { ...att, alertasNoLeidas: 0 } : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, alertasNoLeidas: 0 } : null);
      }
    });

    // Alertas eliminadas
    newSocket.on("events_deleted", (data: { attemptId: number; deletedCount: number }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId ? { ...att, alertas: 0, alertasNoLeidas: 0 } : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, alertas: 0, alertasNoLeidas: 0 } : null);
        setAlertasEstudiante([]);
      }
    });

    // Intento desbloqueado
    newSocket.on("attempt_unlocked_notification", (data: { attemptId: number; estudiante: any }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId ? { ...att, estado: "activo", fecha_fin: null } : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, estado: "activo", fecha_fin: null } : null);
      }
    });

    // Intento reanudado por el estudiante (vía código de acceso)
    newSocket.on("student_resumed_exam", (data: { attemptId: number }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId ? { ...att, estado: "activo", fecha_fin: null } : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, estado: "activo", fecha_fin: null } : null);
      }
    });

    // Intento individual cerrado forzosamente
    newSocket.on("single_attempt_forced_finish", (data: { intentoId: number; notaFinal?: number | null; calificacionPendiente?: boolean }) => {
      const calificacion = data.notaFinal != null ? data.notaFinal : undefined;
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.intentoId
            ? { ...att, estado: "finished", calificacion, calificacionPendiente: data.calificacionPendiente }
            : att
        );
        return { ...prev, [examId]: nuevos };
      });

      if (estudianteSeleccionadoRef.current?.id === data.intentoId) {
        setEstudianteSeleccionado((prev) =>
          prev ? { ...prev, estado: "finished", calificacion, calificacionPendiente: data.calificacionPendiente } : null
        );
      }
    });

    // Todos los intentos finalizados forzosamente (forzar envío masivo)
    newSocket.on("forced_finish_completed", (data: { totalFinalizados: number; detalles: Array<{ intentoId: number; notaFinal?: number | null; calificacionPendiente?: boolean; error?: string }> }) => {
      const fechaFin = new Date().toISOString();
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) => {
          const detalle = data.detalles.find((d) => d.intentoId === att.id);
          if (!detalle || detalle.error) return att;
          const calificacion = detalle.notaFinal != null ? detalle.notaFinal : att.calificacion;
          return { ...att, estado: "finished", calificacion, calificacionPendiente: detalle.calificacionPendiente, fecha_fin: att.fecha_fin || fechaFin };
        });
        return { ...prev, [examId]: nuevos };
      });

      const seleccionado = estudianteSeleccionadoRef.current;
      if (seleccionado) {
        const detalle = data.detalles.find((d) => d.intentoId === seleccionado.id);
        if (detalle && !detalle.error) {
          const calificacion = detalle.notaFinal != null ? detalle.notaFinal : seleccionado.calificacion;
          setEstudianteSeleccionado((prev) =>
            prev ? { ...prev, estado: "finished", calificacion, calificacionPendiente: detalle.calificacionPendiente, fecha_fin: prev.fecha_fin || fechaFin } : null
          );
        }
      }
    });

    // NUEVO: Estudiante perdió conexión WebSocket
    newSocket.on("student_connection_lost", (data: { attemptId: number; estudiante: { nombre: string }; graceSeconds: number }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId ? { ...att, connectionLost: true } : att
        );
        return { ...prev, [examId]: nuevos };
      });
      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, connectionLost: true } : null);
      }
    });

    // NUEVO: Estudiante reconectó
    newSocket.on("student_reconnected", (data: { attemptId: number; estudiante: { nombre: string } }) => {
      setExamAttempts((prev) => {
        const intentos = prev[examId] || [];
        const nuevos = intentos.map((att) =>
          att.id === data.attemptId ? { ...att, connectionLost: false } : att
        );
        return { ...prev, [examId]: nuevos };
      });
      if (estudianteSeleccionadoRef.current?.id === data.attemptId) {
        setEstudianteSeleccionado((prev) => prev ? { ...prev, connectionLost: false } : null);
      }
    });

    newSocket.on("grades_email_done", (data: { enviados: number; errores: number; sinCorreo: number; error?: string }) => {
      if (data.error || data.errores === -1) {
        mostrarModal("error", "Error al enviar correos", data.error || "Error desconocido al enviar los correos.", cerrarModal);
      } else {
        const msg = [
          `${data.enviados} correo(s) enviado(s) exitosamente.`,
          data.errores > 0 ? `${data.errores} error(es) al enviar.` : "",
          data.sinCorreo > 0 ? `${data.sinCorreo} estudiante(s) sin correo o nota pendiente.` : "",
        ].filter(Boolean).join(" ");
        mostrarModal("exito", "Correos enviados", msg, cerrarModal);
      }
    });

    newSocket.on("disconnect", () => {
      console.log("🔌 Desconectado del WebSocket");
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      newSocket.emit("leave_exam_monitoring", examId);
      newSocket.disconnect();
    };
  }, [examenActual?.id]);

  // ============================================
  // LOGICA UI
  // ============================================
  const toggleExamen = (examen: Examen) => {
    if (examenExpandido === examen.id) {
      setExamenExpandido(null);
      setExamenActual(null);
      sessionStorage.removeItem("vigilancia_examenId");
      sessionStorage.removeItem("vigilancia_estudianteId");
      return;
    }
    setExamenExpandido(examen.id);
    setExamenActual(examen);
    sessionStorage.setItem("vigilancia_examenId", examen.id.toString());
    sessionStorage.removeItem("vigilancia_estudianteId"); // Limpiar estudiante al cambiar de examen
    setEstudianteSeleccionado(null);
    if (!filtrosPorExamen[examen.id]) setFiltrosPorExamen(prev => ({ ...prev, [examen.id]: "todos" }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    cargarIntentosExamen(examen.id);
  };

  const cambiarFiltroExamen = (nuevoFiltro: FiltroEstado) => {
    if (examenActual) setFiltrosPorExamen(prev => ({ ...prev, [examenActual.id]: nuevoFiltro }));
  };

  const filtroActual = examenActual ? (filtrosPorExamen[examenActual.id] || "todos") : "todos";

  const cargarAlertasEstudiante = async (attemptId: number) => {
    try {
      const eventos = await examsAttemptsService.getAttemptEvents(attemptId);
      setAlertasEstudiante(eventos);
    } catch (e) { console.error(e); }
  };

  const handleSeleccionarEstudiante = (estudiante: ExamAttempt) => {
    setVistaTransicionando(true);
    setTimeout(async () => {
      setVistaTransicionando(false);
      await seleccionarEstudiante(estudiante);
    }, 180);
  };

  const handleVolverLista = () => {
    setVistaTransicionando(true);
    setTimeout(() => {
      setVistaTransicionando(false);
      setEstudianteSeleccionado(null);
      setModoRevision(false);
      sessionStorage.removeItem("vigilancia_estudianteId");
    }, 180);
  };

  const seleccionarEstudiante = async (estudiante: ExamAttempt) => {
    setEstudianteSeleccionado({ ...estudiante, alertasNoLeidas: 0 });
    sessionStorage.setItem("vigilancia_estudianteId", estudiante.id.toString());
    await cargarAlertasEstudiante(estudiante.id);
    // Marcar alertas como leídas en backend y actualizar lista
    if (estudiante.alertasNoLeidas && estudiante.alertasNoLeidas > 0) {
      try {
        await examsAttemptsService.markEventsAsRead(estudiante.id);
      } catch (e) { console.error("Error marcando alertas como leídas:", e); }
      if (examenActual) {
        setExamAttempts(prev => ({
          ...prev,
          [examenActual.id]: (prev[examenActual.id] || []).map(i =>
            i.id === estudiante.id ? { ...i, alertasNoLeidas: 0 } : i
          ),
        }));
      }
    }
  };

  const handleCerrarIntento = (attemptId: number) => {
    mostrarModal(
      "confirmar",
      "Cerrar examen",
      "¿Cerrar el examen de este estudiante? Se calificará automáticamente.",
      async () => {
        cerrarModal();
        try {
          await examsAttemptsService.forceFinishAttempt(attemptId);
          mostrarModal("exito", "Examen cerrado", "El examen del estudiante ha sido cerrado.", cerrarModal);
        } catch (e: any) {
          mostrarModal("error", "Error", e?.response?.data?.message || "No se pudo cerrar el intento.", cerrarModal);
        }
      },
      cerrarModal,
    );
  };

  const handleRestablecerAcceso = (attemptId: number) => {
    mostrarModal("confirmar", "Restablecer acceso", "¿Restablecer el acceso de este estudiante?", async () => {
      cerrarModal();
      try {
        await examsAttemptsService.unlockAttempt(attemptId);
        mostrarModal("exito", "Acceso restablecido", "El estudiante ya puede continuar su examen.", cerrarModal);
      } catch (e: any) {
        console.error(e);
        mostrarModal("error", "Error", e?.response?.data?.message || "No se pudo desbloquear el intento.", cerrarModal);
      }
    }, cerrarModal);
  };

  const handleRegenerarCodigoRevision = (attemptId: number) => {
    mostrarModal(
      "confirmar",
      "Reactivar código de revisión",
      "El código de revisión anterior ya fue usado por el estudiante para ver su retroalimentación (es de un solo uso). ¿Generar uno nuevo para que pueda volver a consultarla?",
      async () => {
        cerrarModal();
        try {
          const { codigoRevision } = await examsAttemptsService.regenerateReviewCode(attemptId);
          setExamAttempts(prev => {
            if (!examenActual) return prev;
            return { ...prev, [examenActual.id]: prev[examenActual.id].map(i => i.id === attemptId ? { ...i, codigo_acceso: codigoRevision } : i) };
          });
          if (estudianteSeleccionado?.id === attemptId) {
            setEstudianteSeleccionado(prev => prev ? { ...prev, codigo_acceso: codigoRevision } : null);
          }
          mostrarModal("exito", "Código reactivado", `Nuevo código de revisión: ${codigoRevision}`, cerrarModal);
        } catch (e: any) {
          mostrarModal("error", "Error", e?.response?.data?.message || "No se pudo regenerar el código de revisión.", cerrarModal);
        }
      },
      cerrarModal,
    );
  };

  const handleLimpiarAlertas = (attemptId: number) => {
    mostrarModal("confirmar", "Limpiar alertas", "¿Eliminar todos los registros de actividad de este estudiante? Esta acción no se puede deshacer.", async () => {
      cerrarModal();
      try {
        await examsAttemptsService.deleteAttemptEvents(attemptId);
        setAlertasEstudiante([]);
        setExamAttempts(prev => {
          if (!examenActual) return prev;
          return { ...prev, [examenActual.id]: prev[examenActual.id].map(i => i.id === attemptId ? { ...i, alertas: 0, alertasNoLeidas: 0 } : i) };
        });
        if (estudianteSeleccionado?.id === attemptId) {
          setEstudianteSeleccionado(prev => prev ? { ...prev, alertas: 0, alertasNoLeidas: 0 } : null);
        }
      } catch (e: any) {
        mostrarModal("error", "Error", e?.response?.data?.message || "No se pudieron eliminar las alertas.", cerrarModal);
      }
    }, cerrarModal);
  };

  const handleEliminarIntento = (attemptId: number) => {
    mostrarModal("confirmar", "Eliminar intento", "¿Estás seguro de que deseas eliminar este intento? Esta acción no se puede deshacer.", async () => {
      cerrarModal();
      try {
        await examsAttemptsService.deleteAttempt(attemptId);
        if (estudianteSeleccionado?.id === attemptId) {
          setEstudianteSeleccionado(null);
          sessionStorage.removeItem("vigilancia_estudianteId");
        }
        setExamAttempts(prev => {
          if (!examenActual) return prev;
          return { ...prev, [examenActual.id]: prev[examenActual.id].filter(i => i.id !== attemptId) };
        });
      } catch (e: any) {
        mostrarModal("error", "Error", e?.response?.data?.message || "No se pudo eliminar el intento.", cerrarModal);
      }
    }, cerrarModal);
  };

  const handleForzarEnvio = () => {
    if (!examenActual) return;
    mostrarModal("confirmar", "Forzar envío", "¿Finalizar el examen para todos los estudiantes que aún no han enviado? Se calificarán automáticamente.", async () => {
      cerrarModal();
      try {
        const resultado = await examsAttemptsService.forceFinishExam(examenActual.id);
        mostrarModal("exito", "Envío forzado", `${resultado.finalizados} intento(s) finalizado(s) exitosamente.`, cerrarModal);
      } catch (error) {
        console.error("Error al forzar envío:", error);
        mostrarModal("error", "Error", "Error al forzar el envío. Intenta de nuevo.", cerrarModal);
      }
    }, cerrarModal);
  };

  const handleEliminarTiempoLimite = () => {
    if (!examenActual) return;
    mostrarModal(
      "confirmar",
      "Eliminar tiempo límite",
      "Esta acción eliminará el tiempo límite del examen y la fecha de cierre automático. Los estudiantes en curso ya no tendrán contador de tiempo. El examen no se cerrará solo; deberás hacerlo manualmente o forzar el envío. ¿Deseas continuar?",
      async () => {
        cerrarModal();
        try {
          await examsAttemptsService.removeTimeLimit(examenActual.id);
          mostrarModal("exito", "Tiempo límite eliminado", "El tiempo límite y la fecha de cierre automático han sido eliminados. Los estudiantes ya no ven contador.", cerrarModal);
        } catch (error) {
          console.error("Error al eliminar tiempo límite:", error);
          mostrarModal("error", "Error", "No se pudo eliminar el tiempo límite. Intenta de nuevo.", cerrarModal);
        }
      },
      cerrarModal,
    );
  };
  const handleCalificarAutomaticamente = async () => {
      setModoPrivacidad(true);
      // Simulación: Asignar notas y pendientes si no tienen (solo para frontend)
      if (examenActual) {
        setExamAttempts(prev => {
            const currentAttempts = prev[examenActual.id] || [];
            const updated = currentAttempts.map(att => ({
                ...att,
                calificacion: att.calificacion ?? parseFloat((Math.random() * 5).toFixed(1)),
                preguntasPendientes: att.preguntasPendientes ?? (Math.random() > 0.7), // 30% chance de tener pendientes
            }));
            return { ...prev, [examenActual.id]: updated };
        });
      }
      setMostrarOpcionesPostCalificacion(true);
  };
  const handleDescargarNotas = async () => {
    if (!examenActual) return;
    try {
      const blob = await examsAttemptsService.downloadGrades(examenActual.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notas_${examenActual.nombre}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error descargando notas:", e);
    }
  };
  const handleDesbloquearTodos = async () => {
    if (!examenActual) return;
    mostrarModal("confirmar", "Desbloquear todos los intentos", "Se desbloquearán todos los intentos bloqueados del examen. ¿Continuar?", async () => {
      cerrarModal();
      try {
        const result = await examsAttemptsService.unlockAllAttempts(examenActual.id);
        mostrarModal("exito", "Intentos desbloqueados", result.message, cerrarModal);
      } catch (e: any) {
        mostrarModal("error", "Error", e?.response?.data?.message || "No se pudieron desbloquear los intentos.", cerrarModal);
      }
    }, cerrarModal);
  };

  const handleEnviarNotas = async () => {
    if (!examenActual) return;
    mostrarModal(
      "confirmar",
      "Enviar calificaciones por correo",
      "Se cerrarán y calificarán los intentos pendientes, y luego se enviará un correo con la nota y el código de revisión a cada estudiante que proporcionó su correo. ¿Continuar?",
      async () => {
        cerrarModal();
        try {
          await examsAttemptsService.sendGrades(examenActual.id);
          mostrarModal("info", "Enviando correos", "Los correos se están enviando en segundo plano. Se te notificará aquí cuando terminen.", cerrarModal);
        } catch (e: any) {
          mostrarModal("error", "Error", e?.response?.data?.message || "Error al iniciar el envío de correos.", cerrarModal);
        }
      },
    );
  };

  const toggleEstadoExamen = async (id: number, estadoActual: string) => {
    try {
      const nuevo = estadoActual === "open" ? "closed" : "open";
      await examsService.updateExamStatus(id, nuevo);
      if (examenActual?.id === id) setExamenActual({ ...examenActual, estado: nuevo });
      setExamenes(prev => prev.map(e => e.id === id ? {...e, estado: nuevo} : e));
    } catch (e) { console.error(e); }
  };

  const obtenerTipoExamen = (e: Examen) => e.archivoPDF ? "pdf" : "automatico";
  const traducirEstado = (st: string): EstadoDisplay => {
    const map: Record<string, EstadoDisplay> = {
      active: "Activo", activo: "Activo", blocked: "Bloqueado", bloqueado: "Bloqueado",
      paused: "Pausado", pausado: "Pausado", submitted: "Terminado", terminado: "Terminado",
      finalizado: "Terminado", finished: "Terminado",
      abandonado: "Abandonado", abandoned: "Abandonado",
      graded: "Calificado", calificado: "Calificado"
    };
    return map[st.toLowerCase()] || "Abandonado";
  };

  const getEstadoBadgeColor = (st: EstadoDisplay, dark: boolean) => {
    switch (st) {
      case "Activo": return dark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200";
      case "Bloqueado": return dark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200";
      case "Terminado": return dark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-200";
      case "Pausado": return dark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200";
      case "Calificado": return dark ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-purple-50 text-purple-600 border-purple-200";
      default: return dark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-slate-100 text-slate-600 border-slate-300";
    }
  };

  const obtenerInfoVisual = (est: ExamAttempt) => {
    const tieneNombre = est.nombre_estudiante && est.nombre_estudiante !== "Sin nombre" && est.nombre_estudiante.trim() !== "";
    const codigo = est.identificacion_estudiante;
    const correo = est.correo_estudiante;

    // Caso 1: Tiene nombre -> Nombre es principal
    if (tieneNombre) {
        return { 
            principal: est.nombre_estudiante, 
            secundario: correo || codigo || "" 
        };
    }

    // Caso 2: No tiene nombre, pero tiene código -> Código es principal
    if (codigo) {
        return { principal: codigo, secundario: correo || "" };
    }

    // Caso 3: No tiene nombre ni código, pero tiene correo -> Correo es principal
    if (correo) {
        return { principal: correo, secundario: "" };
    }

    // Caso 4: Nada
    return { principal: "Estudiante Desconocido", secundario: "" };
  };

  // Helper para configuración de alertas
  const getAlertConfig = (tipo: string) => {
    const t = tipo.toLowerCase();
    if(t.includes("pestaña") || t.includes("pestana")) return { 
      icon: <Eye className="w-5 h-5" />, 
      color: "text-blue-600", 
      bg: darkMode ? "bg-blue-900/20" : "bg-gradient-to-br from-blue-50 to-blue-100/50", 
      border: darkMode ? "border-blue-800" : "border-blue-200" 
    };
    if(t.includes("foco") || t.includes("focus")) return { 
      icon: <MousePointer className="w-5 h-5" />, 
      color: "text-amber-600", 
      bg: darkMode ? "bg-amber-900/20" : "bg-gradient-to-br from-amber-50 to-amber-100/50", 
      border: darkMode ? "border-amber-800" : "border-amber-200" 
    };
    if(t.includes("pantalla")) return { 
      icon: <Maximize className="w-5 h-5" />, 
      color: "text-purple-600", 
      bg: darkMode ? "bg-purple-900/20" : "bg-gradient-to-br from-purple-50 to-purple-100/50", 
      border: darkMode ? "border-purple-800" : "border-purple-200" 
    };
    return { 
      icon: <AlertTriangle className="w-5 h-5" />, 
      color: "text-rose-600", 
      bg: darkMode ? "bg-rose-900/20" : "bg-gradient-to-br from-rose-50 to-rose-100/50", 
      border: darkMode ? "border-rose-800" : "border-rose-200" 
    };
  }

  const estudiantesFiltrados = examenActual && examAttempts[examenActual.id]
    ? examAttempts[examenActual.id].filter((est) => {
        const term = searchTerm.toLowerCase();
        const match = (est.nombre_estudiante || "").toLowerCase().includes(term)
          || (est.correo_estudiante || "").toLowerCase().includes(term)
          || (est.identificacion_estudiante || "").toLowerCase().includes(term);
        const st = traducirEstado(est.estado);
        if (!match) return false;
        if (filtroActual === "todos") return true;
        if (filtroActual === "activos") return st === "Activo";
        if (filtroActual === "bloqueados") return st === "Bloqueado";
        if (filtroActual === "pausados") return st === "Pausado";
        if (filtroActual === "terminados") return st === "Terminado";
        if (filtroActual === "abandonados") return st === "Abandonado";
        if (filtroActual === "calificados") return est.calificacion !== undefined && est.calificacion !== null;
        return true;
      }).sort((a, b) => {
        if (criterioOrden === "az") return a.nombre_estudiante.localeCompare(b.nombre_estudiante);
        if (criterioOrden === "za") return b.nombre_estudiante.localeCompare(a.nombre_estudiante);
        if (criterioOrden === "duracion") {
            // Asumiendo formato "X min"
            const tiempoA = parseInt(calcularTiempoDisplay(a)) || 0;
            const tiempoB = parseInt(calcularTiempoDisplay(b)) || 0;
            return tiempoB - tiempoA; // Mayor duración primero
        }
        if (criterioOrden === "nota") {
            const notaA = a.calificacion || 0;
            const notaB = b.calificacion || 0;
            return notaB - notaA; // Mayor nota primero
        }
        // defecto: mantener orden original (hora de entrada/id)
        return 0;
      })
    : [];

  const contadores = examenActual && examAttempts[examenActual.id]
    ? {
        todos: examAttempts[examenActual.id].length,
        activos: examAttempts[examenActual.id].filter(a => traducirEstado(a.estado) === "Activo").length,
        bloqueados: examAttempts[examenActual.id].filter(a => traducirEstado(a.estado) === "Bloqueado").length,
        pausados: examAttempts[examenActual.id].filter(a => traducirEstado(a.estado) === "Pausado").length,
        terminados: examAttempts[examenActual.id].filter(a => traducirEstado(a.estado) === "Terminado").length,
        calificados: examAttempts[examenActual.id].filter(a => a.calificacion !== undefined && a.calificacion !== null).length,
        abandonados: examAttempts[examenActual.id].filter(a => traducirEstado(a.estado) === "Abandonado").length,
        hanEmpezado: examAttempts[examenActual.id].filter(a => ["Activo", "Pausado", "Bloqueado"].includes(traducirEstado(a.estado))).length,
        hanEnviado: examAttempts[examenActual.id].filter(a => ["Terminado", "Calificado"].includes(traducirEstado(a.estado))).length,
        enCurso: examAttempts[examenActual.id].filter(a => traducirEstado(a.estado) === "Activo").length,
      }
    : { todos: 0, activos: 0, bloqueados: 0, pausados: 0, terminados: 0, calificados: 0, abandonados: 0, hanEmpezado: 0, hanEnviado: 0, enCurso: 0 };

  // Verificar si hay correos disponibles para enviar
  const hayCorreos = examenActual && examAttempts[examenActual.id]?.some(a => a.correo_estudiante);

  const formatearTipoEvento = (texto: string) => {
    if (!texto) return "Evento";
    return texto
      .replace(/_/g, " ")
      .replace(/pestana/gi, "pestaña")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loadingExamenes) return <PageLoader darkMode={darkMode} mensaje="Cargando vigilancia..." />;

  return (
    <>
      <style>{`.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; } .scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      
      <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-140px)] gap-3 md:gap-3 lg:gap-6 px-2 md:px-4 lg:px-12 md:overflow-hidden">
        
        {/* =======================================================
            PANEL IZQUIERDO
           ======================================================= */}
        <div className="w-full md:w-56 lg:w-80 flex flex-col gap-3 md:gap-3 lg:gap-4 flex-shrink-0 md:overflow-hidden">
          
          <div className={`p-4 rounded-2xl shadow-sm flex-shrink-0 border ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
            <div className="flex items-start justify-between mb-4">
               <div>
                 <h2 className={`text-lg font-bold tracking-tight ${darkMode ? "text-white" : "text-slate-800"}`}>Mis Exámenes</h2>
                 <p className={`text-xs mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Tus exámenes vigilados</p>
               </div>
            </div>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`} />
              <input
                type="text"
                placeholder="Buscar examen..."
                value={searchExamen}
                onChange={(e) => setSearchExamen(e.target.value)}
                className={`w-full pl-9 pr-4 py-2 text-xs rounded-lg border transition-all ${darkMode ? "bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500" : "bg-slate-50 border-slate-200 text-slate-900"} focus:outline-none focus:border-teal-500`}
              />
            </div>
            <button
              onClick={() => setMostrarArchivadosMonitor(!mostrarArchivadosMonitor)}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 mt-3 rounded-lg text-xs font-medium transition-all ${darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {mostrarArchivadosMonitor ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              {mostrarArchivadosMonitor
                ? `Exámenes Activos (${examenes.filter(e => e.estado !== "archivado").length})`
                : `Archivados (${examenes.filter(e => e.estado === "archivado").length})`}
            </button>
          </div>

          <div className={`md:flex-1 rounded-2xl shadow-sm border flex flex-col md:min-h-0 ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
            <div className="md:flex-1 md:overflow-y-scroll scrollbar-hide p-2 space-y-2">
              {examenes.filter((examen) => 
                (mostrarArchivadosMonitor ? examen.estado === "archivado" : examen.estado !== "archivado") &&
                (examen.nombre.toLowerCase().includes(searchExamen.toLowerCase()) ||
                examen.codigoExamen.toLowerCase().includes(searchExamen.toLowerCase()))
              ).sort((a, b) => {
                if (a.estado === "open" && b.estado !== "open") return -1;
                if (a.estado !== "open" && b.estado === "open") return 1;
                return 0;
              }).map((examen) => {
                const isExpanded = examenExpandido === examen.id;
                const tipoExamen = obtenerTipoExamen(examen);
                const colores = obtenerColoresExamen(tipoExamen);
                
                return (
                  <div key={examen.id} className={`rounded-xl transition-all ${isExpanded ? (darkMode ? "bg-slate-800/50" : "bg-teal-50/50") : ""}`}>
                    <button
                      onClick={() => toggleExamen(examen)}
                      className={`w-full px-3 py-3 text-left flex items-center gap-3 rounded-xl border-l-4 transition-all group ${colores.borde} ${isExpanded ? (darkMode ? "bg-slate-800/50" : "bg-teal-50/70") : (darkMode ? "hover:bg-slate-800" : "hover:bg-slate-50")} ${examen.estado !== "open" ? "opacity-60" : "opacity-100"}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colores.fondo}`}>
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                            <p className={`font-bold text-sm truncate transition-colors ${
                              isExpanded 
                                ? (darkMode ? "text-teal-400" : "text-teal-600")
                                : (darkMode ? "text-slate-400 group-hover:text-white" : "text-slate-700")
                            }`}>{examen.nombre}</p>
                            <ChevronDown className={`w-4 h-4 transition-all ${
                              darkMode ? "text-slate-500 group-hover:text-white" : "text-slate-500"
                            } ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                        <p className={`text-[10px] font-mono transition-colors ${
                          darkMode ? "text-slate-500 group-hover:text-slate-300" : "text-slate-500"
                        }`}>{examen.codigoExamen}</p>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 space-y-3 animation-fade-in">
                        <div className={`p-3 rounded-lg border flex items-center justify-between ${darkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
                            <div>
                                <p className={`text-[10px] uppercase font-bold ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Código</p>
                                <p className={`font-mono font-bold ${darkMode ? "text-white" : "text-slate-800"}`}>{examen.codigoExamen}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleEstadoExamen(examen.id, examen.estado); }}
                              className={`relative w-10 h-5 rounded-full transition-colors ${examen.estado === "open" ? "bg-emerald-500" : "bg-slate-400"}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-sm transition-transform ${examen.estado === "open" ? "translate-x-5" : "translate-x-0"}`} />
                            </button>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* =======================================================
            PANEL DERECHO
           ======================================================= */}
        <div className="flex-1 flex flex-col gap-5 min-w-0 md:overflow-hidden">
          
          {/* Contenido Principal */}
          <div className={`flex flex-col md:flex-1 md:overflow-hidden rounded-2xl shadow-sm border ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            
            {!examenActual ? (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <div
                  className={`inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-6 ${
                    darkMode ? "bg-slate-800" : "bg-gray-100"
                  }`}
                >
                  <BookOpen className="w-12 h-12 text-teal-500" />
                </div>
                <h3
                  className={`text-2xl font-bold mb-3 ${darkMode ? "text-white" : "text-gray-900"}`}
                >
                  Selecciona un examen
                </h3>
                <p className={`${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  Elige un examen del panel lateral para ver el monitoreo en tiempo real
                </p>
              </div>
            ) : !estudianteSeleccionado ? (
              // ================= VISTA LISTA DE ESTUDIANTES =================
              <div className={`flex flex-col md:h-full ${vistaTransicionando ? "anim-fadeOut" : "anim-fadeIn"}`}>
                
                <div className="p-3 md:p-4 lg:p-6 pb-3 md:pb-3 lg:pb-4 flex-shrink-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <div>
                            <h1 className={`text-lg lg:text-2xl font-bold ${darkMode ? "text-white" : "text-slate-800"}`}>{examenActual.nombre}</h1>
                            <p className={`text-xs lg:text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{estudiantesFiltrados.length} estudiantes mostrados</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {examenActual.estado === "open" && (
                                <>
                                    <button
                                        onClick={handleEliminarTiempoLimite}
                                        className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "bg-slate-800 border-slate-700 hover:border-red-500 text-slate-200" : "bg-white border-slate-200 hover:border-red-500 text-slate-700"}`}
                                    >
                                        <TimerOff className="w-3.5 h-3.5 text-red-500" />
                                        Eliminar tiempo límite
                                    </button>
                                    {contadores.bloqueados > 0 && (
                                        <button
                                            onClick={handleDesbloquearTodos}
                                            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "bg-slate-800 border-slate-700 hover:border-teal-500 text-slate-200" : "bg-white border-slate-200 hover:border-teal-500 text-slate-700"}`}
                                        >
                                            <Zap className="w-3.5 h-3.5 text-teal-500" />
                                            Desbloquear todos ({contadores.bloqueados})
                                        </button>
                                    )}
                                    <button
                                        onClick={handleForzarEnvio}
                                        className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "bg-slate-800 border-slate-700 hover:border-orange-500 text-slate-200" : "bg-white border-slate-200 hover:border-orange-500 text-slate-700"}`}
                                    >
                                        <Send className="w-3.5 h-3.5 text-orange-500" />
                                        Forzar Envío
                                    </button>
                                </>
                            )}

                            {examenActual.estado === "closed" && (
                                <>
                                    {obtenerTipoExamen(examenActual) !== "pdf" && !mostrarOpcionesPostCalificacion && (
                                        <button
                                            onClick={handleCalificarAutomaticamente}
                                            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "bg-slate-800 border-slate-700 hover:border-indigo-500 text-slate-200" : "bg-white border-slate-200 hover:border-indigo-500 text-slate-700"}`}
                                        >
                                            <Zap className="w-3.5 h-3.5 text-indigo-500" />
                                            Calificar Auto
                                        </button>
                                    )}
                                    {mostrarOpcionesPostCalificacion && (
                                        <button
                                            onClick={handleDescargarNotas}
                                            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "bg-slate-800 border-slate-700 hover:border-rose-500 text-slate-200" : "bg-white border-slate-200 hover:border-rose-500 text-slate-700"}`}
                                        >
                                            <Download className="w-3.5 h-3.5 text-rose-500" />
                                            Descargar Notas
                                        </button>
                                    )}
                                    {hayCorreos && (
                                        <button 
                                            onClick={handleEnviarNotas}
                                            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "bg-slate-800 border-slate-700 hover:border-teal-500 text-slate-200" : "bg-white border-slate-200 hover:border-teal-500 text-slate-700"}`}
                                        >
                                            <Mail className="w-3.5 h-3.5 text-teal-500" />
                                            Enviar notas al correo
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="w-full mt-1">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setModoPrivacidad(!modoPrivacidad)}
                                className={`p-2 rounded-lg border transition-all ${darkMode ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"}`}
                                title={modoPrivacidad ? "Mostrar nombres" : "Ocultar nombres (Privacidad)"}
                            >
                                {modoPrivacidad ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                            <div className="relative flex-1">
                                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? "text-slate-500" : "text-slate-400"}`} />
                                <input
                                    type="text"
                                    placeholder="Buscar estudiante..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`w-full pl-10 pr-4 py-2 text-sm rounded-lg border transition-all ${darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-900"} focus:outline-none focus:border-teal-500`}
                                />
                            </div>
                            <select
                                value={criterioOrden}
                                onChange={(e) => setCriterioOrden(e.target.value as any)}
                                className={`px-3 py-2 rounded-lg border text-sm outline-none focus:border-teal-500 transition-all cursor-pointer ${darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-700"}`}
                            >
                                <option value="defecto">Hora de entrada</option>
                                <option value="az">A - Z</option>
                                <option value="za">Z - A</option>
                                <option value="duracion">Duración</option>
                                {mostrarOpcionesPostCalificacion && <option value="nota">Nota</option>}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Mobile: selector dropdown */}
                <div className="block md:hidden px-3 mb-3 flex-shrink-0">
                  <select
                    value={filtroActual}
                    onChange={(e) => cambiarFiltroExamen(e.target.value as FiltroEstado)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm font-medium focus:outline-none focus:border-teal-500 ${darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-slate-200 text-slate-700"}`}
                  >
                    {[
                      { key: "todos" as FiltroEstado, label: "Todos", count: contadores.todos },
                      { key: "activos" as FiltroEstado, label: "En Curso", count: contadores.activos },
                      { key: "bloqueados" as FiltroEstado, label: "Bloqueados", count: contadores.bloqueados },
                      { key: "terminados" as FiltroEstado, label: "Entregados", count: contadores.terminados },
                      { key: "calificados" as FiltroEstado, label: "Calificados", count: contadores.calificados },
                      { key: "abandonados" as FiltroEstado, label: "Abandonos", count: contadores.abandonados },
                    ].map((filtro) => (
                      <option key={filtro.key} value={filtro.key}>{filtro.label} ({filtro.count})</option>
                    ))}
                  </select>
                </div>

                {/* Desktop: tabs */}
                <div className={`hidden md:flex gap-0 px-3 lg:px-6 flex-shrink-0 mb-4 border-b overflow-x-auto scrollbar-hide ${darkMode ? "border-slate-800" : "border-slate-100"}`}>
                   {[
                      { key: "todos" as FiltroEstado, label: "Todos", count: contadores.todos },
                      { key: "activos" as FiltroEstado, label: "En Curso", count: contadores.activos },
                      { key: "bloqueados" as FiltroEstado, label: "Bloqueados", count: contadores.bloqueados },
                      { key: "terminados" as FiltroEstado, label: "Entregados", count: contadores.terminados },
                      { key: "calificados" as FiltroEstado, label: "Calificados", count: contadores.calificados },
                      { key: "abandonados" as FiltroEstado, label: "Abandonos", count: contadores.abandonados },
                   ].map((filtro) => (
                      <button
                        key={filtro.key}
                        onClick={() => cambiarFiltroExamen(filtro.key)}
                        className={`py-2.5 px-2 lg:px-3 text-xs lg:text-sm font-medium border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${
                          filtroActual === filtro.key
                          ? `border-teal-500 ${darkMode ? "text-teal-400" : "text-teal-600"}`
                          : `border-transparent ${darkMode ? "text-slate-400 hover:text-slate-300" : "text-slate-500 hover:text-slate-700"}`
                        }`}
                      >
                         {filtro.label} <span className="opacity-60 ml-1 text-xs">({filtro.count})</span>
                      </button>
                   ))}
                </div>

                <div className="md:flex-1 md:overflow-y-auto px-3 md:px-4 lg:px-6 pb-4 scrollbar-hide">
                   {estudiantesFiltrados.length === 0 ? (
                      <div className={`h-64 flex flex-col items-center justify-center ${darkMode ? "text-slate-400" : "text-slate-400"}`}>
                         <p>No se encontraron estudiantes</p>
                      </div>
                   ) : (
                      <div className="space-y-3">
                        {estudiantesFiltrados.map((estudiante) => {
                           const estado = traducirEstado(estudiante.estado);
                           const info = obtenerInfoVisual(estudiante);
                           
                           const isHidden = modoPrivacidad && !estudiantesRevelados.has(estudiante.id);
                           const displayName = isHidden ? "******" : info.principal;
                           const displaySecondary = isHidden ? "******" : info.secundario;

                           return (
                             <button
                               key={estudiante.id}
                               onClick={() => handleSeleccionarEstudiante(estudiante)}
                               className={`w-full text-left p-4 rounded-xl border transition-all group relative ${
                                  darkMode 
                                  ? "bg-slate-800/40 border-slate-700 hover:bg-slate-800 hover:border-slate-600" 
                                  : "bg-white border-slate-100 hover:border-teal-200 hover:shadow-md"
                               }`}
                             >
                                <div className="flex items-center gap-3">
                                   {/* Avatar */}
                                   <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center relative flex-shrink-0 ${darkMode ? "bg-slate-700 text-slate-300" : "bg-teal-50 text-teal-600"}`}>
                                      <User className="w-5 h-5 sm:w-6 sm:h-6" />
                                      {estudiante.preguntasPendientes && (
                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white dark:border-slate-800" title="Preguntas pendientes de calificación manual" />
                                      )}
                                   </div>

                                   {/* Contenido principal */}
                                   <div className="flex-1 min-w-0">
                                      {/* Fila 1: nombre + badges */}
                                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                         <h4 className={`font-bold text-sm truncate ${darkMode ? "text-white" : "text-slate-800"}`}>{displayName}</h4>
                                         {modoPrivacidad && (
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEstudiantesRevelados(prev => {
                                                        const newSet = new Set(prev);
                                                        if (newSet.has(estudiante.id)) newSet.delete(estudiante.id);
                                                        else newSet.add(estudiante.id);
                                                        return newSet;
                                                    });
                                                }}
                                                className={`p-1 rounded-md cursor-pointer transition-colors ${darkMode ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-slate-200 text-slate-600 hover:bg-slate-300"}`}
                                            >
                                                {isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                            </div>
                                         )}
                                         <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border flex-shrink-0 ${getEstadoBadgeColor(estado, darkMode)}`}>{estado}</span>
                                         {/* Badge conexión perdida */}
                                         {estudiante.connectionLost && (
                                           <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border animate-pulse flex-shrink-0 ${
                                             darkMode ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200"
                                           }`}>
                                             <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                               <path d="M1 6s4-4 11-4 11 4 11 4"/><path d="M5 10s2.5-2 7-2 7 2 7 2"/>
                                               <path d="M9 14s1.5-1 3-1 3 1 3 1"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                                               <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round"/>
                                             </svg>
                                             Sin señal
                                           </span>
                                         )}
                                         {estudiante.calificacion !== undefined && estudiante.calificacion !== null && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border flex-shrink-0 ${getEstadoBadgeColor("Calificado", darkMode)}`}>
                                               {mostrarOpcionesPostCalificacion ? estudiante.calificacion : "Cal."}
                                            </span>
                                         )}
                                      </div>

                                      {/* Fila 2: tiempo | alertas + progreso */}
                                      <div className="flex items-center justify-between gap-2">
                                         <span className={`flex items-center gap-1 text-xs font-mono flex-shrink-0 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                            <Clock className="w-3 h-3 flex-shrink-0"/>
                                            {calcularTiempoDisplay(estudiante)}
                                            {displaySecondary && <span className="hidden sm:inline"> • {displaySecondary}</span>}
                                         </span>

                                         <div className="flex items-center gap-2.5 flex-shrink-0">
                                            {/* Alertas */}
                                            <div className={`flex flex-col items-center ${estudiante.alertas > 0 ? "text-rose-500" : (darkMode ? "text-slate-600" : "text-slate-300")}`}>
                                               {estudiante.alertasNoLeidas ? (
                                                  <div className="relative animate-bounce">
                                                     <AlertTriangle className="w-4 h-4" />
                                                     <span className={`absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border ${darkMode ? "border-slate-800" : "border-white"}`} />
                                                  </div>
                                               ) : <AlertTriangle className="w-4 h-4" />}
                                               <span className="text-[10px] font-bold leading-none mt-0.5">{estudiante.alertas}</span>
                                            </div>

                                            {/* Barra de progreso */}
                                            <div className="w-16 sm:w-28 flex flex-col">
                                               <div className="flex justify-between mb-0.5">
                                                  <span className={`text-[9px] uppercase font-bold tracking-wide ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Prog.</span>
                                                  <span className={`text-[10px] font-bold ${darkMode ? "text-teal-400" : "text-teal-600"}`}>{estudiante.progreso}%</span>
                                               </div>
                                               <div className={`h-2 w-full rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                                                  <div className="h-full bg-gradient-to-r from-teal-400 to-teal-600 rounded-full transition-all duration-500" style={{ width: `${estudiante.progreso}%` }} />
                                               </div>
                                            </div>
                                         </div>
                                      </div>
                                   </div>

                                   <ChevronDown className={`w-4 h-4 -rotate-90 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-all ${darkMode ? "text-slate-500" : "text-slate-300"}`} />
                                </div>
                             </button>
                           );
                        })}
                      </div>
                   )}
                </div>
              </div>

            ) : (
              // ================= VISTA DETALLE ESTUDIANTE =================
              <div className={`flex flex-col md:h-full ${vistaTransicionando ? "anim-fadeOut" : "anim-slideUp"} ${darkMode ? "bg-slate-900/50" : "bg-white"}`}>
                 <div className={`px-3 md:px-4 lg:px-6 py-3 md:py-3 lg:py-4 border-b flex flex-wrap items-center justify-between gap-2 ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                    <button onClick={handleVolverLista} className={`flex items-center gap-2 text-sm font-medium transition-colors ${darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}`}>
                       <div className={`p-1.5 rounded-lg border ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
                           <ArrowLeft className="w-4 h-4" />
                       </div>
                       Volver a la lista
                    </button>
                    <div className="flex flex-wrap gap-2">
                         {examenActual.estado === "open" && estudianteSeleccionado.estado !== 'finished' && !(estudianteSeleccionado.calificacion !== undefined && estudianteSeleccionado.calificacion !== null) ? (
                           <>
                             <button onClick={() => handleLimpiarAlertas(estudianteSeleccionado.id)} className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "border-slate-700 hover:bg-slate-800 text-slate-300" : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-white"}`}>
                                <CheckCircle className="w-3.5 h-3.5" /> Limpiar Alertas
                             </button>
                             <button onClick={() => handleCerrarIntento(estudianteSeleccionado.id)} className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "border-slate-700 hover:bg-rose-900/20 text-rose-400" : "bg-rose-600 border-rose-600 hover:bg-rose-700 text-white"}`}>
                                <Ban className="w-3.5 h-3.5" /> Cerrar Examen
                             </button>
                             <button onClick={() => handleRestablecerAcceso(estudianteSeleccionado.id)} className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-500/20 transition-all flex items-center gap-2">
                                 <Zap className="w-3.5 h-3.5" /> Desbloquear
                             </button>
                           </>
                         ) : (
                            <button onClick={() => setModoRevision(true)} className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "border-slate-700 hover:bg-indigo-900/20 text-indigo-400" : "bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-white"}`}>
                               <FileText className="w-3.5 h-3.5" /> {estudianteSeleccionado.calificacion !== undefined && estudianteSeleccionado.calificacion !== null ? "Revisar Calificación" : "Calificar"}
                            </button>
                         )}
                    </div>
                 </div>

                 <div className="md:flex-1 flex flex-col md:min-h-0">
                     <div className={`p-3 md:p-3 lg:p-4 pb-0 flex-shrink-0 ${darkMode ? "bg-transparent" : "bg-white"}`}>

                     <div className="flex items-center gap-3 mb-3 relative overflow-hidden">
                        {/* Stamp de nota - sello grande rotado semi-transparente */}
                        {estudianteSeleccionado.calificacion !== undefined && estudianteSeleccionado.calificacion !== null && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 -rotate-12 pointer-events-none select-none z-0">
                            <div className={`relative flex flex-col items-center justify-center w-28 h-28 rounded-full border-4 border-double ${
                              estudianteSeleccionado.calificacion >= 4.0
                                ? (darkMode ? "border-emerald-400/40" : "border-emerald-500/30")
                                : estudianteSeleccionado.calificacion >= 3.0
                                  ? (darkMode ? "border-amber-400/40" : "border-amber-500/30")
                                  : (darkMode ? "border-rose-400/40" : "border-rose-500/30")
                            }`}>
                              <span className={`text-4xl font-black leading-none ${
                                estudianteSeleccionado.calificacion >= 4.0
                                  ? (darkMode ? "text-emerald-400/40" : "text-emerald-600/25")
                                  : estudianteSeleccionado.calificacion >= 3.0
                                    ? (darkMode ? "text-amber-400/40" : "text-amber-600/25")
                                    : (darkMode ? "text-rose-400/40" : "text-rose-600/25")
                              }`}>
                                {estudianteSeleccionado.calificacion}
                              </span>
                              <span className={`text-[9px] font-bold uppercase tracking-[0.15em] mt-1 ${
                                estudianteSeleccionado.calificacion >= 4.0
                                  ? (darkMode ? "text-emerald-400/35" : "text-emerald-600/20")
                                  : estudianteSeleccionado.calificacion >= 3.0
                                    ? (darkMode ? "text-amber-400/35" : "text-amber-600/20")
                                    : (darkMode ? "text-rose-400/35" : "text-rose-600/20")
                              }`}>
                                Calificado
                              </span>
                            </div>
                          </div>
                        )}

                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm z-10 ${darkMode ? "bg-slate-800 text-teal-400 border border-slate-700" : "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/20"}`}>
                            <User className="w-7 h-7" />
                        </div>
                        <div className="flex-1 z-10">
                            <div className="flex items-center gap-3">
                                <h2 className={`text-lg sm:text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                                    {modoPrivacidad && !estudiantesRevelados.has(estudianteSeleccionado.id) ? "******" : obtenerInfoVisual(estudianteSeleccionado).principal}
                                </h2>
                                {modoPrivacidad && (
                                    <button
                                        onClick={() => setEstudiantesRevelados(prev => {
                                            const newSet = new Set(prev);
                                            if (newSet.has(estudianteSeleccionado.id)) newSet.delete(estudianteSeleccionado.id);
                                            else newSet.add(estudianteSeleccionado.id);
                                            return newSet;
                                        })}
                                        className={`p-1.5 rounded-lg transition-colors ${darkMode ? "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700" : "bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200"}`}
                                    >
                                        {!estudiantesRevelados.has(estudianteSeleccionado.id) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border ${getEstadoBadgeColor(traducirEstado(estudianteSeleccionado.estado), darkMode)}`}>
                                    {traducirEstado(estudianteSeleccionado.estado)}
                                </span>
                                {/* Badge conexión perdida en vista detalle */}
                                {estudianteSeleccionado.connectionLost && (
                                  <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold border animate-pulse ${
                                    darkMode ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200"
                                  }`}>
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Conexión perdida
                                  </span>
                                )}
                                {estudianteSeleccionado.calificacion !== undefined && estudianteSeleccionado.calificacion !== null && (
                                    <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border ${getEstadoBadgeColor("Calificado", darkMode)}`}>
                                      Calificado
                                    </span>
                                )}
                                <span className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                    {modoPrivacidad && !estudiantesRevelados.has(estudianteSeleccionado.id) ? "******" : obtenerInfoVisual(estudianteSeleccionado).secundario}
                                </span>
                                {estudianteSeleccionado.codigo_acceso ? (
                                    <span className={`flex items-center gap-1.5 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                        <span>{["Terminado", "Calificado"].includes(traducirEstado(estudianteSeleccionado.estado)) ? "Código de revisión:" : "Código de acceso:"}</span>
                                        <span className={`font-mono font-bold tracking-widest px-2 py-0.5 rounded ${darkMode ? "bg-slate-700 text-amber-400" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                                            {estudianteSeleccionado.codigo_acceso}
                                        </span>
                                    </span>
                                ) : estudianteSeleccionado.estado?.toLowerCase() === "finished" && (
                                    <button
                                        onClick={() => handleRegenerarCodigoRevision(estudianteSeleccionado.id)}
                                        title="El código anterior ya fue usado por el estudiante (es de un solo uso). Genera uno nuevo para que pueda volver a ver su retroalimentación."
                                        className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded transition-colors ${darkMode ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"}`}
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Reactivar código de revisión
                                    </button>
                                )}
                            </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-3 gap-2 mb-3">

                        {/* Progreso */}
                        <div className={`p-2.5 rounded-xl border flex flex-col justify-between shadow-sm ${darkMode ? "bg-slate-800 border-slate-700" : "bg-gradient-to-br from-teal-50 to-white border-slate-200"}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-[9px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Progreso</span>
                                <span className={`text-sm font-bold ${darkMode ? "text-teal-400" : "text-teal-600"}`}>{estudianteSeleccionado.progreso}%</span>
                            </div>
                            <div className={`h-1.5 w-full rounded-full overflow-hidden ${darkMode ? "bg-slate-900 shadow-inner" : "bg-slate-100 shadow-inner"}`}>
                                <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full shadow-lg shadow-teal-500/20" style={{ width: `${estudianteSeleccionado.progreso}%` }}></div>
                            </div>
                        </div>

                        {/* Tiempo */}
                        <div className={`p-2.5 rounded-xl border flex flex-col justify-between shadow-sm ${darkMode ? "bg-slate-800 border-slate-700" : "bg-gradient-to-br from-blue-50 to-white border-slate-200"}`}>
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Tiempo Transcurrido</span>
                            <div className="flex items-center gap-1.5 mt-1">
                                <Clock className={`w-4 h-4 flex-shrink-0 ${darkMode ? "text-blue-500" : "text-blue-600"}`} />
                                <span className={`text-sm font-mono font-bold tracking-tight ${darkMode ? "text-white" : "text-slate-800"}`}>
                                    {calcularTiempoDisplay(estudianteSeleccionado)}
                                </span>
                            </div>
                        </div>

                        {/* Estado Alertas */}
                        <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                            estudianteSeleccionado.alertas > 0
                                ? (darkMode ? "bg-rose-500/10 border-rose-500/30" : "bg-rose-50 border-rose-200")
                                : (darkMode ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-200")
                        }`}>
                            <div className="min-w-0 flex-1">
                                <span className={`text-[9px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Seguridad</span>
                                <div className={`text-xs font-bold mt-0.5 leading-tight ${estudianteSeleccionado.alertas > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                                    {estudianteSeleccionado.alertas > 0 ? "Sospechoso" : "Seguro"}
                                </div>
                                <div className={`text-[10px] font-medium mt-0.5 ${darkMode ? "text-white/80" : "text-slate-800"}`}>{estudianteSeleccionado.alertas} incidentes</div>
                            </div>
                            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ml-1 ${estudianteSeleccionado.alertas > 0 ? "bg-rose-500 text-white" : "bg-emerald-500 text-white"}`}>
                                {estudianteSeleccionado.alertas > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            </div>
                        </div>
                     </div>
                     </div>

                     <div className={`md:flex-1 md:overflow-y-auto px-3 md:px-4 lg:px-6 pb-4 lg:pb-6 scrollbar-hide ${darkMode ? "bg-transparent" : "bg-white"}`}>
                        <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 sticky top-0 py-2 z-10 backdrop-blur-sm ${darkMode ? "bg-slate-900/95 text-white" : "bg-white/95 text-slate-800"}`}>
                            <Activity className="w-4 h-4 text-teal-500" />
                            Registro de Actividad
                        </h3>

                        {alertasEstudiante.length === 0 ? (
                             <div className={`p-8 rounded-xl border border-dashed flex flex-col items-center justify-center ${darkMode ? "border-slate-700 text-slate-500 bg-slate-800/30" : "border-slate-200 text-slate-400 bg-white"}`}>
                                <CheckCircle className={`w-8 h-8 mb-2 ${darkMode ? "opacity-50" : "text-emerald-500 opacity-50"}`} />
                                <span className={`text-sm font-medium ${darkMode ? "text-slate-500" : "text-slate-600"}`}>Sin incidentes registrados hasta el momento.</span>
                             </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 lg:gap-3">
                                {[...alertasEstudiante].reverse().map((alerta) => {
                                    const config = getAlertConfig(alerta.tipo_evento);
                                    return (
                                        <div key={alerta.id} className={`p-3 rounded-xl border shadow-sm flex flex-col gap-2 min-h-[90px] transition-transform hover:-translate-y-1 ${config.bg} ${config.border}`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${darkMode ? "bg-black/20" : "bg-white"} ${config.color}`}>
                                                    {config.icon}
                                                </div>
                                                <span className={`text-xs font-mono font-semibold flex-shrink-0 ml-auto ${darkMode ? "text-white/80" : "text-slate-600/90"}`}>
                                                    {new Date(alerta.fecha_envio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <div>
                                                <h4 className={`text-xs font-bold leading-tight ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{formatearTipoEvento(alerta.tipo_evento)}</h4>
                                                <p className={`text-xs mt-1 leading-snug ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                                                    {alerta.descripcion || "Se detectó un cambio en el comportamiento."}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                     </div>

                 </div>
                 <div className={`p-4 border-t flex justify-end ${darkMode ? "border-slate-800 bg-slate-900/30" : "border-slate-100 bg-slate-50/50"}`}>
                    <button onClick={() => handleEliminarIntento(estudianteSeleccionado.id)} className={`px-4 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${darkMode ? "border-red-900/30 bg-red-900/10 hover:bg-red-900/20 text-red-400" : "bg-white border-red-100 hover:bg-red-50 text-red-600 shadow-sm"}`}>
                       <Trash2 className="w-3.5 h-3.5" /> Eliminar intento
                    </button>
                 </div>
              </div>
            )}
          </div>
        </div>

        {mostrarModalAlertas && estudianteSeleccionado && (
          <AlertsModal mostrar={true} alertas={alertasEstudiante} darkMode={darkMode} onCerrar={() => setMostrarModalAlertas(false)} nombreEstudiante={estudianteSeleccionado.nombre_estudiante} />
        )}
      </div>

      <ConfirmModal
        {...modal}
        darkMode={darkMode}
        onCancelar={modal.onCancelar || cerrarModal}
      />

      {/* Modal de revisión de calificación — renderizado en document.body para escapar el stacking context */}
      {modoRevision && estudianteSeleccionado && createPortal(
        <div
          className="fixed top-0 left-0 w-screen h-screen bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-hidden animate-in fade-in duration-200"
          onClick={() => setModoRevision(false)}
        >
          <div
            className={`${darkMode ? "bg-slate-900" : "bg-white"} rounded-2xl w-[95vw] h-[95vh] relative shadow-2xl flex flex-col md:flex-row overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel izquierdo: PDF del examen — oculto en mobile */}
            {examenActual?.archivoPDF && mostrarPDFRevision && (
              <div className={`hidden md:flex flex-shrink-0 w-[42%] flex-col border-r ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
                <div className={`flex items-center justify-between px-4 py-2 border-b text-xs font-semibold ${darkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-50 border-gray-200 text-slate-500"}`}>
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Examen PDF
                  </span>
                  <button
                    onClick={() => setMostrarPDFRevision(false)}
                    className={`p-1 rounded hover:bg-red-100 hover:text-red-500 transition-colors ${darkMode ? "text-slate-400 hover:bg-red-900/30" : "text-slate-400"}`}
                    title="Ocultar PDF"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <iframe
                    src={`${buildPdfViewUrl(examenActual.archivoPDF)}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                    className="w-full h-full border-0"
                    title="Examen PDF"
                  />
                </div>
              </div>
            )}

            {/* Botón para mostrar PDF si está oculto — solo desktop */}
            {examenActual?.archivoPDF && !mostrarPDFRevision && (
              <div className={`hidden md:flex flex-shrink-0 items-start pt-4 px-2 border-r ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
                <button
                  onClick={() => setMostrarPDFRevision(true)}
                  className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl text-[10px] font-semibold border transition-colors ${darkMode ? "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"}`}
                  title="Mostrar PDF del examen"
                >
                  <FileText className="w-4 h-4" />
                  <span style={{ writingMode: "vertical-rl" }}>Ver PDF</span>
                </button>
              </div>
            )}

            {/* Panel derecho: GradeReview */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <GradeReview
                intentoId={estudianteSeleccionado.id}
                darkMode={darkMode}
                onVolver={() => setModoRevision(false)}
                onGradeUpdated={(intentoId, notaFinal) => {
                  setEstudianteSeleccionado(prev => prev ? { ...prev, calificacion: notaFinal, notaFinal } : prev);
                  if (examenActual) {
                    setExamAttempts(prev => ({
                      ...prev,
                      [examenActual.id]: (prev[examenActual.id] || []).map(a =>
                        a.id === intentoId ? { ...a, calificacion: notaFinal, notaFinal } : a
                      ),
                    }));
                  }
                  // Solo cerrar automáticamente para exámenes PDF (una sola nota global).
                  // Para exámenes normales con múltiples preguntas, el docente cierra manualmente.
                  if (estudianteSeleccionado?.esExamenPDF) {
                    setModoRevision(false);
                    mostrarModal(
                      "exito",
                      "Calificación guardada",
                      `La nota ${notaFinal} ha sido registrada exitosamente.`,
                      cerrarModal
                    );
                  }
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

    </>
  );
}
