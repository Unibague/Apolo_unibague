import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, ExternalLink } from "lucide-react";
import ExamPanel from "../../components/ExamQuestionsPanel";
import { useEffect, useMemo, useState } from "react";
import { examsApi } from "../../services/examsApi";
import { obtenerUsuarioActual } from "../../services/examsService";

interface VerExamenProps {
  darkMode: boolean;
}

export default function VerExamen({ darkMode }: VerExamenProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [examenCompleto, setExamenCompleto] = useState<any>(null);
  const [cargando, setCargando] = useState(false);

  // Examen básico pasado por navegación (puede tener pares sin cargar)
  const examenOriginal = location.state?.examen;

  // Fetch del examen completo con todas las relaciones (pares, options, etc.)
  useEffect(() => {
    if (!examenOriginal?.id) return;
    setCargando(true);
    examsApi
      .get(`/by-id/${examenOriginal.id}`, { withCredentials: true })
      .then((res) => setExamenCompleto(res.data))
      .catch(() => setExamenCompleto(null))
      .finally(() => setCargando(false));
  }, [examenOriginal?.id]);

  // Usar el examen completo si ya cargó, sino el original del state
  const examenEfectivo = examenCompleto ?? examenOriginal;

  // Detectar si es un examen PDF
  const isPdf = Boolean(examenEfectivo?.archivoPDF);
  const pdfUrl = useMemo(() => {
    if (!isPdf || !examenEfectivo?.archivoPDF) return null;
    const examsUrl = import.meta.env.VITE_EXAMS_BASE || window.location.origin;
    if (examenEfectivo.archivoPDF.startsWith("http")) {
      return `${examsUrl}/api/pdfs/proxy?url=${encodeURIComponent(examenEfectivo.archivoPDF)}`;
    }
    return `${examsUrl}/api/pdfs/${examenEfectivo.archivoPDF}`;
  }, [examenEfectivo, isPdf]);

  // Transformar datos del formato de edición al formato de visualización (ExamPanel)
  const examData = useMemo(() => {
    // Si no hay examen real, usamos un objeto base para mostrar solo los ejemplos
    const baseExamen = examenEfectivo || {
      nombre: "Vista Previa de Examen",
      descripcionExamen: "Este es un ejemplo de cómo se verá el examen.",
      questions: [],
    };

    // 1. Mapear preguntas existentes del examen real
    const mappedQuestions = (baseExamen.questions || []).map(
      (p: any, index: number) => {
        // Detectar formato: backend usa p.type (inglés), creación usa p.tipo (español)
        const isBackendFormat = p.type !== undefined;

        let type: "open" | "test" | "fill_blanks" | "match" | "file_upload" = "open";

        if (isBackendFormat) {
          // Formato backend: type ya es el valor correcto ("test","fill_blanks","match","open","file_upload")
          type = p.type;
        } else {
          // Formato creación: mapear tipo español al tipo inglés
          if (p.tipo === "seleccion-multiple") type = "test";
          else if (p.tipo === "rellenar-espacios") type = "fill_blanks";
          else if (p.tipo === "conectar") type = "match";
          else if (p.tipo === "abierta") type = "open";
          else if (p.tipo === "subir-archivo") type = "file_upload";
        }

        // textoCorrecto: backend lo tiene como campo directo; creación lo construye
        let textoCorrecto: string | undefined;
        if (isBackendFormat) {
          textoCorrecto = p.textoCorrecto;
        } else if (p.textoCompleto) {
          const palabras = p.textoCompleto.split(/\s+/);
          textoCorrecto = palabras
            .map((palabra: string, idx: number) => {
              const seleccionada = p.palabrasSeleccionadas?.find(
                (ps: any) => ps.indice === idx,
              );
              return seleccionada ? "___" : palabra;
            })
            .join(" ");
        }

        // pares: backend tiene { itemA: { id, text }, itemB: { id, text } }
        // creación tiene paresConexion[].izquierda / .derecha
        let pares: any[] | undefined;
        if (isBackendFormat && p.pares?.length) {
          pares = p.pares;
        } else if (p.paresConexion?.length) {
          pares = p.paresConexion.map((par: any, idx: number) => ({
            id: idx,
            itemA: { id: idx, text: par.izquierda },
            itemB: { id: idx, text: par.derecha },
          }));
        }

        // options: backend usa p.options[].texto; creación usa p.opciones[].texto
        const rawOptions = isBackendFormat ? p.options : p.opciones;
        const options = rawOptions?.map((op: any) => ({
          id: parseInt(op.id) || Math.random(),
          texto: op.texto,
        }));

        return {
          id: parseInt(p.id) || index + 1000,
          enunciado: isBackendFormat ? p.enunciado : (p.titulo || "Pregunta sin título"),
          puntaje: isBackendFormat ? p.puntaje : (p.puntos || 1),
          nombreImagen: p.nombreImagen || p.imagen,
          type,
          options,
          textoCorrecto,
          pares,
        };
      },
    );

    const usuario = obtenerUsuarioActual();
    const nombreProfesor = usuario
      ? `${usuario.nombre} ${usuario.apellido}`.trim()
      : "Docente";

    return {
      nombre: baseExamen.nombre,
      nombreProfesor,
      limiteTiempo: baseExamen.limiteTiempo ?? baseExamen.limiteTiempo?.valor ?? null,
      descripcion:
        baseExamen.descripcion ||
        baseExamen.descripcionExamen ||
        "",
      questions: mappedQuestions,
    };
  }, [examenEfectivo]);

  const handleAnswerChange = (_preguntaId: number, _respuesta: any) => {
    // En modo visualización no se permite modificar las respuestas
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto w-full">
      {/* Cabecera simple de navegación */}
      <div className="flex items-center gap-4 p-4 mb-4 rounded-xl border border-ui bg-surface shadow-sm">
        <button
          onClick={() => navigate("/exam-list")}
          className="p-2 rounded-lg transition-colors text-action hover:bg-ui-hover hover:text-ui-hover"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-primary">
            Vista Previa: {examData.nombre}
          </h1>
          {cargando && (
            <p className="text-xs text-muted">Cargando preguntas completas...</p>
          )}
        </div>
      </div>

      {/* Panel del Examen (Reutilizando el componente del estudiante o Visor PDF) */}
      <div className="flex-1 overflow-hidden rounded-xl border border-ui shadow-sm">
        {isPdf ? (
          <div className="w-full h-full flex flex-col bg-raised">
            <div className="px-4 py-3 border-b border-ui flex justify-between items-center bg-surface">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-secondary">
                  Documento del examen (PDF)
                </span>
              </div>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium hover:underline text-accent"
                >
                  <span>Abrir en nueva pestaña</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <div className="flex-1 relative bg-gray-200/50">
              {pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                  className="absolute inset-0 w-full h-full"
                  title="Vista previa PDF"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted">No se pudo cargar el archivo PDF.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto scrollbar-theme">
            <div className="pointer-events-none select-none">
              <ExamPanel
                examData={examData}
                darkMode={darkMode}
                answers={answers}
                onAnswerChange={handleAnswerChange}
                readOnly={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
