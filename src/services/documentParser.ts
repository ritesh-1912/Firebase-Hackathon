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
 * Extracts page-indexed text chunks from a PDF file using pdfjs-dist
 */
export async function parsePdfFile(file: File): Promise<ParsedDocument> {
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
  }

  const fullText = textAccumulator.join('\n\n');

  return {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileType: 'pdf',
    mimeType: file.type || 'application/pdf',
    sizeBytes: file.size,
    fullText,
    chunks,
    timestamp: Date.now(),
  };
}

/**
 * Parses plain text or Markdown files
 */
export async function parseTextOrMarkdownFile(file: File): Promise<ParsedDocument> {
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
}

/**
 * Prepares image files (JPEG/PNG/WebP) for multimodal Gemini Nano / Cloud inference
 */
export async function parseImageFile(file: File): Promise<ParsedDocument> {
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
}

/**
 * Universal browser-native file ingestion pipeline
 */
export async function parseUploadedFile(file: File): Promise<ParsedDocument> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return parsePdfFile(file);
  } else if (
    type.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp')
  ) {
    return parseImageFile(file);
  } else {
    // Markdown or text default
    return parseTextOrMarkdownFile(file);
  }
}
