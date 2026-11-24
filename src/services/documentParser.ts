import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker in browser environment
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

export interface DocumentChunk {
  pageNumber: number;
  text: string;
}

export interface ParsedDocument {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'markdown' | 'text' | 'image';
  mimeType: string;
  sizeBytes: number;
  fullText: string;
  chunks: DocumentChunk[];
  imageFile?: File;
  imageDataUrl?: string;
  timestamp: number;
}

/**
 * Extracts page-indexed text chunks from a PDF file using pdfjs-dist.
 * Hardened with internal try-catch and stream recovery to handle corrupt or encrypted PDFs gracefully.
 */
export async function parsePdfFile(file: File): Promise<ParsedDocument> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const chunks: DocumentChunk[] = [];
    const textAccumulator: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (pageText) {
          chunks.push({ pageNumber: pageNum, text: pageText });
          textAccumulator.push(`[Page ${pageNum}]\n${pageText}`);
        }
      } catch (pageErr) {
        console.warn(`[PDF Parser] Error reading page ${pageNum}:`, pageErr);
        chunks.push({ pageNumber: pageNum, text: `[Page ${pageNum}: Unreadable or encrypted stream]` });
      }
    }

    const fullText =
      textAccumulator.join('\n\n') ||
      `[Notice: PDF ${file.name} contains no extractable text streams]`;

    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      fileType: 'pdf',
      mimeType: file.type || 'application/pdf',
      sizeBytes: file.size,
      fullText,
      chunks: chunks.length > 0 ? chunks : [{ pageNumber: 1, text: fullText }],
      timestamp: Date.now(),
    };
  } catch (pdfErr) {
    console.warn('[PDF Parser Guard] Malformed or encrypted PDF encountered:', pdfErr);

    // Fallback recovery: attempt raw text stream decoding
    let rawFallbackText = '';
    try {
      const rawBuffer = await file.arrayBuffer();
      const textDecoder = new TextDecoder('utf-8', { fatal: false });
      const decoded = textDecoder.decode(rawBuffer);
      const printableMatches = decoded.match(/[\x20-\x7E\r\n]{4,}/g);
      if (printableMatches && printableMatches.length > 0) {
        rawFallbackText = printableMatches.join('\n');
      }
    } catch {
      rawFallbackText = '';
    }

    const fallbackNotice =
      `[PDF Recovery Notice: ${file.name} was malformed or protected. Recovered plain-text stream below]:\n\n` +
      (rawFallbackText ? rawFallbackText.slice(0, 3000) : 'No readable ASCII text streams could be salvaged.');

    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      fileType: 'pdf',
      mimeType: file.type || 'application/pdf',
      sizeBytes: file.size,
      fullText: fallbackNotice,
      chunks: [{ pageNumber: 1, text: fallbackNotice }],
      timestamp: Date.now(),
    };
  }
}

/**
 * Parses plain text or Markdown files with error safety
 */
export async function parseTextOrMarkdownFile(file: File): Promise<ParsedDocument> {
  try {
    const fullText = await file.text();
    const fileType = file.name.endsWith('.md') ? 'markdown' : 'text';

    // Split into logical sections or paragraphs as chunks
    const paragraphs = fullText.split(/\n\n+/).filter((p) => p.trim().length > 0);
    const chunks: DocumentChunk[] = paragraphs.map((text, idx) => ({
      pageNumber: idx + 1,
      text: text.trim(),
    }));

    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      fileType,
      mimeType: file.type || 'text/plain',
      sizeBytes: file.size,
      fullText,
      chunks: chunks.length > 0 ? chunks : [{ pageNumber: 1, text: fullText }],
      timestamp: Date.now(),
    };
  } catch (err) {
    console.warn('[Text Parser Guard] Read error:', err);
    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      fileType: 'text',
      mimeType: 'text/plain',
      sizeBytes: file.size,
      fullText: `[Notice: File ${file.name} could not be read as text]`,
      chunks: [{ pageNumber: 1, text: `[Error reading text file]` }],
      timestamp: Date.now(),
    };
  }
}

/**
 * Prepares image files (JPEG/PNG/WebP) for multimodal Gemini Nano / Cloud inference
 */
export async function parseImageFile(file: File): Promise<ParsedDocument> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      fileType: 'image',
      mimeType: file.type || 'image/jpeg',
      sizeBytes: file.size,
      fullText: `[Multimodal Image: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`,
      chunks: [
        {
          pageNumber: 1,
          text: `[Image: ${file.name}]`,
        },
      ],
      imageFile: file,
      imageDataUrl: dataUrl,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.warn('[Image Parser Guard] Read error:', err);
    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      fileType: 'image',
      mimeType: file.type || 'image/jpeg',
      sizeBytes: file.size,
      fullText: `[Multimodal Image Read Failure: ${file.name}]`,
      chunks: [{ pageNumber: 1, text: `[Corrupt image data]` }],
      timestamp: Date.now(),
    };
  }
}

/**
 * Universal browser-native file ingestion pipeline with comprehensive error boundary protection
 */
export async function parseUploadedFile(file: File): Promise<ParsedDocument> {
  try {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();

    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      return await parsePdfFile(file);
    } else if (
      type.startsWith('image/') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.webp')
    ) {
      return await parseImageFile(file);
    } else {
      // Markdown or text default
      return await parseTextOrMarkdownFile(file);
    }
  } catch (err) {
    console.error('[Document Parser Global Guard] Unhandled ingestion error intercepted:', err);
    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      fileType: 'text',
      mimeType: file.type || 'text/plain',
      sizeBytes: file.size,
      fullText: `[Ingestion Guard: File ${file.name} could not be parsed: ${(err as Error).message}]`,
      chunks: [{ pageNumber: 1, text: `[Parse failed]` }],
      timestamp: Date.now(),
    };
  }
}
