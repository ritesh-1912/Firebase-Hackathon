import React, { useState } from 'react';
import { parseUploadedFile, type ParsedDocument } from '../services/documentParser';
import {
  Plus,
  FileText,
  ShieldCheck,
  Trash2,
  FileCode,
  Image as ImageIcon,
  Loader2,
  FolderArchive,
  Upload,
  Sparkles,
  ArrowRight,
  Lock,
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
  savedWorkspacesCount: number;
  onOpenSavedWorkspaces: () => void;
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
  savedWorkspacesCount,
  onOpenSavedWorkspaces,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    setIngestionError(null);

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
        setIngestionError(
          `Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }
    setParsing(false);
  };

  const hasPendingDocs = documents.some((d) => !d.status.redactedLocally || !d.status.graphIndexed);

  return (
    <aside
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragging(false);
        await handleFiles(e.dataTransfer.files);
      }}
      className={`h-full w-full lg:w-[260px] shrink-0 bg-[#111114] border-r border-white/[0.08] flex flex-col transition duration-150 ${
        isDragging ? 'ring-1 ring-inset ring-indigo-500/60 bg-indigo-500/[0.04]' : ''
      }`}
    >
      {/* Slim Sidebar Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
        <span className="text-xs font-semibold tracking-tight text-[#F4F4F5]">Sources</span>
        <span className="text-[11px] font-mono tabular-nums text-[#A1A1AA]">
          {documents.length}
        </span>
      </div>

      {/* Compact + Add Sources Dropzone Button */}
      <div className="p-3 border-b border-white/[0.08] space-y-2">
        <label className="w-full h-9 px-3 rounded-lg bg-[#18181B] hover:bg-white/[0.06] border border-white/[0.08] flex items-center justify-center gap-2 text-xs font-medium text-[#F4F4F5] transition duration-150 cursor-pointer">
          {parsing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>Parsing...</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 text-[#A1A1AA]" />
              <span>Add Sources</span>
            </>
          )}
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </label>

        {ingestionError && (
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-start justify-between gap-2">
            <span className="leading-snug">{ingestionError}</span>
            <button
              type="button"
              onClick={() => setIngestionError(null)}
              className="text-rose-300 hover:text-white shrink-0 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Clean Document List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {documents.length === 0 ? (
          <div className="px-3 py-8 text-center space-y-3">
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              No sources loaded. Drop files here or launch the sample case study.
            </p>
            <button
              type="button"
              onClick={onLoadSampleInvestigation}
              className="w-full py-2 px-3 rounded-lg bg-[#18181B] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-medium text-[#F4F4F5] transition duration-150 cursor-pointer"
            >
              Load Sample Investigation
            </button>
          </div>
        ) : (
          documents.map((doc) => {
            const isSelected = activeDocumentId === doc.id;
            const isProcessed = doc.status.redactedLocally && doc.status.graphIndexed;

            return (
              <div
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className={`group px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-[#18181B] border border-white/[0.08] text-[#F4F4F5]'
                    : 'border border-transparent text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {doc.fileType === 'pdf' ? (
                    <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : doc.fileType === 'image' ? (
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  )}

                  <div className="min-w-0">
                    <div className="text-[12px] font-medium truncate leading-tight">
                      {doc.name}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-[#A1A1AA]">
                      {(doc.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDocument(doc.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[#A1A1AA] hover:text-rose-400 p-0.5 transition duration-150 cursor-pointer"
                    title="Remove source"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  {processingVault ? (
                    <Loader2
                      className="w-3.5 h-3.5 animate-spin text-indigo-400"
                      aria-label="Processing"
                    />
                  ) : isProcessed ? (
                    <span title="Redacted locally & graph indexed">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    </span>
                  ) : (
                    <span title="Pending local processing">
                      <Lock className="w-3 h-3 text-[#A1A1AA]/60" />
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer: Process Action + Saved Investigations */}
      <div className="p-3 border-t border-white/[0.08] space-y-2">
        {documents.length > 0 && (
          <button
            type="button"
            onClick={onProcessVault}
            disabled={processingVault}
            className={`w-full h-9 px-3 rounded-lg text-xs font-medium transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
              hasPendingDocs
                ? 'bg-[#F4F4F5] hover:bg-white text-[#09090B]'
                : 'bg-[#18181B] hover:bg-white/[0.06] text-[#F4F4F5] border border-white/[0.08]'
            }`}
          >
            {processingVault ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing Vault...</span>
              </>
            ) : (
              <span>{hasPendingDocs ? 'Process Vault' : 'Re-process Vault'}</span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSavedWorkspaces}
          className="w-full h-8 px-2.5 rounded-lg text-[11px] text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.03] transition duration-150 flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <FolderArchive className="w-3.5 h-3.5" />
            <span>Saved Vaults</span>
          </span>
          <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded bg-[#18181B] border border-white/[0.06]">
            {savedWorkspacesCount}
          </span>
        </button>
      </div>
    </aside>
  );
};

interface EmptyOnboardingCanvasProps {
  onLoadSampleInvestigation: () => void;
  onUploadDocument: (doc: SourceDocument) => void;
}

export const EmptyOnboardingCanvas: React.FC<EmptyOnboardingCanvasProps> = ({
  onLoadSampleInvestigation,
  onUploadDocument,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    setError(null);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsed = await parseUploadedFile(file);
        onUploadDocument({
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
        });
      } catch (err) {
        setError(`Could not parse ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setParsing(false);
  };

  return (
    <div className="flex-1 h-full bg-[#09090B] flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111114] border border-white/[0.08] text-[11px] text-[#A1A1AA]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local-First Hybrid AI Studio</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F4F4F5]">
            Private knowledge graphs without raw cloud egress
          </h1>
          <p className="text-sm text-[#A1A1AA] max-w-xl mx-auto leading-relaxed">
            SynapseVault redacts PII on-device, indexes entities into an interactive canvas, and
            escalates only sanitized topology for cross-document synthesis.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Primary CTA Card: 1-Click Judge Demo */}
          <button
            type="button"
            onClick={onLoadSampleInvestigation}
            className="group text-left p-6 rounded-xl bg-[#111114] hover:bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] transition duration-150 flex flex-col justify-between space-y-5 cursor-pointer"
          >
            <div className="space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight text-[#F4F4F5]">
                Load Sample Investigation
              </h2>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                Project Helios Thermal Incident — 3 docs with embedded PII and a hidden technical
                contradiction.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F4F4F5] group-hover:translate-x-0.5 transition duration-150">
              <span>Run 1-click investigation</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#A1A1AA]" />
            </div>
          </button>

          {/* Secondary CTA Card: Drag & Drop Upload */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDragging(false);
              await handleFiles(e.dataTransfer.files);
            }}
            className={`p-6 rounded-xl border border-dashed transition duration-150 flex flex-col justify-between space-y-5 cursor-pointer ${
              isDragging
                ? 'bg-indigo-500/[0.06] border-indigo-400/60'
                : 'bg-[#111114] hover:bg-[#18181B] border-white/[0.14] hover:border-white/[0.24]'
            }`}
          >
            <div className="space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#18181B] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA]">
                {parsing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
              </div>
              <h2 className="text-sm font-semibold tracking-tight text-[#F4F4F5]">
                {parsing ? 'Parsing local files...' : 'Drop PDF, Markdown, or Images'}
              </h2>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                Client-side parsing via pdfjs-dist and FileReader. Supports PDF, TXT, MD, JPEG, and
                PNG.
              </p>
            </div>
            <span className="text-xs font-medium text-[#A1A1AA]">
              Browse files on your device
            </span>
            <input
              type="file"
              multiple
              accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
