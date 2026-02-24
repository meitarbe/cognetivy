import fs from "node:fs/promises";
import { PNG } from "pngjs";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface TerminalPngRenderOptions {
  /**
   * Output width in terminal characters.
   * Each character represents one pixel horizontally.
   */
  widthChars: number;
  /**
   * Alpha threshold (0-255) below which pixels are treated as transparent.
   */
  transparentAlphaThreshold?: number;
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value | 0;
}

function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value | 0;
}

function rgbFromRgba(data: Uint8Array, idx: number): { rgb: Rgb; a: number } {
  return {
    rgb: { r: data[idx] ?? 0, g: data[idx + 1] ?? 0, b: data[idx + 2] ?? 0 },
    a: data[idx + 3] ?? 0,
  };
}

function fg(rgb: Rgb): string {
  return `\u001b[38;2;${clampByte(rgb.r)};${clampByte(rgb.g)};${clampByte(rgb.b)}m`;
}

function bg(rgb: Rgb): string {
  return `\u001b[48;2;${clampByte(rgb.r)};${clampByte(rgb.g)};${clampByte(rgb.b)}m`;
}

const RESET = "\u001b[0m";

function samplePixel(png: PNG, x: number, y: number): { rgb: Rgb; a: number } {
  const clampedX = Math.max(0, Math.min(png.width - 1, x));
  const clampedY = Math.max(0, Math.min(png.height - 1, y));
  const idx = (clampedY * png.width + clampedX) * 4;
  return rgbFromRgba(png.data, idx);
}

function scaleCoord(srcSize: number, dstSize: number, dstCoord: number): number {
  if (dstSize <= 1) return 0;
  const t = dstCoord / (dstSize - 1);
  return Math.round(t * (srcSize - 1));
}

function choosePixelPerfectWidthChars(srcWidth: number, requested: number): number {
  const maxWidth = clampInt(Math.floor(requested), 4, 64);
  if (srcWidth <= 0) return maxWidth;

  // Prefer widths that evenly divide the source width (integer downscale), closest to requested.
  const upper = Math.min(maxWidth, srcWidth);
  for (let w = upper; w >= 4; w--) {
    if (srcWidth % w === 0) return w;
  }
  return clampInt(Math.min(srcWidth, maxWidth), 4, 64);
}

/**
 * Render a PNG into ANSI truecolor using half-block characters.
 * Best-effort: returns null if reading/parsing fails.
 */
export async function renderPngFileToAnsi(
  filePath: string,
  options: TerminalPngRenderOptions
): Promise<string | null> {
  const transparentAlphaThreshold = options.transparentAlphaThreshold ?? 16;
  try {
    const buf = await fs.readFile(filePath);
    const png = PNG.sync.read(buf);
    const widthChars = choosePixelPerfectWidthChars(png.width, options.widthChars);
    const heightPixels = Math.max(
      4,
      Math.min(128, Math.floor((png.height / png.width) * widthChars * 2))
    );
    const heightChars = Math.floor(heightPixels / 2);

    const lines: string[] = [];
    for (let yChar = 0; yChar < heightChars; yChar++) {
      const yUpper = scaleCoord(png.height, heightPixels, yChar * 2);
      const yLower = scaleCoord(png.height, heightPixels, yChar * 2 + 1);

      let line = "";
      for (let xChar = 0; xChar < widthChars; xChar++) {
        const x = scaleCoord(png.width, widthChars, xChar);
        const upper = samplePixel(png, x, yUpper);
        const lower = samplePixel(png, x, yLower);

        const upperVisible = upper.a >= transparentAlphaThreshold;
        const lowerVisible = lower.a >= transparentAlphaThreshold;

        if (!upperVisible && !lowerVisible) {
          line += " ";
          continue;
        }

        if (upperVisible && lowerVisible) {
          line += `${fg(upper.rgb)}${bg(lower.rgb)}▀`;
          continue;
        }

        if (upperVisible) {
          line += `${fg(upper.rgb)}▀`;
          continue;
        }

        // lowerVisible only
        line += `${fg(lower.rgb)}▄`;
      }
      lines.push(line + RESET);
    }

    return lines.join("\n");
  } catch {
    return null;
  }
}

