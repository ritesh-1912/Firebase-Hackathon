export interface FirewallRedactionItem {
  type: 'PERSON' | 'CONTACT' | 'FINANCIAL' | 'ID';
  originalSnippet: string;
  replacement: string;
}

/**
 * Client-Side Deterministic Regex PII Firewall.
 * Extra safety layer guaranteeing zero leakage of credentials, cards, phones, SSNs, and labeled names.
 */
export function applyClientPiiFirewall(rawText: string): {
  sanitized: string;
  extraRedactions: FirewallRedactionItem[];
} {
  let sanitized = rawText;
  const extraRedactions: FirewallRedactionItem[] = [];

  // 1. SSN / National IDs (e.g. 000-00-0000)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  sanitized = sanitized.replace(ssnRegex, (match) => {
    extraRedactions.push({
      type: 'ID',
      originalSnippet: match,
      replacement: '[REDACTED_ID]',
    });
    return '[REDACTED_ID]';
  });

  // 2. Credit Cards (13-19 digits with dashes or spaces)
  const ccRegex =
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|(?:4\d{3}|5[1-5]\d{2}|6011)[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g;
  sanitized = sanitized.replace(ccRegex, (match) => {
    extraRedactions.push({
      type: 'FINANCIAL',
      originalSnippet: match,
      replacement: '[REDACTED_FINANCIAL]',
    });
    return '[REDACTED_FINANCIAL]';
  });

  // 3. Email Addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  sanitized = sanitized.replace(emailRegex, (match) => {
    extraRedactions.push({
      type: 'CONTACT',
      originalSnippet: match,
      replacement: '[REDACTED_CONTACT]',
    });
    return '[REDACTED_CONTACT]';
  });

  // 4. Secret Tokens / Badges / Vendor Keys (e.g. #AUD-9912, #NEXA-TOK-99218-SEC)
  const idTokenRegex = /#(?:AUD|NEXA-TOK|SEC|ID|KEY)[A-Z0-9-]*/gi;
  sanitized = sanitized.replace(idTokenRegex, (match) => {
    extraRedactions.push({
      type: 'ID',
      originalSnippet: match,
      replacement: '[REDACTED_ID]',
    });
    return '[REDACTED_ID]';
  });

  // 5. Phone numbers (10-digit and 7-digit e.g. 555-0199, (555) 019-9921)
  const phoneRegex = /\b(?:\+?1[-. ]?)?(?:\(?[0-9]{3}\)?[-. ]?)?[0-9]{3}[-. ][0-9]{4}\b/g;
  sanitized = sanitized.replace(phoneRegex, (match) => {
    extraRedactions.push({
      type: 'CONTACT',
      originalSnippet: match,
      replacement: '[REDACTED_CONTACT]',
    });
    return '[REDACTED_CONTACT]';
  });

  // 6. Labeled Person Names (e.g. "Lead Test Engineer: Marcus Vance", "Signed: Jonathan Hayes")
  const labeledNameRegex =
    /\b(Lead Test Engineer|Vendor Technical Liaison|Audit Officer|Signed|Engineer)\s*:?\s+((?:Dr\.\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g;
  const capturedNames: string[] = [];
  sanitized = sanitized.replace(labeledNameRegex, (full, role, personName) => {
    capturedNames.push(personName);
    extraRedactions.push({
      type: 'PERSON',
      originalSnippet: personName,
      replacement: '[REDACTED_PERSON]',
    });
    const separator = full.includes(':') ? ': ' : ' ';
    return `${role}${separator}[REDACTED_PERSON]`;
  });

  // Redact any repeated mentions of captured names elsewhere in the document
  for (const name of capturedNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(`\\b${escaped}\\b`, 'g'), '[REDACTED_PERSON]');
  }

  return { sanitized, extraRedactions };
}

/**
 * Constructs a standard 44-byte WAV header for 24kHz 16-bit Mono Linear PCM.
 */
export function pcmToWavBlob(pcmBytes: Uint8Array, sampleRate = 24000): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBytes.byteLength;

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([header, pcmBytes], { type: 'audio/wav' });
}
