import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

// El mimetype que reporta el navegador para extensiones poco comunes (.ipynb, .py, etc.)
// es poco confiable (varía según SO/navegador y muchas veces llega como
// "application/octet-stream"). Por eso la validación principal es por extensión;
// el mimetype solo se usa para los formatos más comunes.
const ALLOWED_EXTENSIONS = [
  // Documentos
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".md",
  // Imágenes
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
  // Comprimidos
  ".zip", ".rar", ".7z",
  // Código y notebooks
  ".ipynb", ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".cpp", ".h",
  ".cs", ".html", ".css", ".json", ".xml", ".sql", ".r", ".m", ".sh", ".rb", ".php",
];

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const extension = path.extname(file.originalname || "").toLowerCase();

  if (ALLOWED_EXTENSIONS.includes(extension)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Tipo de archivo no permitido: "${extension || file.mimetype}". Formatos aceptados: PDF, Word, Excel, PowerPoint, texto, Markdown, CSV, imágenes, comprimidos (zip/rar/7z) y archivos de código o notebooks (ipynb, py, js, ts, java, c, cpp, html, css, json, xml, sql, etc.).`,
      ),
      false,
    );
  }
};

export const uploadAnswerFile = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});
