import path from "path";

// Directorio raíz donde se almacenan los archivos subidos por los estudiantes
// como respuesta a preguntas de tipo "Subir archivo".
// En dev, por default queda en server/ExamsAttempts/uploads/.
// En producción se puede sobreescribir con UPLOADS_DIR.
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, "../../uploads");

export const ANSWER_FILES_SUBDIR = "answers";

export const ANSWER_FILES_DIR = path.join(UPLOADS_DIR, ANSWER_FILES_SUBDIR);
