/**
 * Client-side PDF validation utilities.
 *
 * Provides quick checks (magic bytes, MIME type, file size) before
 * handing a file to the viewer or pdf.js fallback. These run entirely
 * in the browser — no server round-trip required.
 *
 * @public
 */

/** Result of a PDF validation check. */
export interface PdfValidationResult {
  /** Whether the file passed all checks. */
  valid: boolean;
  /** Human-readable error message when `valid` is false. */
  error?: string;
}

/** Default maximum file size: 50 MB. */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/** PDF magic bytes: `%PDF-` (hex 25 50 44 46 2D). */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

/**
 * Validate a `File` object before loading it into the viewer.
 *
 * Checks (in order):
 * 1. MIME type is `application/pdf` (or empty — some browsers don't
 *    populate it for drag-dropped files).
 * 2. First 5 bytes match the PDF magic signature `%PDF-`.
 * 3. File size is within the allowed limit.
 *
 * @param file - The `File` to validate.
 * @param maxBytes - Maximum allowed size in bytes. Default: 50 MB.
 * @returns A promise resolving to the validation result.
 *
 * @public
 */
export async function validatePdfFile(
  file: File,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<PdfValidationResult> {
  // MIME check (allow empty — some browsers omit MIME for drag-drop)
  if (file.type && file.type !== "application/pdf") {
    return { valid: false, error: "File is not a PDF. Expected MIME type application/pdf." };
  }

  // Size check
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return { valid: false, error: `File is too large. Maximum size is ${maxMb} MB.` };
  }

  // Magic bytes check
  try {
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (header.length < 5 || !PDF_MAGIC.every((b, i) => header[i] === b)) {
      return {
        valid: false,
        error: "File does not appear to be a valid PDF (missing %PDF- header).",
      };
    }
  } catch {
    return { valid: false, error: "Could not read file header." };
  }

  return { valid: true };
}

/**
 * Validate a PDF URL string before loading it into the viewer.
 *
 * This is a **synchronous** surface-level check — it validates URL
 * format only. It does not fetch the URL or inspect response headers.
 *
 * @param url - The URL string to validate.
 * @returns The validation result.
 *
 * @public
 */
export function validatePdfUrl(url: string): PdfValidationResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: "URL is empty." };
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:", "blob:"].includes(parsed.protocol)) {
      return { valid: false, error: "URL must use http://, https://, or blob: protocol." };
    }
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }

  return { valid: true };
}
