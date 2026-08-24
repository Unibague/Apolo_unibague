// src/services/examsService.ts
import { examsApi } from "./examsApi";
import type { Pregunta } from "../components/QuestionBuilder";

// ==================== TIPOS ====================

export interface DatosExamen {
  nombreExamen: string;
  descripcionExamen: string;
  tipoPregunta: "pdf" | "automatico";
  archivoPDF?: File | null;
  preguntasAutomaticas?: Pregunta[];
  camposActivos: Array<{ id: string; nombre: string }>;
  fechaInicio: string | null;
  fechaCierre: string | null;
  limiteTiempo: { valor: number; unidad: "minutos" } | null;
  opcionTiempoAgotado: string;
  seguridad: {
    contraseña: string;
    consecuenciaAbandono: string;
    navegacionSecuencial?: boolean;
    permitirVolverPreguntas?: boolean;
    ordenAleatorio?: boolean;
  };
  herramientasActivas: string[];
}

export interface ExamenCreado {
  id: number;
  nombre: string;
  descripcion: string;
  codigoExamen: string;
  archivoPDF?: string | null;
  fecha_creacion: string;
  estado: "open" | "closed" | "archivado";
  id_profesor: number;
  horaApertura: string;
  horaCierre: string;
  questions: any[];
  necesitaNombreCompleto?: boolean;
  necesitaCorreoElectrónico?: boolean;
  necesitaCodigoEstudiantil?: boolean;
  codigoRegeneradoEn?: string | null;
}

// ==================== MAPEO DE DATOS ====================

function mapearConsecuencia(
  consecuencia: string,
): "notificar" | "bloquear" | "ninguna" {
  const mapa: Record<string, "notificar" | "bloquear" | "ninguna"> = {
    notificar: "notificar",
    "notificar-profesor": "notificar",
    bloquear: "bloquear",
    "desbloqueo-manual": "bloquear",
    ninguna: "ninguna",
    "desactivar-proteccion": "ninguna",
    "": "ninguna",
  };

  return mapa[consecuencia.toLowerCase()] || "ninguna";
}

function mapearTiempoAgotado(opcion: string): "enviar" | "descartar" {
  return opcion === "envio-automatico" ? "enviar" : "descartar";
}

/**
 * Convierte una imagen base64 a File
 */
function base64ToFile(base64String: string, fileName: string): File {
  // Extraer el tipo MIME y los datos base64
  const arr = base64String.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], fileName, { type: mime });
}

/**
 * Mapea las preguntas del frontend al formato del backend
 * Retorna: { preguntasSinImagen, imagenesMap }
 */
function mapearPreguntasConImagenes(preguntas: Pregunta[], incluirIds = false) {
  const preguntasMapeadas: any[] = [];
  const imagenesMap: Map<string, File> = new Map();

  preguntas.forEach((pregunta, index) => {
    const idNum = pregunta.id ? parseInt(pregunta.id, 10) : undefined;
    const base: any = {
      ...(incluirIds && idNum && !isNaN(idNum) ? { id: idNum } : {}),
      enunciado:
        pregunta.titulo.trim() ||
        `Pregunta ${index + 1}`,
      puntaje: pregunta.puntos,
      calificacionParcial: pregunta.calificacionParcial || false,
      nombreImagen: null as string | null,
    };

    // 🖼️ Manejar imagen si existe
    if (pregunta.imagen) {
      if (pregunta.imagen.startsWith("http")) {
        // URL de Cloudinary existente (modo edición sin cambiar imagen) — usar directo
        base.nombreImagen = pregunta.imagen;
      } else {
        // Base64 (imagen nueva subida por el usuario) — convertir a File para subir
        const imageName = `image_${index}`;
        const imageFile = base64ToFile(pregunta.imagen, `${imageName}.png`);
        imagenesMap.set(imageName, imageFile);
        base.nombreImagen = imageName;
      }
    }

    let preguntaMapeada: any;

    switch (pregunta.tipo) {
      case "seleccion-multiple":
        preguntaMapeada = {
          ...base,
          type: "test",
          shuffleOptions: true,
          options:
            pregunta.opciones?.map((op) => ({
              texto: op.texto,
              esCorrecta: op.esCorrecta,
            })) || [],
        };
        break;

      case "abierta":
        preguntaMapeada = {
          ...base,
          type: "open",
        };

        // ✅ Formato correcto para palabras clave
        if (
          pregunta.metodoEvaluacion === "texto-exacto" &&
          pregunta.textoExacto
        ) {
          preguntaMapeada.textoRespuesta = pregunta.textoExacto;
          preguntaMapeada.palabrasClave = [];
        } else if (
          pregunta.metodoEvaluacion === "palabras-clave" &&
          pregunta.palabrasClave
        ) {
          preguntaMapeada.textoRespuesta = null;
          // ✅ Convertir array de strings a array de objetos { texto: "..." }
          preguntaMapeada.palabrasClave = pregunta.palabrasClave.map(
            (palabra) => ({
              texto: palabra,
            }),
          );
        } else {
          preguntaMapeada.textoRespuesta = null;
          preguntaMapeada.palabrasClave = [];
        }
        break;

      case "rellenar-espacios":
        // Generar el texto con espacios reemplazados por ___
        let textoConEspacios = pregunta.textoCompleto || "";
        const palabrasSeleccionadas = pregunta.palabrasSeleccionadas || [];
        
        // Ordenar palabras seleccionadas por índice descendente para reemplazar
        const palabrasOrdenadas = [...palabrasSeleccionadas].sort((a, b) => b.indice - a.indice);
        
        // Reemplazar cada palabra seleccionada con ___
        palabrasOrdenadas.forEach(palabra => {
          const palabras = textoConEspacios.split(/\s+/);
          palabras[palabra.indice] = "___";
          textoConEspacios = palabras.join(" ");
        });
        
        preguntaMapeada = {
          ...base,
          type: "fill_blanks",
          textoCorrecto: textoConEspacios || "Texto no configurado",
          respuestas:
            palabrasSeleccionadas.map((palabra, idx) => ({
              posicion: idx,
              textoCorrecto: palabra.palabra,
            })),
        };
        break;

      case "conectar":
        preguntaMapeada = {
          ...base,
          type: "matching",
          pares:
            pregunta.paresConexion?.map((par) => ({
              itemA: par.izquierda,
              itemB: par.derecha,
            })) || [],
        };
        break;

      default:
        throw new Error(
          `Tipo de pregunta no soportado: ${(pregunta as any).tipo}`,
        );
    }

    preguntasMapeadas.push(preguntaMapeada);
  });

  return { preguntasMapeadas, imagenesMap };
}

// ==================== SERVICIO PRINCIPAL ====================

export const examsService = {
  /**
   * Crear un nuevo examen
   */
  crearExamen: async (
    datosExamen: DatosExamen,
    usuarioId: number,
  ): Promise<{
    success: boolean;
    codigoExamen: string;
    examen?: ExamenCreado;
    error?: string;
  }> => {
    try {
      // ✅ Mapear preguntas y extraer imágenes
      let preguntasMapeadas: any[] = [];
      let imagenesMap: Map<string, File> = new Map();

      if (
        datosExamen.tipoPregunta === "automatico" &&
        datosExamen.preguntasAutomaticas
      ) {
        const resultado = mapearPreguntasConImagenes(
          datosExamen.preguntasAutomaticas,
          false, // crear: no incluir IDs (son temporales del frontend)
        );
        preguntasMapeadas = resultado.preguntasMapeadas;
        imagenesMap = resultado.imagenesMap;

      }

      const examData: any = {
        nombre: datosExamen.nombreExamen,
        descripcion: datosExamen.descripcionExamen || "",
        contrasena: datosExamen.seguridad.contraseña || "",
        fecha_creacion: new Date().toISOString(),
        estado: "closed",
        id_profesor: usuarioId,

        necesitaNombreCompleto: datosExamen.camposActivos.some(
          (c) => c.id === "nombre",
        ),
        necesitaCorreoElectrónico: datosExamen.camposActivos.some(
          (c) => c.id === "correo",
        ),
        necesitaCodigoEstudiantil: datosExamen.camposActivos.some(
          (c) => c.id === "codigoEstudiante",
        ),

        incluirHerramientaDibujo:
          datosExamen.herramientasActivas.includes("dibujo"),
        incluirCalculadoraCientifica:
          datosExamen.herramientasActivas.includes("calculadora"),
        incluirHojaExcel: datosExamen.herramientasActivas.includes("excel"),
        incluirJavascript:
          datosExamen.herramientasActivas.includes("javascript"),
        incluirPython: datosExamen.herramientasActivas.includes("python"),

        horaApertura: datosExamen.fechaInicio
          ? new Date(datosExamen.fechaInicio).toISOString()
          : null,
        horaCierre: datosExamen.fechaCierre
          ? new Date(datosExamen.fechaCierre).toISOString()
          : null,
        limiteTiempo: datosExamen.limiteTiempo?.valor || null,
        limiteTiempoCumplido: (datosExamen.limiteTiempo?.valor || datosExamen.fechaCierre)
          ? mapearTiempoAgotado(datosExamen.opcionTiempoAgotado)
          : null,

        necesitaContrasena: !!datosExamen.seguridad.contraseña,
        consecuencia: mapearConsecuencia(
          datosExamen.seguridad.consecuenciaAbandono,
        ),

        dividirPreguntas: datosExamen.seguridad.navegacionSecuencial ?? false,
        permitirVolverPreguntas: datosExamen.seguridad.permitirVolverPreguntas ?? false,
        ordenAleatorio: datosExamen.seguridad.ordenAleatorio ?? false,

        questions: preguntasMapeadas,
      };

      // ✅ Crear FormData y agregar datos
      const formData = new FormData();
      formData.append("data", JSON.stringify(examData));

      // ✅ Agregar PDF si existe
      if (datosExamen.tipoPregunta === "pdf" && datosExamen.archivoPDF) {
        formData.append("examPDF", datosExamen.archivoPDF);
      }

      // ✅ Agregar imágenes de las preguntas
      if (imagenesMap.size > 0) {
        imagenesMap.forEach((file, key) => {
          formData.append(key, file);
        });
      }


      const response = await examsApi.post("/", formData, {
        withCredentials: true,
      });

      return {
        success: true,
        codigoExamen: response.data.examen.codigoExamen,
        examen: response.data.examen,
      };
    } catch (error: any) {
      console.error("❌ [EXAMS] Error al crear examen:", error);

      const mensajeError =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Error al crear el examen";

      return {
        success: false,
        codigoExamen: "",
        error: mensajeError,
      };
    }
  },

  /**
   * Obtener exámenes del profesor
   */
  obtenerMisExamenes: async (profesorId: number): Promise<ExamenCreado[]> => {
    try {
      const response = await examsApi.get(`/me`);
      return response.data;
    } catch (error: any) {
      console.error("❌ [EXAMS] Error al obtener exámenes:", error);
      throw new Error(
        error.response?.data?.message || "Error al obtener exámenes",
      );
    }
  },

  getExamForAttempt: async (codigo: string): Promise<ExamenCreado[]> => {
    try {
      const codigoLimpio = codigo.trim();
      const response = await examsApi.get(`/forAttempt/${codigoLimpio}`);

      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || "Error al obtener exámenes",
      );
    }
  },

  validatePassword: async (
    codigo_examen: string,
    contrasena?: string,
  ): Promise<{ valid: boolean }> => {
    try {
      const response = await examsApi.post("/validate-password", {
        codigo_examen,
        contrasena,
      });

      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || "Error al validar contraseña",
      );
    }
  },

  /**
   * Obtener examen por código (PÚBLICO - para estudiantes)
   */
  obtenerExamenPorCodigo: async (
    codigo: string,
  ): Promise<ExamenCreado | null> => {
    try {
      const codigoLimpio = codigo.trim();
      const response = await examsApi.get(`/${codigoLimpio}`);
      return response.data ?? null;
    } catch (error: any) {
      if (error.response?.status !== 404) {
        console.error("❌ [EXAMS] Error al buscar examen:", error);
      }
      return null;
    }
  },

  /**
   * Eliminar examen por ID
   */
  eliminarExamen: async (id: number, profesorId: number): Promise<boolean> => {
    try {
      await examsApi.delete(`/${id}/single`, {
        withCredentials: true,
      });

      return true;
    } catch (error: any) {
      console.error("❌ [EXAMS] Error al eliminar examen:", error);
      throw new Error(
        error.response?.data?.message || "Error al eliminar el examen",
      );
    }
  },

  updateExamStatus: async (
    examId: number,
    nuevoEstado: "open" | "closed",
  ): Promise<ExamenCreado> => {
    try {
      const response = await examsApi.patch(
        `/${examId}/status`,
        { estado: nuevoEstado },
        { withCredentials: true },
      );

      return response.data.examen;
    } catch (error: any) {
      console.error("❌ [EXAMS] Error al actualizar estado:", error);
      throw new Error(
        error.response?.data?.message ||
          "Error al actualizar estado del examen",
      );
    }
  },

  actualizarExamen: async (
    examId: number,
    datosExamen: DatosExamen,
  ): Promise<{
    success: boolean;
    codigoExamen: string;
    examen?: ExamenCreado;
    error?: string;
  }> => {
    try {
      let preguntasMapeadas: any[] = [];
      let imagenesMap: Map<string, File> = new Map();

      if (
        datosExamen.tipoPregunta === "automatico" &&
        datosExamen.preguntasAutomaticas
      ) {
        const resultado = mapearPreguntasConImagenes(
          datosExamen.preguntasAutomaticas,
          true, // edición: incluir IDs para identificar preguntas existentes
        );
        preguntasMapeadas = resultado.preguntasMapeadas;
        imagenesMap = resultado.imagenesMap;
      }

      const examData: any = {
        nombre: datosExamen.nombreExamen,
        descripcion: datosExamen.descripcionExamen || "",
        contrasena: datosExamen.seguridad.contraseña || "",

        necesitaNombreCompleto: datosExamen.camposActivos.some(
          (c) => c.id === "nombre",
        ),
        necesitaCorreoElectrónico: datosExamen.camposActivos.some(
          (c) => c.id === "correo",
        ),
        necesitaCodigoEstudiantil: datosExamen.camposActivos.some(
          (c) => c.id === "codigoEstudiante",
        ),

        incluirHerramientaDibujo:
          datosExamen.herramientasActivas.includes("dibujo"),
        incluirCalculadoraCientifica:
          datosExamen.herramientasActivas.includes("calculadora"),
        incluirHojaExcel: datosExamen.herramientasActivas.includes("excel"),
        incluirJavascript:
          datosExamen.herramientasActivas.includes("javascript"),
        incluirPython: datosExamen.herramientasActivas.includes("python"),

        horaApertura: datosExamen.fechaInicio
          ? new Date(datosExamen.fechaInicio).toISOString()
          : null,
        horaCierre: datosExamen.fechaCierre
          ? new Date(datosExamen.fechaCierre).toISOString()
          : null,
        limiteTiempo: datosExamen.limiteTiempo?.valor || null,
        limiteTiempoCumplido: (datosExamen.limiteTiempo?.valor || datosExamen.fechaCierre)
          ? mapearTiempoAgotado(datosExamen.opcionTiempoAgotado)
          : null,

        necesitaContrasena: !!datosExamen.seguridad.contraseña,
        consecuencia: mapearConsecuencia(
          datosExamen.seguridad.consecuenciaAbandono,
        ),

        dividirPreguntas: datosExamen.seguridad.navegacionSecuencial ?? false,
        permitirVolverPreguntas: datosExamen.seguridad.permitirVolverPreguntas ?? false,
        ordenAleatorio: datosExamen.seguridad.ordenAleatorio ?? false,

        questions: preguntasMapeadas,
      };

      const formData = new FormData();
      formData.append("data", JSON.stringify(examData));

      // Solo adjuntar PDF si se seleccionó uno nuevo
      if (datosExamen.tipoPregunta === "pdf" && datosExamen.archivoPDF) {
        formData.append("examPDF", datosExamen.archivoPDF);
      }

      if (imagenesMap.size > 0) {
        imagenesMap.forEach((file, key) => {
          formData.append(key, file);
        });
      }

      const response = await examsApi.put(`/${examId}`, formData, {
        withCredentials: true,
      });

      return {
        success: true,
        codigoExamen: response.data.examen.codigoExamen,
        examen: response.data.examen,
      };
    } catch (error: any) {
      console.error("❌ [EXAMS] Error al actualizar examen:", error);
      return {
        success: false,
        codigoExamen: "",
        error:
          error.response?.data?.message || "Error al actualizar el examen",
      };
    }
  },

  duplicarExamen: async (examId: number): Promise<ExamenCreado> => {
    const response = await examsApi.post(`/${examId}/copy`, {}, { withCredentials: true });
    return response.data.examen;
  },

  compartirExamen: async (examId: number, correoDestino: string): Promise<ExamenCreado> => {
    const response = await examsApi.post(`/${examId}/share`, { correoDestino }, { withCredentials: true });
    return response.data.examen;
  },

  archiveExam: async (examId: number): Promise<void> => {
    await examsApi.patch(`/${examId}/archive`, {}, { withCredentials: true });
  },

  regenerarCodigoExamen: async (
    examId: number,
  ): Promise<{ codigoExamen: string; codigoRegeneradoEn: string }> => {
    const response = await examsApi.patch(
      `/${examId}/regenerate-code`,
      {},
      { withCredentials: true },
    );
    return {
      codigoExamen: response.data.codigoExamen,
      codigoRegeneradoEn: response.data.codigoRegeneradoEn,
    };
  },

  unarchiveExam: async (examId: number): Promise<void> => {
    await examsApi.patch(
      `/${examId}/status`,
      { estado: "closed" },
      { withCredentials: true },
    );
  },

  getExamById: async (examId: number): Promise<any> => {
    const response = await examsApi.get(`/by-id/${examId}`, { withCredentials: true });
    return response.data;
  },
};

// ==================== HELPER: Obtener usuario actual ====================

export function obtenerUsuarioActual() {
  try {
    const userStr = localStorage.getItem("usuario");
    if (!userStr) return null;

    const user = JSON.parse(userStr);
    return {
      id: user.id || user.backendId,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
    };
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    return null;
  }
}