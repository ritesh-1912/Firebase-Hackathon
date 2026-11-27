import React, { useState } from 'react';
import { parseUploadedFile, type ParsedDocument } from '../services/documentParser';
import { Plus, Loader2, X } from 'lucide-react';

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
        console.error('[SourceVault] Upload error:', err);
        setIngestionError(
          `Could not parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
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
      className={`h-full w-[240px] shrink-0 bg-[#F3F3EF] border-r border-[#E6E6E2] flex flex-col transition duration-150 ${
        isDragging ? 'bg-[#EBEBE5]' : ''
      }`}
    >
      {/* Sidebar Header */}
      <div className="px-4 py-3 border-b border-[#E6E6E2] flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#63635E]">Sources</span>
        {documents.length > 0 && (
          <span className="text-[12px] font-mono tabular-nums text-[#94948E]">
            {documents.length}
          </span>
        )}
      </div>

      {/* Clean Vertical List of Files */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {documents.length === 0 ? (
          <div className="px-2 py-6 space-y-3 text-[13px] text-[#63635E]">
            <p className="leading-relaxed">No documents staged.</p>
            <button
              type="button"
              onClick={onLoadSampleInvestigation}
              className="text-[12px] font-medium text-[#141413] underline underline-offset-4 hover:text-[#2B2B29] cursor-pointer"
            >
              Load sample case study
            </button>
          </div>
        ) : (
          documents.map((doc) => {
            const isSelected = activeDocumentId === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className={`group px-2.5 py-2 rounded-md flex items-center justify-between gap-2 transition duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-[#FFFFFF] text-[#141413] border border-[#E6E6E2]'
                    : 'border border-transparent text-[#63635E] hover:text-[#141413] hover:bg-[#E6E6E2]/50'
                }`}
              >
                <span className="text-[13px] font-medium truncate leading-snug">{doc.name}</span>

                <div className="flex items-center gap-1 shrink-0">
                  {processingVault && (
                    <Loader2
                      className="w-3.5 h-3.5 animate-spin text-[#63635E]"
                      aria-label="Processing"
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDocument(doc.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[#94948E] hover:text-[#B91C1C] p-0.5 transition duration-150 cursor-pointer"
                    title="Remove document"
                    aria-label={`Remove ${doc.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {ingestionError && (
          <div className="mt-2 px-2.5 py-2 text-[12px] text-[#B91C1C] border-l-2 border-[#B91C1C] bg-[#FFFFFF]">
            {ingestionError}
          </div>
        )}
      </div>

      {/* Bottom Controls: Process when pending + Add documents dropzone + Saved vaults */}
      <div className="p-3 border-t border-[#E6E6E2] space-y-2">
        {documents.length > 0 && hasPendingDocs && (
          <button
            type="button"
            onClick={onProcessVault}
            disabled={processingVault}
            className="w-full h-8 px-3 rounded-md bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] text-[13px] font-medium transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {processingVault ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Extract &amp; redact</span>
            )}
          </button>
        )}

        <label className="w-full h-8 px-3 rounded-md border border-[#E6E6E2] hover:border-[#CFCFC9] bg-[#FFFFFF] flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#141413] transition duration-150 cursor-pointer">
          {parsing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#63635E]" />
              <span>Parsing...</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 text-[#63635E]" />
              <span>Add documents</span>
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

        {savedWorkspacesCount > 0 && (
          <button
            type="button"
            onClick={onOpenSavedWorkspaces}
            className="w-full py-1 text-[12px] text-[#63635E] hover:text-[#141413] text-center transition duration-150 cursor-pointer"
          >
            Saved vaults ({savedWorkspacesCount})
          </button>
        )}
      </div>
    </aside>
  );
};
