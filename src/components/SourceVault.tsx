import React, { useState } from 'react';
import { parseUploadedFile, type ParsedDocument } from '../services/documentParser';
import {
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  Lock,
  Binary,
  Trash2,
  FileCode,
  Image as ImageIcon,
  Play,
  Layers,
} from 'lucide-react';

export interface SourceDocument {
  id: string;
  name: string;
  fileType: 'pdf' | 'text' | 'markdown' | 'image';
  sizeBytes: number;
  content: string;
  imageFile?: File;
  status: {
    parsed: boolean;
    redactedLocally: boolean;
    graphIndexed: boolean;
  };
  timestamp: number;
}

export const SAMPLE_HELIOS_CASE_STUDY: SourceDocument[] = [
  {
    id: 'doc_helios_1',
    name: 'Field_Log_Helios_Test_4B.txt',
    fileType: 'text',
    sizeBytes: 1240,
    content: `Project Helios Battery Thermal Incident: Field Engineering Log #4B.
Lead Test Engineer: Marcus Vance (SSN: 000-88-2194, Email: mvance@helios-energy.internal, Cell: 555-0149).
Facility: Mesa Desert Proving Grounds, Battery Pack Bay 4.
Escrow Account Billing: JPMorgan Chase Card #4111-9012-3382-7714.

INCIDENT TELEMETRY LOG:
- At 14:22 UTC, Pack #4B cell thermal telemetry spiked to 88°C under 3C rapid discharge stress testing.
- Internal pressure transducer logged 38.2 PSI immediately prior to emergency safety vent rupture.
- Battery Management IC #BMIC-891 failed to throttle bus voltage or execute automated contactor disconnect.
- Engineer Marcus Vance manually initiated emergency nitrogen quench protocol at 14:25 UTC.
- Hardware status: Pack #4B core module sustained severe thermal blistering. Immediate forensic teardown required.`,
    status: {
      parsed: true,
      redactedLocally: false,
      graphIndexed: false,
    },
    timestamp: Date.now() - 3600000,
  },
  {
    id: 'doc_helios_2',
    name: 'Vendor_Cell_SpecSheet_TitaniumIon.txt',
    fileType: 'text',
    sizeBytes: 890,
    content: `NexaCell UltraMax-21700 Lithium-Titanate Specification Sheet v3.1.
Vendor Technical Liaison: Dr. Elena Rostova (Phone: 555-0182, Email: erostova@nexacell.tech).
Corporate Vendor Token: Secret-Key #NEXA-TOK-99218-SEC.

OPERATING LIMITS & SAFETY RATINGS:
1. Maximum continuous operating thermal limit is strictly rated for 65°C.
2. CRITICAL CONSTRAINT: Any continuous thermal exposure exceeding 75°C invalidates manufacturer warranty and induces rapid polymer separator thermal decomposition.
3. Maximum permissible discharge rate is 2C. Discharging at 3C without active liquid chillers triggers exothermic cascade risk.
4. Thermal runaway threshold is rated at 92°C with toxic gas evolution.`,
    status: {
      parsed: true,
      redactedLocally: false,
      graphIndexed: false,
    },
    timestamp: Date.now() - 7200000,
  },
  {
    id: 'doc_helios_3',
    name: 'Quality_Audit_Memo_Firmware2.4.txt',
    fileType: 'text',
    sizeBytes: 940,
    content: `Quality Assurance Compliance Memo: Firmware Revision 2.4.0 Certification.
Audit Officer: Jonathan Hayes (Auditor Badge ID: #AUD-9912, Phone: 555-0199).
Internal Reference: QA-SIGNOFF-2026-Q4.

AUDIT SUMMARY & REGULATORY CERTIFICATION:
- Quality assurance certifies Battery Management IC #BMIC-891 firmware revision 2.4.0 operated with flawless automated throttle response at 60°C.
- [CONTRADICTION CLAIM]: Audit affirms zero thermal limit excursions above 65°C occurred during November 2026 stress validation cycles.
- Concludes Pack #4B battery pack architecture is 100% compliant with standard ISO-26262 automotive safety integrity level (ASIL-D).
- Authorization granted for mass production release. Signed: Jonathan Hayes.`,
    status: {
      parsed: true,
      redactedLocally: false,
      graphIndexed: false,
    },
    timestamp: Date.now() - 10800000,
  },
];

interface SourceVaultProps {
  documents: SourceDocument[];
  activeDocumentId: string | null;
  onSelectDocument: (doc: SourceDocument) => void;
  onLoadSampleInvestigation: () => void;
  onUploadDocument: (doc: SourceDocument) => void;
  onDeleteDocument: (docId: string) => void;
  onProcessVault: () => void;
  processingVault: boolean;
}

export const SourceVault: React.FC<SourceVaultProps> = ({
  documents,
  activeDocumentId,
  onSelectDocument,
  onLoadSampleInvestigation,
  onUploadDocument,
  onDeleteDocument,
  onProcessVault,
  processingVault,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsed: ParsedDocument = await parseUploadedFile(file);
        const newDoc: SourceDocument = {
          id: parsed.id,
          name: parsed.fileName,
          fileType: parsed.fileType,
          sizeBytes: parsed.sizeBytes,
          content: parsed.fullText,
          imageFile: parsed.imageFile,
          status: {
            parsed: true,
            redactedLocally: false,
            graphIndexed: false,
          },
          timestamp: Date.now(),
        };
        onUploadDocument(newDoc);
      } catch (err) {
        console.error('[SourceVault] Upload error:', err);
      }
    }
    setParsing(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 border-r border-slate-800/80 overflow-hidden">
      {/* Pane Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Source Vault ({documents.length})
          </h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500">Local-First</span>
      </div>

      {/* 1-Click Judge Demo CTA Banner */}
      <div className="p-3 bg-gradient-to-br from-indigo-950/60 to-slate-900 border-b border-indigo-500/20">
        <button
          type="button"
          onClick={onLoadSampleInvestigation}
          className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-md shadow-indigo-600/25 transition flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Load Sample Investigation</span>
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-1.5 leading-tight">
          Populates Project Helios multi-doc case study with embedded PII and technical contradictions.
        </p>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div className="p-3 border-b border-slate-800/80">
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`cursor-pointer border border-dashed rounded-xl p-3 flex flex-col items-center justify-center text-center space-y-1 transition ${
            isDragging
              ? 'border-cyan-400 bg-cyan-950/20'
              : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
          }`}
        >
          <Upload className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-300">
            {parsing ? 'Parsing Document...' : 'Drop PDF / TXT / MD / Image'}
          </span>
          <span className="text-[10px] text-slate-500">Client-side parsing via pdfjs-dist</span>
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </label>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {documents.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 space-y-2 text-xs">
            <FileText className="w-6 h-6 text-slate-600" />
            <p>Vault is empty.</p>
            <p className="text-[10px] text-slate-600 max-w-[180px]">
              Click "Load Sample Investigation" or drop documents to begin.
            </p>
          </div>
        ) : (
          documents.map((doc) => {
            const isSelected = activeDocumentId === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer space-y-2 ${
                  isSelected
                    ? 'border-cyan-500/60 bg-cyan-950/20 shadow-sm'
                    : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2 overflow-hidden">
                    {doc.fileType === 'pdf' ? (
                      <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : doc.fileType === 'image' ? (
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-200 truncate">{doc.name}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDocument(doc.id);
                    }}
                    className="text-slate-600 hover:text-rose-400 p-0.5 transition"
                    title="Remove from vault"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Processing Status Badges */}
                <div className="flex flex-wrap items-center gap-1 text-[9px]">
                  <span className="bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded border border-slate-700 font-mono">
                    {(doc.sizeBytes / 1024).toFixed(1)}KB
                  </span>

                  {doc.status.parsed && (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>Parsed</span>
                    </span>
                  )}

                  {doc.status.redactedLocally ? (
                    <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Redacted</span>
                    </span>
                  ) : (
                    <span className="bg-slate-800/80 text-slate-500 px-1.5 py-0.2 rounded">Raw PII</span>
                  )}

                  {doc.status.graphIndexed ? (
                    <span className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                      <Binary className="w-2.5 h-2.5" />
                      <span>Indexed</span>
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Process Vault CTA Footer */}
      {documents.length > 0 && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/60">
          <button
            type="button"
            onClick={onProcessVault}
            disabled={processingVault}
            className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            {processingVault ? (
              <span className="animate-pulse">Processing On-Device...</span>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Process Vault (Gemini Nano)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
