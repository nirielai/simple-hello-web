// Extracción de texto de PDFs en el navegador con pdfjs-dist
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore - worker URL
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function extraerTextoPdf(data: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      // @ts-ignore
      .map((it: any) => ("str" in it ? it.str : ""))
      .join(" ");
    texto += `\n\n--- Página ${i} ---\n${pageText}`;
    if (texto.length > 80000) break;
  }
  return texto.trim();
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
