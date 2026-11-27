import React, { useState } from 'react';
import {
  runSideBySideBenchmark,
  type BenchmarkSideBySideResult,
} from '../services/hybridAI';
import { X, Loader2 } from 'lucide-react';

interface BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDocumentText?: string;
  isOnline: boolean;
}

const DEFAULT_BENCHMARK_SAMPLE = `Project Helios Battery Thermal Incident: Field Engineering Log #4B.
Lead Test Engineer: Marcus Vance (SSN: 000-88-2194, Email: mvance@helios-energy.internal, Cell: 555-0149).
Facility: Mesa Desert Proving Grounds, Battery Pack Bay 4.
Escrow Account Billing: JPMorgan Chase Card #4111-9012-3382-7714.

INCIDENT TELEMETRY LOG:
- At 14:22 UTC, Pack #4B cell thermal telemetry spiked to 88°C under 3C rapid discharge stress testing.
- Internal pressure transducer logged 38.2 PSI immediately prior to emergency safety vent rupture.
- Battery Management IC #BMIC-891 failed to throttle bus voltage or execute automated contactor disconnect.`;

export const BenchmarkModal: React.FC<BenchmarkModalProps> = ({
  isOpen,
  onClose,
  activeDocumentText,
  isOnline,
}) => {
  const [inputText, setInputText] = useState<string>(
    activeDocumentText || DEFAULT_BENCHMARK_SAMPLE
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<BenchmarkSideBySideResult | null>(null);

  if (!isOpen) return null;

  const handleRunComparison = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const benchmarkData = await runSideBySideBenchmark(inputText, isOnline);
      setResult(benchmarkData);
    } catch (err) {
      console.error('[BenchmarkModal] Benchmark error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const payloadBytes = new Blob([inputText]).size;

  return (
    <div className="fixed inset-0 z-50 bg-[#141413]/30 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-[#FFFFFF] border border-[#E6E6E2] rounded-lg shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto text-[#141413]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E6E6E2] pb-4">
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-medium text-[#141413]">
              On-Device vs. Cloud Benchmark
            </h2>
            <p className="text-[13px] text-[#63635E]">
              Identical extraction prompt across Chrome Prompt API and Gemini 3.8 Flash.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94948E] hover:text-[#141413] p-1 transition duration-150 cursor-pointer"
            aria-label="Close benchmark modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Payload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-[#63635E]">
            <span>Sample input</span>
            <span className="font-mono tabular-nums">{payloadBytes} B</span>
          </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={4}
            className="w-full bg-[#FBFBF9] border border-[#E6E6E2] rounded-md p-3 text-[12px] font-mono text-[#141413] focus:outline-none focus:border-[#CFCFC9] resize-none"
          />
        </div>

        {/* Primary Action */}
        <div className="flex items-center justify-between gap-3">
          {activeDocumentText && (
            <button
              type="button"
              onClick={() => setInputText(activeDocumentText)}
              className="text-[12px] text-[#63635E] hover:text-[#141413] underline underline-offset-4 cursor-pointer"
            >
              Use active document
            </button>
          )}
          <button
            type="button"
            onClick={handleRunComparison}
            disabled={isRunning || !inputText.trim()}
            className="ml-auto h-9 px-4 rounded-md bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] text-[13px] font-medium inline-flex items-center gap-2 transition duration-150 cursor-pointer disabled:opacity-50"
          >
            {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isRunning ? 'Running comparison...' : 'Run comparison'}</span>
          </button>
        </div>

        {/* Crisp Border-Collapsed Typographic Table */}
        {result && (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#E6E6E2] text-left text-[12px] text-[#63635E]">
                <th className="py-2.5 pr-3 font-medium">Metric</th>
                <th className="py-2.5 px-3 font-medium text-[#166534]">On-Device</th>
                <th className="py-2.5 pl-3 font-medium text-[#1D4ED8]">Cloud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E6E2]">
              <tr>
                <td className="py-2.5 pr-3 text-[#63635E]">Latency (ms)</td>
                <td className="py-2.5 px-3 font-mono tabular-nums text-[#141413]">
                  {result.local.success
                    ? `${result.local.latencyMs} ms`
                    : result.local.error || 'Unavailable'}
                </td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-[#141413]">
                  {result.cloud.success
                    ? `${result.cloud.latencyMs} ms`
                    : result.cloud.error || 'Offline'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-[#63635E]">Network Egress</td>
                <td className="py-2.5 px-3 font-mono tabular-nums text-[#166534]">0 B</td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-[#141413]">
                  {result.cloud.networkBytesSent} B
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-[#63635E]">Privacy Exposure</td>
                <td className="py-2.5 px-3 text-[#166534]">None</td>
                <td className="py-2.5 pl-3 text-[#63635E]">{result.cloud.privacyExposure}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-[#63635E]">Cost</td>
                <td className="py-2.5 px-3 font-mono tabular-nums text-[#166534]">$0.000000</td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-[#141413]">
                  ${result.cloud.estimatedCostUsd.toFixed(6)}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 text-[#63635E]">Extracted Nodes</td>
                <td className="py-2.5 px-3 font-mono tabular-nums text-[#141413]">
                  {result.local.nodesExtracted}
                </td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-[#141413]">
                  {result.cloud.nodesExtracted}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
