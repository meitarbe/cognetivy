import type { CollectionItem } from "@/api";
import { collectionItemToMarkdown } from "./collectionItemToMarkdown";

const PDF_CONTENT_STYLES = `
  .pdf-md-body { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.5; color: #1a1a1a; background: #ffffff; padding: 24px; max-width: 100%; }
  .pdf-md-body h1 { font-size: 1.5em; font-weight: 700; margin: 1em 0 0.5em; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.25em; }
  .pdf-md-body h2 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
  .pdf-md-body h3 { font-size: 1.1em; font-weight: 600; margin: 0.75em 0 0.35em; }
  .pdf-md-body p { margin: 0.5em 0; }
  .pdf-md-body ul, .pdf-md-body ol { margin: 0.5em 0; padding-left: 1.5em; }
  .pdf-md-body li { margin: 0.25em 0; }
  .pdf-md-body code { background: #f0f0f0; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
  .pdf-md-body pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 0.75em 0; font-size: 11px; }
  .pdf-md-body pre code { background: none; padding: 0; }
  .pdf-md-body blockquote { border-left: 4px solid #ddd; margin: 0.5em 0; padding-left: 1em; color: #555; }
  .pdf-md-body a { color: #0066cc; text-decoration: none; }
  .pdf-md-body strong { font-weight: 600; }
  .pdf-md-body em { font-style: italic; }
`;

const PDF_MARGIN_MM = 10;
const PDF_SCALE = 2;
const PDF_IMAGE_QUALITY = 0.95;
const PDF_IMAGE_TYPE = "jpeg" as const;

/**
 * Generate a PDF from collection item data with markdown rendered as styled HTML.
 * Uses html2canvas-oklch (supports oklch) + jsPDF so theme colors never cause parse errors.
 */
export async function downloadCollectionItemAsPdf(
  item: CollectionItem,
  kind: string,
  filename?: string
): Promise<void> {
  const [markedModule, html2canvasOklchModule, jsPDFModule] = await Promise.all([
    import("marked"),
    import("html2canvas-oklch"),
    import("jspdf"),
  ]);
  const parseMarkdown = ((markedModule as { marked?: (s: string) => string }).marked ?? (markedModule as { parse: (s: string) => string }).parse) as (s: string) => string;
  const html2canvas = (html2canvasOklchModule as { default: (el: HTMLElement, opt?: Record<string, unknown>) => Promise<HTMLCanvasElement> }).default;
  const JsPDF = (jsPDFModule as { default: new (opt?: object) => { addPage: () => void; addImage: (img: string, format: string, x: number, y: number, w: number, h: number) => void; save: (name: string) => void; internal: { pageSize: { getWidth: () => number; getHeight: () => number } } } }).default;

  const markdown = collectionItemToMarkdown(item, kind);
  const html = parseMarkdown(markdown);

  const wrapper = document.createElement("div");
  wrapper.setAttribute("style", "position:absolute;left:-9999px;top:0;width:210mm;background:#ffffff;color:#1a1a1a;margin:0;padding:0;border:0;");

  const style = document.createElement("style");
  style.textContent = PDF_CONTENT_STYLES;
  wrapper.appendChild(style);

  const content = document.createElement("div");
  content.className = "pdf-md-body";
  content.innerHTML = html;
  wrapper.appendChild(content);

  document.body.appendChild(wrapper);

  const safeName = (filename ?? `${kind}-item`).replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const canvas = await html2canvas(wrapper, {
      scale: PDF_SCALE,
      useCORS: true,
      logging: false,
    });

    const pdf = new JsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const innerW = pageW - PDF_MARGIN_MM * 2;
    const innerH = pageH - PDF_MARGIN_MM * 2;
    const ratio = innerH / innerW;

    const imgW = canvas.width;
    const imgH = canvas.height;
    const pxPageHeight = Math.floor(imgW * ratio);
    const nPages = Math.ceil(imgH / pxPageHeight);

    for (let page = 0; page < nPages; page++) {
      if (page > 0) pdf.addPage();

      const sy = page * pxPageHeight;
      const sh = page === nPages - 1 && imgH % pxPageHeight !== 0 ? imgH % pxPageHeight : pxPageHeight;
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = imgW;
      pageCanvas.height = sh;
      const ctx = pageCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, imgW, sh);
        ctx.drawImage(canvas, 0, sy, imgW, sh, 0, 0, imgW, sh);
      }

      const imgData = pageCanvas.toDataURL(`image/${PDF_IMAGE_TYPE}`, PDF_IMAGE_QUALITY);
      const drawH = (sh / imgW) * innerW;
      pdf.addImage(imgData, PDF_IMAGE_TYPE, PDF_MARGIN_MM, PDF_MARGIN_MM, innerW, drawH);
    }

    pdf.save(`${safeName}.pdf`);
  } finally {
    if (wrapper.parentNode) document.body.removeChild(wrapper);
  }
}
