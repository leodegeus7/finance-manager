import * as pdfjs from 'pdfjs-dist'

// Use the bundled worker via Vite asset URL
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/**
 * Finds the actual start of the PDF content within a buffer.
 * Some banks (e.g. Inter) prepend large null-byte headers before %PDF.
 */
function findPDFStart(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer)
  // Search for the %PDF magic bytes
  for (let i = 0; i < Math.min(bytes.length - 4, 1_000_000); i++) {
    if (bytes[i] === 0x25 && bytes[i+1] === 0x50 && bytes[i+2] === 0x44 && bytes[i+3] === 0x46) {
      return i === 0 ? buffer : buffer.slice(i)
    }
  }
  return buffer // not found — pass as-is and let pdfjs error
}

/**
 * Extracts text from a PDF ArrayBuffer.
 * Groups items by Y position to reconstruct lines (similar to pdfplumber).
 * Returns one string per page, joined by newline.
 */
export async function extractPDFText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: findPDFStart(buffer) }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Group text items by Y position to reconstruct lines
    const lineMap = new Map<number, string[]>()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = Math.round((item as { transform: number[] }).transform[5])
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push((item as { str: string }).str)
    }

    // Sort descending (PDF Y=0 is bottom of page)
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(' ').trim())
      .filter(Boolean)

    pages.push(lines.join('\n'))
  }

  return pages.join('\n')
}
