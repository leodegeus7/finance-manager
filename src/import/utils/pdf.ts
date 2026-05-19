import * as pdfjs from 'pdfjs-dist'

// Use the bundled worker via Vite asset URL
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/**
 * Extracts text from a PDF ArrayBuffer.
 * Groups items by Y position to reconstruct lines (similar to pdfplumber).
 * Returns one string per page, joined by newline.
 */
export async function extractPDFText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
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
