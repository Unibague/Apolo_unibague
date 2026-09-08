import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR, ANSWER_FILES_SUBDIR } from "../config/storage";

export class AnswerFileService {
  /**
   * Guarda el archivo entregado por el estudiante en disco.
   * Devuelve el nombre generado (uuid + extensión original), listo para
   * almacenarse como `respuesta` de la pregunta y para reconstruir la URL
   * de descarga (`/api/exam/answer-file/<fileName>`).
   */
  async saveAnswerFile(
    file: Express.Multer.File,
  ): Promise<{ fileName: string; originalName: string; mimeType: string; size: number }> {
    const extension = path.extname(file.originalname) || "";
    const fileName = `${uuidv4()}${extension}`;
    const destDir = path.join(UPLOADS_DIR, ANSWER_FILES_SUBDIR);
    await fs.mkdir(destDir, { recursive: true });
    const filePath = path.join(destDir, fileName);
    await fs.writeFile(filePath, file.buffer);

    return {
      fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Resuelve la ruta absoluta del archivo en disco para servirlo.
   * Devuelve null si el archivo no existe.
   */
  async resolveAnswerFilePath(fileName: string): Promise<string | null> {
    if (!fileName) return null;
    const safeName = path.basename(fileName); // protege contra path traversal
    const filePath = path.join(UPLOADS_DIR, ANSWER_FILES_SUBDIR, safeName);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  async deleteAnswerFile(fileName: string): Promise<void> {
    if (!fileName) return;
    try {
      const safeName = path.basename(fileName);
      const filePath = path.join(UPLOADS_DIR, ANSWER_FILES_SUBDIR, safeName);
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        console.error(`Error eliminando archivo de respuesta: ${fileName}`, error);
      }
    }
  }
}

export const answerFileService = new AnswerFileService();
