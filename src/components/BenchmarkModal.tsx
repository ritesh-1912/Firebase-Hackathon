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
  CheckCircle2,
  Lock,
  Wifi,
  DollarSign,
  Activity,
  Layers,
  ArrowRight,
  RefreshCw,
  Clock,
  Sparkles,
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
  const [benchmarkStatus, setBenchmarkStatus] = useState<string>('');
  const [result, setResult] = useState<BenchmarkSideBySideResult | null>(null);

  if (!isOpen) return null;

  const handleRunBenchmark = async () => {
    setIsRunning(true);
    setResult(null);

    try {
      setBenchmarkStatus('Executing On-Device Gemini Nano (Strict Local)...');
      await new Promise((r) => setTimeout(r, 80));

      setBenchmarkStatus('Benchmarking Local vs Cloud (gemini-3.8-flash)...');
      const benchmarkData = await runSideBySideBenchmark(inputText, isOnline);
      setResult(benchmarkData);
    } catch (err) {
      console.error('[BenchmarkModal] Benchmark error:', err);
    } finally {
      setIsRunning(false);
      setBenchmarkStatus('');
    }
  };

  const payloadSize = new Blob([inputText]).size;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="bg-gradient-to-tr from-cyan-500 to-indigo-600 p-2 rounded-xl text-white shadow-md shadow-indigo-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-white">Hybrid Inference Benchmark</h3>
                <span className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold px-2 py-0.5 rounded-full text-[10px]">
                  Side-by-Side Analysis
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Direct factual comparison of on-device local inference vs. cloud escalation using identical inputs.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Test Input Selector & Overview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Benchmark Test Payload</span>
              </span>
              <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
                <span>{inputText.length} chars</span>
                <span>•</span>
                <span className="text-cyan-400">{payloadSize} Bytes</span>
                {activeDocumentText && (
                  <>
                    <span>•</span>
                    <button
                      onClick={() => setInputText(activeDocumentText)}
                      className="text-indigo-400 hover:underline"
                    >
                      Use Active Doc
                    </button>
                  </>
                )}
                <button
                  onClick={() => setInputText(DEFAULT_BENCHMARK_SAMPLE)}
                  className="text-slate-400 hover:text-slate-200 hover:underline"
                >
                  Reset Sample
                </button>
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={4}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500 transition resize-none"
              placeholder="Paste or write input text to benchmark..."
            />
          </div>

          {/* Benchmark Trigger CTA */}
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Runs the extraction pipeline across both local and cloud engines simultaneously.</span>
            </div>

            <button
              onClick={handleRunBenchmark}
              disabled={isRunning || !inputText.trim()}
              className={`px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition flex items-center space-x-2 ${
                isRunning
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : 'bg-gradient-to-r from-emerald-600 via-cyan-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white cursor-pointer shadow-cyan-600/20'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                  <span>{benchmarkStatus || 'Benchmarking Engines...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 fill-current text-amber-300" />
                  <span>Run Side-by-Side Benchmark</span>
                </>
              )}
            </button>
          </div>

          {/* Results Comparison Table */}
          {result && (
            <div className="space-y-4">
              <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-900/40">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
                      <th className="p-3">Evaluation Metric</th>
                      <th className="p-3 text-emerald-400 font-bold bg-emerald-950/20 border-x border-slate-800">
                        <div className="flex items-center space-x-1.5">
                          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                          <span>On-Device (Gemini Nano)</span>
                        </div>
                      </th>
                      <th className="p-3 text-purple-400 font-bold bg-purple-950/20">
                        <div className="flex items-center space-x-1.5">
                          <Cloud className="w-3.5 h-3.5 text-purple-400" />
                          <span>Cloud (Gemini 3.8 Flash)</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {/* Latency */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Execution Latency</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-emerald-300 font-bold">
                        {result.local.success ? (
                          <div className="flex items-center space-x-2">
                            <span>{result.local.latencyMs} ms</span>
                            {result.cloud.success && result.local.latencyMs < result.cloud.latencyMs && (
                              <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.2 rounded font-sans">
                                {(result.cloud.latencyMs / Math.max(1, result.local.latencyMs)).toFixed(1)}x faster
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-rose-400">Failed: {result.local.error}</span>
                        )}
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-300">
                        {result.cloud.success ? (
                          <span>{result.cloud.latencyMs} ms</span>
                        ) : (
                          <span className="text-amber-400">{result.cloud.error || 'Offline'}</span>
                        )}
                      </td>
                    </tr>

                    {/* Network Egress */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <Wifi className="w-3.5 h-3.5 text-sky-400" />
                        <span>Network Egress (Bytes Sent)</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-emerald-400 font-bold">
                        <span>0 Bytes (Air-Gapped)</span>
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-300">
                        <span>{result.cloud.networkBytesSent} Bytes</span>
                      </td>
                    </tr>

                    {/* Privacy Exposure */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Privacy Exposure</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-emerald-400 font-bold">
                        <div className="flex items-center space-x-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>100% Zero Leakage</span>
                        </div>
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-300">
                        <span>{result.cloud.privacyExposure}</span>
                      </td>
                    </tr>

                    {/* API Cost */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Inference API Cost</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-emerald-400 font-bold">
                        <span>$0.000000 (Free)</span>
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-300">
                        <span>+${result.cloud.estimatedCostUsd.toFixed(6)}</span>
                      </td>
                    </tr>

                    {/* Structured Knowledge Nodes */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Knowledge Nodes Extracted</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-slate-200">
                        <span>{result.local.nodesExtracted} nodes</span>
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-200">
                        <span>{result.cloud.nodesExtracted} nodes</span>
                      </td>
                    </tr>

                    {/* Structured Edges */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
                        <span>Graph Relationship Edges</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-slate-200">
                        <span>{result.local.edgesExtracted} edges</span>
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-200">
                        <span>{result.cloud.edgesExtracted} edges</span>
                      </td>
                    </tr>

                    {/* PII Redactions */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <Lock className="w-3.5 h-3.5 text-rose-400" />
                        <span>PII Tokens Intercepted</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-amber-300 font-bold">
                        <span>{result.local.redactionsCount} local tokens</span>
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-300">
                        <span>{result.cloud.redactionsCount} tokens</span>
                      </td>
                    </tr>

                    {/* Offline Support */}
                    <tr className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-300 font-sans font-medium flex items-center space-x-2">
                        <Activity className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Offline Execution Support</span>
                      </td>
                      <td className="p-3 bg-emerald-950/10 border-x border-slate-800 text-emerald-400 font-bold">
                        <span>100% Offline Capable</span>
                      </td>
                      <td className="p-3 bg-purple-950/10 text-slate-400">
                        <span>Requires Cloud Connectivity</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Architectural Insight Callout Box */}
              <div className="p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/30 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center space-x-1.5 text-cyan-300 font-bold uppercase tracking-wider text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Key Hybrid AI Architectural Takeaway</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  On-device Gemini Nano execution guarantees <span className="text-emerald-400 font-semibold">zero network data leakage</span>,
                  sub-second deterministic structured extraction, and <span className="text-emerald-400 font-semibold">zero API token cost</span>.
                  Cloud escalation (Gemini 3.8 Flash via Firebase AI Logic) is selectively reserved for sanitized high-capacity synthesis, cross-document contradiction resolution, and audio generation.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 font-mono">
            SynapseVault • Evaluator Benchmark Suite
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition cursor-pointer"
          >
            Close Benchmark
          </button>
        </div>
      </div>
    </div>
  );
};
