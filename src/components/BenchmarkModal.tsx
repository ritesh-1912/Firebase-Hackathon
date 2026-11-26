import React, { useState } from 'react';
import {
  runSideBySideBenchmark,
  type BenchmarkSideBySideResult,
} from '../services/hybridAI';
import {
  X,
  Zap,
  Cpu,
  Cloud,
  Loader2,
  ShieldCheck,
  WifiOff,
  DollarSign,
} from 'lucide-react';

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
- Battery Management IC #BMIC-891 failed to throttle bus voltage or execute automated contactor disconnect.
- Engineer Marcus Vance manually initiated emergency nitrogen quench protocol at 14:25 UTC.
- Hardware status: Pack #4B core module sustained severe thermal blistering. Immediate forensic teardown required.`;

export const BenchmarkModal: React.FC<BenchmarkModalProps> = ({
  isOpen,
  onClose,
  activeDocumentText,
  isOnline,
}) => {
  const [inputText, setInputText] = useState<string>(activeDocumentText || DEFAULT_BENCHMARK_SAMPLE);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<BenchmarkSideBySideResult | null>(null);

  if (!isOpen) return null;

  const handleRunBenchmark = async () => {
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

  const payloadSize = new Blob([inputText]).size;

  const speedDeltaText = (() => {
    if (!result) return null;
    if (result.local.success && result.cloud.success && result.local.latencyMs > 0) {
      if (result.local.latencyMs < result.cloud.latencyMs) {
        return `${(result.cloud.latencyMs / result.local.latencyMs).toFixed(1)}x Faster`;
      }
      return `${result.local.latencyMs}ms Local`;
    }
    if (result.cloud.success) return `${result.cloud.latencyMs}ms Cloud`;
    return 'Offline / Fallback';
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111114] border border-white/[0.08] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-[#F4F4F5]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold tracking-tight text-[#F4F4F5]">
              Hybrid Inference Benchmark
            </h2>
            <p className="text-xs text-[#A1A1AA]">
              Side-by-side comparison of on-device Gemini Nano vs. cloud Gemini 3.8 Flash.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181B] transition duration-150 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Payload Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#A1A1AA]">Test Payload</span>
              <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#A1A1AA]">
                <span>{payloadSize} B</span>
                {activeDocumentText && (
                  <button
                    type="button"
                    onClick={() => setInputText(activeDocumentText)}
                    className="text-indigo-400 hover:text-indigo-300 font-sans cursor-pointer"
                  >
                    Use active doc
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInputText(DEFAULT_BENCHMARK_SAMPLE)}
                  className="hover:text-[#F4F4F5] font-sans cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={3}
              className="w-full bg-[#09090B] border border-white/[0.08] rounded-lg p-3 text-xs font-mono text-[#F4F4F5]/90 focus:outline-none focus:border-white/[0.2] transition duration-150 resize-none"
            />
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleRunBenchmark}
              disabled={isRunning || !inputText.trim()}
              className="h-9 px-4 rounded-lg bg-[#F4F4F5] hover:bg-white text-[#09090B] text-xs font-medium inline-flex items-center gap-2 transition duration-150 cursor-pointer disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Running Benchmark...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Run Side-by-Side Benchmark</span>
                </>
              )}
            </button>
          </div>

          {/* Results Delta Callouts + Crisp Table */}
          {result && (
            <div className="space-y-4">
              {/* Visual Delta Callout Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#18181B] border border-white/[0.08] rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Latency Delta</span>
                  </div>
                  <div className="text-base font-mono tabular-nums font-semibold text-[#F4F4F5]">
                    {speedDeltaText}
                  </div>
                </div>

                <div className="bg-[#18181B] border border-white/[0.08] rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
                    <WifiOff className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Local Network Traffic</span>
                  </div>
                  <div className="text-base font-mono tabular-nums font-semibold text-emerald-400">
                    0 B Network Egress
                  </div>
                </div>

                <div className="bg-[#18181B] border border-white/[0.08] rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Local Token Spend</span>
                  </div>
                  <div className="text-base font-mono tabular-nums font-semibold text-[#F4F4F5]">
                    $0.00 Local Cost
                  </div>
                </div>
              </div>

              {/* Minimal Comparison Table */}
              <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#09090B]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-[#18181B]/70 text-[11px] text-[#A1A1AA]">
                      <th className="py-2.5 px-4 font-medium">Metric</th>
                      <th className="py-2.5 px-4 font-medium text-emerald-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>On-Device (Gemini Nano)</span>
                        </span>
                      </th>
                      <th className="py-2.5 px-4 font-medium text-indigo-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Cloud className="w-3.5 h-3.5" />
                          <span>Cloud (Gemini 3.8 Flash)</span>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono tabular-nums text-[11px]">
                    <tr>
                      <td className="py-2.5 px-4 font-sans text-[#A1A1AA]">Latency</td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        {result.local.success
                          ? `${result.local.latencyMs} ms`
                          : result.local.error || 'Unavailable'}
                      </td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        {result.cloud.success
                          ? `${result.cloud.latencyMs} ms`
                          : result.cloud.error || 'Offline'}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-2.5 px-4 font-sans text-[#A1A1AA]">Network Bytes Sent</td>
                      <td className="py-2.5 px-4 text-emerald-400">0 B</td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        {result.cloud.networkBytesSent} B
                      </td>
                    </tr>

                    <tr>
                      <td className="py-2.5 px-4 font-sans text-[#A1A1AA]">Privacy Exposure</td>
                      <td className="py-2.5 px-4 text-emerald-400 font-sans">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Zero (On-Device)</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[#A1A1AA] font-sans">
                        {result.cloud.privacyExposure}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-2.5 px-4 font-sans text-[#A1A1AA]">Estimated Cost</td>
                      <td className="py-2.5 px-4 text-emerald-400">$0.000000</td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        ${result.cloud.estimatedCostUsd.toFixed(6)}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-2.5 px-4 font-sans text-[#A1A1AA]">Extracted Topology</td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        {result.local.nodesExtracted} nodes · {result.local.edgesExtracted} edges
                      </td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        {result.cloud.nodesExtracted} nodes · {result.cloud.edgesExtracted} edges
                      </td>
                    </tr>

                    <tr>
                      <td className="py-2.5 px-4 font-sans text-[#A1A1AA]">PII Tokens Blocked</td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        {result.local.redactionsCount}
                      </td>
                      <td className="py-2.5 px-4 text-[#F4F4F5]">
                        {result.cloud.redactionsCount}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
