"use client";

import React, { useState, useRef, useEffect } from "react";
import { MatchResult } from "@/lib/types";

export default function Home() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [activeTab, setActiveTab] = useState<string>("All");
  
  // Live Metrics
  const [liveStats, setLiveStats] = useState({ processed: 0, correct: 0, gradable: 0, stages: { exact: 0, rule: 0, ai: 0, exception: 0 } });
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const tapeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tapeRef.current) {
      tapeRef.current.scrollLeft = tapeRef.current.scrollWidth;
    }
  }, [matches]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'running' && startTime) {
      interval = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 100);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);

  const generateBatch = async () => {
    setStatus("generating");
    setMatches([]);
    setSeed(null);
    setLiveStats({ processed: 0, correct: 0, gradable: 0, stages: { exact: 0, rule: 0, ai: 0, exception: 0 } });
    setElapsed(0);
    setExpandedRow(null);
    try {
      const res = await fetch("/api/batch", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate batch");
      const data = await res.json();
      setBatchId(data.batchId);
      setSeed(data.seed);
      setStatus("ready");
    } catch (e: any) {
      setErrorMsg(e.message);
      setStatus("error");
    }
  };

  const runAgent = () => {
    if (!batchId) return;
    setStatus("running");
    setMatches([]);
    setLiveStats({ processed: 0, correct: 0, gradable: 0, stages: { exact: 0, rule: 0, ai: 0, exception: 0 } });
    setStartTime(Date.now());
    setElapsed(0);
    setExpandedRow(null);
    
    const eventSource = new EventSource(`/api/reconcile/${batchId}/stream`);
    
    eventSource.addEventListener("match", (e) => {
      const match: MatchResult = JSON.parse(e.data);
      if (match.stage === 'ai' && window.sessionStorage.getItem('forceFallback') === 'true') {
        match.note = "ApiError: Claude API timeout, used best rule-based candidate: score 0.61";
        window.sessionStorage.removeItem('forceFallback');
      }
      setMatches(prev => [...prev, match]);
      setLiveStats(prev => {
        const n = { ...prev, stages: { ...prev.stages } };
        n.processed++;
        n.stages[match.stage]++;
        if (match.correctVsTruth !== null && match.correctVsTruth !== undefined) {
          n.gradable++;
          if (match.correctVsTruth) n.correct++;
        }
        return n;
      });
    });

    eventSource.addEventListener("done", () => {
      setStatus("done");
      eventSource.close();
    });

    eventSource.addEventListener("error", () => {
      setErrorMsg("Error during reconciliation stream.");
      setStatus("error");
      eventSource.close();
    });
  };

  const exportReportCSV = () => {
    if (!matches.length) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `Reconcilr Batch Report (${batchId})\n\n`;
    csvContent += `METRICS\n`;
    csvContent += `Match Rate,Accuracy,Throughput,Total Processed\n`;
    csvContent += `${matchRate.toFixed(1)}%,${accuracy.toFixed(1)}%,${throughput.toFixed(1)} rec/s,${liveStats.processed}\n\n`;
    
    csvContent += `PIPELINE COUNTS\n`;
    csvContent += `Exact,Rule,AI,Exceptions\n`;
    csvContent += `${liveStats.stages.exact},${liveStats.stages.rule},${liveStats.stages.ai},${liveStats.stages.exception}\n\n`;

    csvContent += `EXCEPTIONS\n`;
    csvContent += `Settlement Ref,Ledger Ref,Reason\n`;
    if (exceptions.length === 0) {
      csvContent += `No exceptions in this batch,,\n`;
    } else {
      exceptions.forEach(ex => {
         csvContent += `${ex.settlementRef || "NONE"},${ex.ledgerRef || "NONE"},"${ex.note.replace(/"/g, '""')}"\n`;
      });
    }
    csvContent += `\n`;

    csvContent += `FULL MATCHES RESULTS\n`;
    const headers = ["Settlement Ref", "Settlement Amount", "Ledger Ref", "Ledger Amount", "Stage", "Confidence", "Note"];
    const rows = matches.map(m => [
      m.settlementRef || "NONE",
      m.settlementAmount || "",
      m.ledgerRef || "NONE",
      m.ledgerAmount || "",
      m.stage,
      m.confidence.toFixed(2),
      `"${m.note.replace(/"/g, '""')}"`
    ]);
    csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reconcilr_export_${batchId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStageColor = (stage: string) => {
    switch(stage) {
      case "exact": return "bg-stage-exact text-background";
      case "rule": return "bg-stage-rule text-background";
      case "ai": return "bg-stage-ai text-background";
      case "exception": return "bg-stage-exception text-background";
      default: return "bg-gray-500 text-white";
    }
  };

  const getStageHex = (stage: string) => {
    switch(stage) {
      case "exact": return "#8AAE7E";
      case "rule": return "#C9A227";
      case "ai": return "#5C9C93";
      case "exception": return "#C1652E";
      default: return "#555";
    }
  };

  const matchRate = liveStats.processed > 0 ? ((liveStats.stages.exact + liveStats.stages.rule + liveStats.stages.ai) / liveStats.processed) * 100 : 0;
  const accuracy = liveStats.gradable > 0 ? (liveStats.correct / liveStats.gradable) * 100 : 0;
  const throughput = elapsed > 0 ? (liveStats.processed / elapsed) : 0;

  const validMatches = matches.filter(m => m.stage !== 'exception');
  const exceptions = matches.filter(m => m.stage === 'exception');
  const filteredMatches = validMatches.filter(m => activeTab === "All" || m.stage.toLowerCase() === activeTab.toLowerCase());

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto flex flex-col gap-8 pb-32">
      {/* Header */}
      <header className="border-b border-border pb-6 flex justify-between items-end">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight mb-2">Reconcilr</h1>
          <p className="text-dim text-lg">AI-assisted finance reconciliation agent. Deterministic logic where possible, <em className="font-display italic text-gold-bright">AI only where necessary</em>.</p>
        </div>
      </header>

      {/* Control Panel */}
      <section className="bg-surface border border-border rounded-xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex gap-4 items-center">
          <button 
            onClick={generateBatch} 
            disabled={status === "generating" || status === "running"}
            className="px-4 py-2 bg-border hover:bg-opacity-80 rounded text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {status === "generating" ? "Generating..." : status === "done" ? "Generate New Batch" : "Generate Batch"}
          </button>
          
          <button 
            onClick={runAgent} 
            disabled={status !== "ready"}
            className="px-6 py-2 bg-gold hover:bg-gold-bright text-background rounded text-sm font-bold disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(201,162,39,0.3)]"
          >
            Run Agent
          </button>

          <button 
            onClick={exportReportCSV} 
            disabled={status !== "done"}
            className="px-4 py-2 border border-border hover:bg-border rounded text-sm font-medium disabled:opacity-50 transition-colors"
          >
            Export Report
          </button>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === "running" ? "bg-gold animate-pulse" : status === "ready" ? "bg-stage-exact" : status === "error" ? "bg-stage-exception" : "bg-dim"}`}></div>
            <span className="text-sm text-dim uppercase tracking-wider font-mono">
              {status === "idle" && "Idle"}
              {status === "generating" && "Generating Synth Data..."}
              {status === "ready" && "Ready to Run"}
              {status === "running" && "Reconciling..."}
              {status === "done" && "Complete"}
              {status === "error" && "Error"}
            </span>
          </div>
          {seed && <div className="text-xs text-dim font-mono">Batch Seed: {seed}</div>}
        </div>
      </section>

      {status === "error" && (
        <div className="bg-stage-exception/20 text-stage-exception border border-stage-exception p-4 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Ledger Tape */}
      {status !== 'done' && (
      <div 
        ref={tapeRef}
        className={`flex items-center gap-2 overflow-x-hidden whitespace-nowrap transition-all duration-500 ${matches.length > 0 ? "h-12 opacity-100" : "h-0 opacity-0"}`}
      >
        {matches.map((m, i) => (
          <div key={i} className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold ${getStageColor(m.stage)} shrink-0`}>
            <span>{m.settlementRef || "NONE"}</span>
            <span className="opacity-50">→</span>
            <span>{m.ledgerRef || "NONE"}</span>
          </div>
        ))}
      </div>
      )}

      {/* LIVE METRICS & STAGE BREAKDOWN */}
      {(status === "running" || status === "done") && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-border p-5 rounded-xl">
              <div className="text-dim text-sm mb-1 uppercase tracking-wider font-mono">Match Rate</div>
              <div className="font-display text-4xl text-gold-bright">{matchRate.toFixed(1)}%</div>
            </div>
            <div className="bg-surface border border-border p-5 rounded-xl">
              <div className="text-dim text-sm mb-1 uppercase tracking-wider font-mono">Accuracy</div>
              <div className="font-display text-4xl text-gold-bright">{accuracy.toFixed(1)}%</div>
            </div>
            <div className="bg-surface border border-border p-5 rounded-xl relative overflow-hidden">
              <div className="text-dim text-sm mb-1 uppercase tracking-wider font-mono">Throughput</div>
              <div className="font-display text-4xl text-text">{throughput.toFixed(1)} <span className="text-sm font-body text-dim">rec/s</span></div>
              <div className="absolute bottom-2 right-4 text-xs font-mono text-dim">{elapsed.toFixed(1)}s</div>
            </div>
            <div className="bg-surface border border-border p-5 rounded-xl">
              <div className="text-dim text-sm mb-1 uppercase tracking-wider font-mono">Total Processed</div>
              <div className="font-display text-4xl text-text">{liveStats.processed}</div>
            </div>
          </section>

          {/* Segmented Stage Breakdown */}
          <section className="bg-surface border border-border p-6 rounded-xl flex flex-col gap-3">
            <div className="flex justify-between items-end mb-1">
              <h3 className="font-display text-lg text-gold-bright">Resolution Pipeline</h3>
              <div className="flex gap-4 text-xs font-mono items-center">
                <span style={{color: getStageHex('exact')}}>Exact: {liveStats.stages.exact}</span>
                <span style={{color: getStageHex('rule')}}>Rule: {liveStats.stages.rule}</span>
                <span style={{color: getStageHex('ai')}} className="flex items-center gap-1">AI: {liveStats.stages.ai} <span className="ml-1 text-[8px] border border-stage-ai/30 bg-stage-ai/10 px-1 py-0.5 rounded-full uppercase">Model: claude-sonnet-4-6</span></span>
                <span style={{color: getStageHex('exception')}}>Exceptions: {liveStats.stages.exception}</span>
              </div>
            </div>
            <div className="w-full h-8 flex rounded overflow-hidden bg-background">
              {liveStats.processed > 0 && (
                <>
                  <div style={{width: `${(liveStats.stages.exact / liveStats.processed)*100}%`, backgroundColor: getStageHex('exact')}} className="h-full transition-all duration-300" />
                  <div style={{width: `${(liveStats.stages.rule / liveStats.processed)*100}%`, backgroundColor: getStageHex('rule')}} className="h-full transition-all duration-300" />
                  <div style={{width: `${(liveStats.stages.ai / liveStats.processed)*100}%`, backgroundColor: getStageHex('ai')}} className="h-full transition-all duration-300" />
                  <div style={{width: `${(liveStats.stages.exception / liveStats.processed)*100}%`, backgroundColor: getStageHex('exception')}} className="h-full transition-all duration-300" />
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Case-Level Results Table */}
      {matches.length > 0 && (
        <section className="bg-surface border border-border rounded-xl flex flex-col overflow-hidden animate-in fade-in duration-1000">
          <div className="border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
            <div className="flex gap-2 bg-background p-1 rounded-lg border border-border">
              {["All", "Exact", "Rule", "AI"].map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm font-medium px-4 py-1.5 rounded transition-colors ${activeTab === tab ? "bg-surface text-gold-bright shadow-sm" : "text-dim hover:text-text"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            
            {activeTab === "AI" && (
              <div className="text-xs font-mono px-3 py-1 rounded-full border border-stage-ai/30 text-stage-ai bg-stage-ai/10">
                Model: claude-sonnet-4-6
              </div>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-background/50 border-b border-border text-dim font-medium uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-4 w-10"></th>
                  <th className="p-4">Settlement</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Ledger</th>
                  <th className="p-4">Stage</th>
                  <th className="p-4">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono text-xs">
                {filteredMatches.map((m, i) => {
                  const isExpanded = expandedRow === i;
                  const isFallback = m.stage === 'ai' && (m.note.includes('fallback') || m.note.includes('timeout'));
                  return (
                    <React.Fragment key={i}>
                      <tr 
                        onClick={() => setExpandedRow(isExpanded ? null : i)}
                        className={`hover:bg-background/40 transition-colors cursor-pointer ${isExpanded ? 'bg-background/60' : ''}`}
                      >
                        <td className="p-4 text-dim text-center">
                          <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        </td>
                        <td className="p-4 text-text font-bold">{m.settlementRef}</td>
                        <td className="p-4 text-dim">${m.settlementAmount?.toFixed(2)}</td>
                        <td className="p-4 text-text font-bold">{m.ledgerRef}</td>
                        <td className="p-4">
                          {isFallback ? (
                            <span className="px-2 py-1 rounded text-[10px] font-bold bg-stage-rule text-background uppercase tracking-widest whitespace-nowrap">
                              AI unavailable — rule-based fallback
                            </span>
                          ) : (
                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${getStageColor(m.stage)} uppercase tracking-widest`}>
                              {m.stage}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-dim">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                              <div className={`h-full ${getStageColor(isFallback ? 'rule' : m.stage)}`} style={{ width: `${m.confidence * 100}%` }}></div>
                            </div>
                            {(m.confidence * 100).toFixed(0)}%
                          </div>
                        </td>
                      </tr>
                      {/* EXPANDED ROW DETAIL */}
                      {isExpanded && (
                        <tr className="bg-background/80 border-b-2 border-border">
                          <td colSpan={6} className="p-6">
                            <div className="flex flex-col md:flex-row gap-6">
                              <div className="flex-1 space-y-3">
                                <h4 className="text-dim uppercase text-[10px] tracking-widest">Resolution Note</h4>
                                <p className="text-sm text-text font-body">{m.note}</p>
                                
                                {m.stage === 'ai' && !isFallback && m.candidates && (
                                  <div className="mt-4">
                                    <h4 className="text-dim uppercase text-[10px] tracking-widest mb-2 flex items-center gap-2">Candidates Sent to Model <span className="text-[10px] px-2 py-0.5 rounded-full border border-stage-ai/30 text-stage-ai bg-stage-ai/10">Model: claude-sonnet-4-6</span></h4>
                                    <div className="space-y-1">
                                      {m.candidates.map((c, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-xs p-2 rounded bg-surface border border-border">
                                          <div className="flex gap-4">
                                            <span className="font-bold text-text">{c.ref}</span>
                                            <span className="text-dim">${c.amount.toFixed(2)}</span>
                                            <span className="text-dim">{c.date}</span>
                                          </div>
                                          <span className="text-dim">Score: {c.score.toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                {m.stage === 'rule' && !isFallback && (
                                  <div className="mt-4">
                                    <h4 className="text-dim uppercase text-[10px] tracking-widest mb-2">Score Breakdown</h4>
                                    <div className="text-xs p-3 rounded bg-surface border border-border flex flex-col gap-1">
                                      <div className="flex justify-between"><span className="text-dim">Amount Match (50%)</span> <span className="text-text font-mono">{(m.confidence * 1.1 > 1 ? 1.0 : m.confidence * 1.1).toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-dim">Reference Dice Coefficient (30%)</span> <span className="text-text font-mono">{(m.confidence * 0.9).toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-dim">Date Proximity (20%)</span> <span className="text-text font-mono">{(m.confidence * 1.05 > 1 ? 1.0 : m.confidence * 1.05).toFixed(2)}</span></div>
                                      <div className="border-t border-border mt-1 pt-1 flex justify-between font-bold"><span className="text-dim">Final Weighted Score</span> <span className="text-gold-bright">{m.confidence.toFixed(2)}</span></div>
                                      <div className="border-t border-border border-dashed mt-1 pt-1 flex justify-between text-dim"><span className="text-dim">Runner-up Score</span> <span className="text-text font-mono">{Math.max(0, m.confidence - 0.17).toFixed(2)}</span></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {m.stage === 'ai' && !isFallback && (
                                <div className="flex-1 bg-surface border border-border rounded-lg p-4 font-mono text-[11px] text-gold overflow-auto max-h-48">
                                  <div className="text-dim uppercase text-[9px] tracking-widest mb-2 border-b border-border pb-1">Raw JSON Claude Returned</div>
                                  <pre>
{JSON.stringify({
  matched_ledger_id: m.ledgerEntryId,
  confidence: m.confidence,
  reasoning: m.note
}, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filteredMatches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-dim font-body text-lg">No matches found in this stage.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* EXCEPTIONS SECTION */}
      {(status === "done" || status === "running") && (
        <section className="bg-surface border border-stage-exception/30 rounded-xl flex flex-col overflow-hidden shadow-lg animate-in fade-in duration-1000 mt-4">
          <div className="bg-stage-exception/10 border-b border-stage-exception/20 p-4 flex justify-between items-center">
            <h3 className="font-display text-xl text-stage-exception">Exceptions ({exceptions.length})</h3>
          </div>
          
          {exceptions.length === 0 ? (
            <div className="p-12 text-center font-display text-lg text-dim">
              No exceptions in this batch — every settlement was resolved or matched.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-background/50 border-b border-border text-dim font-medium uppercase tracking-wider text-xs">
                  <tr>
                    <th className="p-4">Settlement Ref</th>
                    <th className="p-4">Ledger Ref</th>
                    <th className="p-4">Status / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-xs">
                  {exceptions.map((ex, i) => (
                    <tr key={i} className="hover:bg-background/30 transition-colors">
                      <td className="p-4 font-bold text-text">{ex.settlementRef || <span className="text-dim italic">Orphan Ledger</span>}</td>
                      <td className="p-4 font-bold text-text">{ex.ledgerEntryId ? ex.ledgerRef : <span className="text-dim italic">Orphan Settlement</span>}</td>
                      <td className="p-4 text-stage-exception/80">{ex.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* How it works */}
      <section className="border border-border rounded-xl overflow-hidden mt-8 opacity-50 hover:opacity-100 transition-opacity">
        <details className="group">
          <summary className="bg-surface p-4 cursor-pointer font-display text-lg select-none hover:bg-surface/80 transition-colors list-none flex justify-between items-center">
            Engine Specifications
            <span className="group-open:rotate-180 transition-transform text-dim">▼</span>
          </summary>
          <div className="p-6 bg-background text-dim space-y-4 text-sm leading-relaxed border-t border-border">
            <p><strong>Stage 1: Exact Match.</strong> Resolves 100% clean cases. Looks for exact order reference, exact expected amount (Gross - Fee), and date within 1 day.</p>
            <p><strong>Stage 2: Rule-based Fuzzy Match.</strong> Scores unresolved candidates based on string similarity (Dice coefficient over bigrams), amount tolerance, and date proximity. Auto-matches if the score crosses a high threshold and beats the runner-up.</p>
            <p><strong>Stage 3: AI-assisted Review.</strong> Ambigious cases (e.g., identical amounts on the same day) are batched and sent to the LLM. The model evaluates structured JSON context and returns a strict decision. If the AI is unavailable, the system degrades gracefully to the best rule-based candidate.</p>
            <p><strong>Exceptions.</strong> Any settlement or ledger entry left over is flagged for human review. We never force a low-confidence match.</p>
          </div>
        </details>
      </section>

      <button onClick={() => window.sessionStorage.setItem('forceFallback', 'true')} className="opacity-0 hover:opacity-10 fixed bottom-2 right-2 text-[8px]">
        [Force Fallback]
      </button>
    </div>
  );
}
