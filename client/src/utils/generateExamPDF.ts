import { jsPDF } from "jspdf";

// ─── Layout constants ─────────────────────────────────────────────────────────
const MARGIN    = 18;
const PAGE_W    = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;   // 174 mm
const PAGE_H    = 297;
const FOOTER_H  = 15;
const MAX_Y     = PAGE_H - FOOTER_H;

// ─── Color palette ────────────────────────────────────────────────────────────
const BLUE    = [37,  99, 235] as const;   // blue-600
const NAVY    = [15,  23,  42] as const;   // slate-950
const GRAY_95 = [248, 250, 252] as const;  // slate-50
const GRAY_90 = [241, 245, 249] as const;  // slate-100
const GRAY_80 = [226, 232, 240] as const;  // slate-200
const GRAY_60 = [148, 163, 184] as const;  // slate-400
const GRAY_40 = [100, 116, 139] as const;  // slate-500
const GRAY_20 = [51,  65,  85]  as const;  // slate-700
const WHITE   = [255, 255, 255] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function checkBreak(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > MAX_Y) {
    doc.addPage();
    return MARGIN + 8;
  }
  return y;
}

/** Convert HTML rich-text into plain text suitable for jsPDF */
function stripHtml(html: string): string {
  if (!html) return "";
  let text = html;
  // Convert block-level tags to line breaks
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  // Add bullet for list items
  text = text.replace(/<li[^>]*>/gi, "• ");
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function writeWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  leading = 5.5,
): number {
  const lines = doc.splitTextToSize(String(text ?? ""), maxW);
  for (const line of lines) {
    y = checkBreak(doc, y, leading);
    doc.text(line, x, y);
    y += leading;
  }
  return y;
}

// ─── Image loader ─────────────────────────────────────────────────────────────
async function loadImage(
  url: string,
): Promise<{ base64: string; format: string; width: number; height: number } | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const format = blob.type.includes("png") ? "PNG" : blob.type.includes("gif") ? "GIF" : "JPEG";
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = base64;
    });
    return { base64, format, width, height };
  } catch {
    return null;
  }
}

// ─── Footer stamper ───────────────────────────────────────────────────────────
function stampFooters(doc: jsPDF, examName: string): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const fy = PAGE_H - FOOTER_H + 1;
    doc.setDrawColor(...GRAY_80);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, fy, PAGE_W - MARGIN, fy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_60);
    const name = examName.length > 70 ? examName.slice(0, 67) + "..." : examName;
    doc.text(name, MARGIN, fy + 6.5);
    const label = `Pagina ${p} de ${total}`;
    doc.text(label, PAGE_W - MARGIN - doc.getTextWidth(label), fy + 6.5);
  }
}

// ─── Per-type renderers ───────────────────────────────────────────────────────
const LETTERS = "ABCDEFGHIJ";

function renderTest(doc: jsPDF, q: any, y: number, withAnswers: boolean): number {
  const options: any[] = q.options ?? [];
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const correct = withAnswers && opt.esCorrecta === true;
    y = checkBreak(doc, y, 8);

    const cx = MARGIN + 16;
    const cy = y - 2.2;

    if (correct) {
      doc.setFillColor(...BLUE);
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(0.4);
      doc.circle(cx, cy, 2.3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...WHITE);
      const ltr = LETTERS[i] ?? String(i + 1);
      doc.text(ltr, cx - doc.getTextWidth(ltr) / 2, cy + 1);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BLUE);
    } else {
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...GRAY_80);
      doc.setLineWidth(0.4);
      doc.circle(cx, cy, 2.3, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY_40);
      const ltr = LETTERS[i] ?? String(i + 1);
      doc.text(ltr, cx - doc.getTextWidth(ltr) / 2, cy + 1);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRAY_20);
    }

    const lines = doc.splitTextToSize(opt.texto ?? "", CONTENT_W - 22);
    doc.text(lines, MARGIN + 21, y);
    y += lines.length * 5.5 + 2;
  }
  return y;
}

function renderOpen(doc: jsPDF, q: any, y: number, withAnswers: boolean): number {
  if (withAnswers) {
    const kws: any[] = q.keywords ?? [];
    const exact: string | null = q.textoRespuesta ?? null;
    if (kws.length > 0) {
      y = checkBreak(doc, y, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLUE);
      doc.text("PALABRAS CLAVE", MARGIN + 10, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRAY_20);
      y = writeWrapped(doc, kws.map((k: any) => k.texto).join(",  "), MARGIN + 10, y, CONTENT_W - 12);
      y += 2;
    }
    if (exact) {
      y = checkBreak(doc, y, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLUE);
      doc.text("RESPUESTA", MARGIN + 10, y);
      y += 5;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRAY_20);
      y = writeWrapped(doc, `"${exact}"`, MARGIN + 10, y, CONTENT_W - 12);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      y = checkBreak(doc, y, 9);
      doc.setDrawColor(...GRAY_80);
      doc.setLineWidth(0.3);
      doc.line(MARGIN + 10, y, PAGE_W - MARGIN, y);
      y += 9;
    }
  }
  return y;
}

function renderFillBlanks(doc: jsPDF, q: any, y: number, withAnswers: boolean): number {
  if (q.textoCorrecto) {
    y = checkBreak(doc, y, 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BLUE);
    doc.text("TEXTO COMPLETO", MARGIN + 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRAY_20);
    y = writeWrapped(doc, q.textoCorrecto, MARGIN + 10, y, CONTENT_W - 12);
    y += 2;
  }
  if (withAnswers) {
    const blanks: any[] = (q.respuestas ?? []).slice().sort((a: any, b: any) => a.posicion - b.posicion);
    if (blanks.length > 0) {
      y = checkBreak(doc, y, 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLUE);
      doc.text("RESPUESTAS", MARGIN + 10, y);
      y += 5;
      for (const b of blanks) {
        y = checkBreak(doc, y, 7);
        // Badge for blank number
        doc.setFillColor(...GRAY_90);
        doc.setDrawColor(...GRAY_80);
        doc.setLineWidth(0.2);
        doc.roundedRect(MARGIN + 10, y - 4.2, 7.5, 5.5, 1, 1, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...BLUE);
        const numStr = String(b.posicion + 1);
        doc.text(numStr, MARGIN + 13.75 - doc.getTextWidth(numStr) / 2, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...GRAY_20);
        doc.text(b.textoCorrecto, MARGIN + 20, y);
        y += 6.5;
      }
    }
  }
  return y;
}

function renderMatch(doc: jsPDF, q: any, y: number, withAnswers: boolean): number {
  const pares: any[] = q.pares ?? [];
  if (pares.length === 0) return y;

  const tableX = MARGIN + 10;
  const tableW = CONTENT_W - 10;
  const colSplit = tableX + tableW * 0.47;
  const colAW = colSplit - tableX - 5;
  const colBW = tableX + tableW - colSplit - 5;

  // Header row
  y = checkBreak(doc, y, 11);
  doc.setFillColor(...NAVY);
  doc.rect(tableX, y - 6, tableW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...WHITE);
  doc.text("Columna A", tableX + 4, y - 1);
  doc.text("Columna B", colSplit + 4, y - 1);
  // Vertical divider in header
  doc.setDrawColor(...GRAY_60);
  doc.setLineWidth(0.3);
  doc.line(colSplit, y - 6, colSplit, y + 2);
  y += 4;

  // Data rows
  for (let i = 0; i < pares.length; i++) {
    const par = pares[i];
    const textA = par.itemA?.text ?? "";
    const textB = par.itemB?.text ?? "";
    const linesA = doc.splitTextToSize(textA, colAW);
    const linesB = doc.splitTextToSize(textB, colBW);
    const rowH = Math.max(linesA.length, linesB.length) * 5.5 + 4;

    y = checkBreak(doc, y, rowH + 2);

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(...GRAY_95);
    } else {
      doc.setFillColor(...WHITE);
    }
    doc.rect(tableX, y - 4, tableW, rowH, "F");
    // Row border + vertical divider
    doc.setDrawColor(...GRAY_80);
    doc.setLineWidth(0.25);
    doc.rect(tableX, y - 4, tableW, rowH, "S");
    doc.line(colSplit, y - 4, colSplit, y - 4 + rowH);

    // Column A (always shown)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRAY_20);
    doc.text(linesA, tableX + 4, y);

    // Column B
    if (withAnswers) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY_20);
    }
    doc.text(linesB, colSplit + 4, y);

    y += rowH;
  }
  return y + 3;
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function generateExamPDF(
  exam: any,
  incluirRespuestas: boolean,
  profesorName: string,
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const questions: any[] = exam.questions ?? [];
  const totalPts = questions.reduce((s: number, q: any) => s + (q.puntaje ?? 0), 0);
  const dateStr = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let y = MARGIN;

  // ── Header: dark bg + blue accent strip + exam title ───────────────────────
  const hdrH = 24;
  doc.setFillColor(...NAVY);
  doc.rect(MARGIN, y, CONTENT_W, hdrH, "F");
  // Blue left accent
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN, y, 4, hdrH, "F");
  // Exam title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  const titleLines = doc.splitTextToSize(exam.nombre ?? "Examen", CONTENT_W - 20);
  const titleY = y + hdrH / 2 + (titleLines.length > 1 ? -2.5 : 2);
  titleLines.forEach((line: string, idx: number) => {
    doc.text(line, MARGIN + 9, titleY + idx * 7.5);
  });
  // "con respuestas" tag
  if (incluirRespuestas) {
    doc.setFillColor(...BLUE);
    const tagW = 31;
    const tagH = 6;
    const tagX = PAGE_W - MARGIN - tagW;
    const tagY = y + hdrH - tagH - 3;
    doc.roundedRect(tagX, tagY, tagW, tagH, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text("CON RESPUESTAS", tagX + 2, tagY + 4.2);
  }
  y += hdrH;

  // ── Meta bar: light bg + 3-column grid ─────────────────────────────────────
  const metaH = 20;
  doc.setFillColor(...GRAY_90);
  doc.rect(MARGIN, y, CONTENT_W, metaH, "F");
  doc.setDrawColor(...GRAY_80);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_W, metaH, "S");
  // Blue bottom accent line
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN, y + metaH - 1.5, CONTENT_W, 1.5, "F");

  const pad = MARGIN + 5;
  const col2X = MARGIN + CONTENT_W * 0.43;
  const col3X = MARGIN + CONTENT_W * 0.70;
  const labelY = y + 6.5;
  const valY   = y + 14;

  // Labels
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...BLUE);
  doc.text("PROFESOR", pad, labelY);
  doc.text("CODIGO", col2X, labelY);
  doc.text("FECHA", col3X, labelY);

  // Values
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_20);
  const maxProfW = col2X - pad - 3;
  const profLine = doc.splitTextToSize(profesorName, maxProfW)[0] ?? profesorName;
  doc.text(profLine, pad, valY);
  doc.text(exam.codigoExamen ?? "", col2X, valY);
  doc.text(dateStr, col3X, valY);
  y += metaH;

  // ── Info strip: questions count + total score ───────────────────────────────
  const infoH = 10;
  doc.setFillColor(...WHITE);
  doc.rect(MARGIN, y, CONTENT_W, infoH, "F");
  doc.setDrawColor(...GRAY_80);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + infoH, PAGE_W - MARGIN, y + infoH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_40);
  doc.text(`${questions.length} ${questions.length === 1 ? "pregunta" : "preguntas"}`, pad, y + 6.8);
  const ptsStr = `Puntaje total: ${totalPts % 1 === 0 ? totalPts : totalPts.toFixed(1)} pts`;
  doc.text(ptsStr, PAGE_W - MARGIN - doc.getTextWidth(ptsStr) - 4, y + 6.8);
  y += infoH + 11;

  // ── Questions ──────────────────────────────────────────────────────────────
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    y = checkBreak(doc, y, 14);

    // Score label (right-aligned)
    const pts = q.puntaje ?? 0;
    const parcialSuffix = q.calificacionParcial === true ? " (parcial)" : "";
    const scoreStr = `${pts % 1 === 0 ? pts : pts.toFixed(1)} ${pts === 1 ? "pto" : "pts"}${parcialSuffix}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_60);
    const sw = doc.getTextWidth(scoreStr);
    doc.text(scoreStr, PAGE_W - MARGIN - sw, y);

    // Question number badge (rounded rect filled blue)
    const bW = 7;
    const bH = 6.5;
    doc.setFillColor(...BLUE);
    doc.roundedRect(MARGIN, y - bH + 1.5, bW, bH, 1.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    const numStr = String(i + 1);
    doc.text(numStr, MARGIN + (bW - doc.getTextWidth(numStr)) / 2, y - 0.2);

    // Enunciado
    const enuncW = CONTENT_W - sw - 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    const cleanEnunciado = stripHtml(q.enunciado ?? "");
    // Handle multi-line text (from paragraphs, list items, etc.)
    const paragraphs = cleanEnunciado.split("\n");
    for (const para of paragraphs) {
      if (!para.trim()) { y += 2; continue; }
      const paraLines = doc.splitTextToSize(para.trim(), enuncW);
      for (const line of paraLines) {
        y = checkBreak(doc, y, 5.8);
        doc.text(line, MARGIN + 10, y);
        y += 5.8;
      }
    }
    y += 2;

    // Manual grading note
    if (
      (q.type === "open" && (!q.keywords || q.keywords.length === 0) && !q.textoRespuesta) ||
      q.type === "file_upload"
    ) {
      y = checkBreak(doc, y, 5);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_60);
      doc.text(
        q.type === "file_upload"
          ? "El estudiante debe subir un archivo desde la plataforma. Calificacion manual por el profesor"
          : "Calificacion manual por el profesor",
        MARGIN + 10,
        y,
      );
      y += 5.5;
    }

    // Question image
    if (q.nombreImagen) {
      const img = await loadImage(q.nombreImagen);
      if (img) {
        const PX_TO_MM = 0.264583;
        const maxW = CONTENT_W * 0.65;
        const maxH = 60;
        let imgW = img.width * PX_TO_MM;
        let imgH = img.height * PX_TO_MM;
        if (imgW > maxW) { imgH *= maxW / imgW; imgW = maxW; }
        if (imgH > maxH) { imgW *= maxH / imgH; imgH = maxH; }
        const imgX = MARGIN + (CONTENT_W - imgW) / 2;
        y = checkBreak(doc, y, imgH + 6);
        // Light bg behind image
        doc.setFillColor(...GRAY_90);
        doc.setDrawColor(...GRAY_80);
        doc.setLineWidth(0.3);
        doc.rect(imgX - 2, y - 2, imgW + 4, imgH + 4, "FD");
        doc.addImage(img.base64, img.format, imgX, y, imgW, imgH);
        y += imgH + 7;
      }
    }

    // Answer / options block
    switch (q.type) {
      case "test":        y = renderTest(doc, q, y, incluirRespuestas);       break;
      case "open":        y = renderOpen(doc, q, y, incluirRespuestas);       break;
      case "fill_blanks": y = renderFillBlanks(doc, q, y, incluirRespuestas); break;
      case "match":       y = renderMatch(doc, q, y, incluirRespuestas);      break;
    }

    y += 5;

    // Thin divider between questions
    if (i < questions.length - 1) {
      y = checkBreak(doc, y, 5);
      doc.setDrawColor(...GRAY_80);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 9;
    }
  }

  stampFooters(doc, exam.nombre ?? "Examen");

  const safe = (exam.nombre ?? "examen").replace(/[/\\?%*:|"<>]/g, "-");
  const suffix = incluirRespuestas ? " (respuestas)" : "";
  doc.save(`${safe}${suffix}.pdf`);
}
