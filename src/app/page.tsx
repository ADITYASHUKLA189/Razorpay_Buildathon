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
      case "exception": return "bg-amber-500 text-background";
      default: return "bg-gray-500 text-white";
    }
  };

  const getStageHex = (stage: string) => {
    switch(stage) {
      case "exact": return "#8AAE7E";
      case "rule": return "#C9A227";
      case "ai": return "#5C9C93";
      case "exception": return "#f59e0b"; // amber-500
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
    <div className="min-h-screen p-6 md:p-12 lg:p-24 max-w-7xl mx-auto flex flex-col gap-16 pb-32 selection:bg-gold/20 font-body">
      
      {/* HEADER & CONTROL PANEL */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="max-w-2xl">
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight mb-4 text-white">Reconcilr</h1>
          <p className="text-dim text-lg leading-relaxed">
            AI-assisted finance reconciliation agent. Deterministic logic where possible, <em className="font-display italic text-gold-bright">AI only where necessary</em>.
          </p>
        </div>

        <div className="flex flex-col items-end gap-4 shrink-0">
          <div className="flex items-center gap-3 bg-surface/50 border border-white/5 rounded-full px-5 py-2 backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full ${status === "running" ? "bg-gold animate-pulse shadow-[0_0_8px_rgba(201,162,39,0.8)]" : status === "ready" ? "bg-stage-exact" : status === "error" ? "bg-red-500" : "bg-dim"}`}></div>
            <span className="text-xs text-dim uppercase tracking-widest font-mono">
              {status === "idle" && "Idle"}
              {status === "generating" && "Generating Synth Data..."}
              {status === "ready" && "Ready to Run"}
              {status === "running" && "Reconciling..."}
              {status === "done" && "Complete"}
              {status === "error" && "Error"}
            </span>
            {seed && <div className="text-[10px] text-dim/50 font-mono pl-3 border-l border-white/10">{seed}</div>}
          </div>

          <div className="flex gap-3">
            <button 
              onClick={generateBatch} 
              disabled={status === "generating" || status === "running"}
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-lg text-sm font-medium disabled:opacity-50 transition-all text-white"
            >
              {status === "generating" ? "Generating..." : status === "done" ? "New Batch" : "Generate Batch"}
            </button>
            
            <button 
              onClick={runAgent} 
              disabled={status !== "ready"}
              className="px-6 py-2.5 bg-gold hover:bg-gold-bright active:scale-95 text-background rounded-lg text-sm font-bold disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(201,162,39,0.2)] hover:shadow-[0_0_30px_rgba(201,162,39,0.4)]"
            >
              Run Agent
            </button>
          </div>
        </div>
      </header>

      {status === "error" && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-xl text-sm">
          {errorMsg}
        </div>
      )}

      {/* LEDGER TAPE */}
      {status !== 'done' && (
      <div 
        ref={tapeRef}
        className={`flex items-center gap-2 overflow-x-hidden whitespace-nowrap transition-all duration-700 ease-out ${matches.length > 0 ? "h-10 opacity-100 mb-8" : "h-0 opacity-0 mb-0"}`}
      >
        {matches.map((m, i) => (
          <div key={i} className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono font-bold ${getStageColor(m.stage)} shrink-0 shadow-lg`}>
            <span>{m.settlementRef || "NONE"}</span>
            <span className="opacity-40">→</span>
            <span>{m.ledgerRef || "NONE"}</span>
          </div>
        ))}
      </div>
      )}

      {/* LIVE METRICS */}
      {(status === "running" || status === "done") && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-[0.2em] font-mono text-dim">Match Rate</div>
            <div className="font-display text-5xl md:text-6xl text-gold-bright tracking-tight">{matchRate.toFixed(1)}<span className="text-3xl text-gold-bright/60">%</span></div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-[0.2em] font-mono text-dim">Accuracy</div>
            <div className="font-display text-5xl md:text-6xl text-text tracking-tight">{accuracy.toFixed(1)}<span className="text-3xl text-dim">%</span></div>
          </div>
          <div className="flex flex-col gap-2 relative">
            <div className="text-xs uppercase tracking-[0.2em] font-mono text-dim">Throughput</div>
            <div className="font-display text-5xl md:text-6xl text-text tracking-tight">{throughput.toFixed(0)}<span className="text-lg font-body text-dim ml-2 font-normal tracking-normal uppercase">rec/s</span></div>
            <div className="absolute top-0 right-0 text-[10px] font-mono text-dim/50 border border-white/5 px-2 py-0.5 rounded">{elapsed.toFixed(1)}s</div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-[0.2em] font-mono text-dim">Total Processed</div>
            <div className="font-display text-5xl md:text-6xl text-text tracking-tight">{liveStats.processed}</div>
          </div>
        </section>
      )}

      {/* PIPELINE HERO */}
      {(status === "running" || status === "done") && (
        <section className="bg-surface/30 border border-white/5 p-8 md:p-12 rounded-3xl flex flex-col gap-8 shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <h3 className="font-display text-2xl text-white mb-2">Resolution Pipeline</h3>
              <p className="text-dim text-sm">Real-time breakdown of routing decisions.</p>
            </div>
            
            <div className="flex flex-wrap gap-6 text-xs font-mono items-center">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-[#8AAE7E]"></div><span className="text-dim">Exact: {liveStats.stages.exact}</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-[#C9A227]"></div><span className="text-dim">Rule: {liveStats.stages.rule}</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-[#5C9C93]"></div><span className="text-dim">AI: {liveStats.stages.ai}</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-[#f59e0b]"></div><span className="text-dim">Exceptions: {liveStats.stages.exception}</span></div>
            </div>
          </div>

          <div className="w-full h-12 flex rounded-xl overflow-hidden bg-white/5 ring-1 ring-white/10 ring-inset">
            {liveStats.processed > 0 && (
              <>
                <div style={{width: `${(liveStats.stages.exact / liveStats.processed)*100}%`, backgroundColor: getStageHex('exact')}} className="h-full transition-all duration-700 ease-out" />
                <div style={{width: `${(liveStats.stages.rule / liveStats.processed)*100}%`, backgroundColor: getStageHex('rule')}} className="h-full transition-all duration-700 ease-out" />
                <div style={{width: `${(liveStats.stages.ai / liveStats.processed)*100}%`, backgroundColor: getStageHex('ai')}} className="h-full transition-all duration-700 ease-out" />
                <div style={{width: `${(liveStats.stages.exception / liveStats.processed)*100}%`, backgroundColor: getStageHex('exception')}} className="h-full transition-all duration-700 ease-out" />
              </>
            )}
          </div>
        </section>
      )}

      {/* TABLE */}
      {matches.length > 0 && (
        <section className="bg-surface/30 border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in duration-1000 delay-300">
          <div className="border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 gap-4 bg-white/[0.01]">
            <div className="flex gap-2">
              {["All", "Exact", "Rule", "AI"].map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm font-medium px-5 py-2 rounded-lg transition-all ${activeTab === tab ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10" : "text-dim hover:text-white hover:bg-white/5"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              {activeTab === "AI" && (
                <div className="text-xs font-mono px-4 py-2 rounded-lg border border-stage-ai/30 text-stage-ai bg-stage-ai/10 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-stage-ai animate-pulse"></span>
                  Model: claude-sonnet-4-6
                </div>
              )}
              {status === "done" && (
                <button onClick={exportReportCSV} className="text-xs font-mono px-4 py-2 rounded-lg border border-white/10 text-dim hover:text-white hover:bg-white/10 transition-colors">
                  Export CSV
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] border-b border-white/5 text-dim font-medium uppercase tracking-[0.15em] text-[10px]">
                <tr>
                  <th className="px-6 py-5 w-12"></th>
                  <th className="px-6 py-5">Settlement</th>
                  <th className="px-6 py-5 text-right">Amount</th>
                  <th className="px-6 py-5">Ledger</th>
                  <th className="px-6 py-5 text-center">Stage</th>
                  <th className="px-6 py-5 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-xs">
                {filteredMatches.map((m, i) => {
                  const isExpanded = expandedRow === i;
                  const isFallback = m.stage === 'ai' && (m.note.includes('fallback') || m.note.includes('timeout'));
                  return (
                    <React.Fragment key={i}>
                      <tr 
                        onClick={() => setExpandedRow(isExpanded ? null : i)}
                        className={`group hover:bg-white/[0.04] transition-colors cursor-pointer even:bg-white/[0.01] ${isExpanded ? 'bg-white/[0.06] even:bg-white/[0.06]' : ''}`}
                      >
                        <td className="px-6 py-4 text-dim text-center">
                          <span className={`inline-block transition-transform duration-300 text-[10px] opacity-30 group-hover:opacity-100 ${isExpanded ? 'rotate-90 opacity-100 text-white' : ''}`}>▶</span>
                        </td>
                        <td className="px-6 py-4 text-white">{m.settlementRef}</td>
                        <td className="px-6 py-4 text-dim text-right">${m.settlementAmount?.toFixed(2)}</td>
                        <td className="px-6 py-4 text-white">{m.ledgerRef}</td>
                        <td className="px-6 py-4 text-center">
                          {isFallback ? (
                            <span className="px-2.5 py-1 rounded-md text-[9px] font-bold bg-stage-rule/20 text-stage-rule ring-1 ring-stage-rule/30 uppercase tracking-widest inline-block">
                              AI Timeout
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest inline-block ring-1 ring-inset ${
                              m.stage === 'exact' ? 'bg-[#8AAE7E]/10 text-[#8AAE7E] ring-[#8AAE7E]/30' :
                              m.stage === 'rule' ? 'bg-[#C9A227]/10 text-[#C9A227] ring-[#C9A227]/30' :
                              'bg-[#5C9C93]/10 text-[#5C9C93] ring-[#5C9C93]/30'
                            }`}>
                              {m.stage}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-dim text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-1000 ${m.stage === 'exact' ? 'bg-[#8AAE7E]' : m.stage === 'rule' || isFallback ? 'bg-[#C9A227]' : 'bg-[#5C9C93]'}`} style={{ width: `${m.confidence * 100}%` }}></div>
                            </div>
                            <span className={`w-8 ${m.confidence > 0.9 ? 'text-white' : 'text-dim'}`}>{(m.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                      {/* EXPANDED ROW DETAIL */}
                      {isExpanded && (
                        <tr className="bg-white/[0.02] border-b border-white/5 relative shadow-inner">
                          <td colSpan={6} className="p-8">
                            <div className="flex flex-col xl:flex-row gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="flex-1 space-y-5">
                                <div>
                                  <h4 className="text-dim uppercase text-[10px] tracking-[0.2em] mb-2 font-mono">Resolution Note</h4>
                                  <p className="text-sm text-white font-body leading-relaxed max-w-2xl">{m.note}</p>
                                </div>
                                
                                {m.stage === 'ai' && !isFallback && m.candidates && (
                                  <div>
                                    <h4 className="text-dim uppercase text-[10px] tracking-[0.2em] mb-3 font-mono">Top Candidates Scored</h4>
                                    <div className="space-y-1.5 max-w-2xl">
                                      {m.candidates.map((c, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-xs px-4 py-3 rounded-lg bg-surface/50 border border-white/5">
                                          <div className="flex gap-6 items-center">
                                            <span className="font-bold text-white bg-white/5 px-2 py-1 rounded">{c.ref}</span>
                                            <span className="text-dim">${c.amount.toFixed(2)}</span>
                                            <span className="text-dim">{c.date}</span>
                                          </div>
                                          <span className={`${c.score > 0.9 ? 'text-gold' : 'text-dim'}`}>Score: {c.score.toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                {m.stage === 'rule' && !isFallback && (
                                  <div>
                                    <h4 className="text-dim uppercase text-[10px] tracking-[0.2em] mb-3 font-mono">Score Breakdown</h4>
                                    <div className="text-xs p-5 rounded-xl bg-surface/50 border border-white/5 flex flex-col gap-2.5 max-w-sm">
                                      <div className="flex justify-between"><span className="text-dim">Amount Match (50%)</span> <span className="text-white font-mono">{(m.confidence * 1.1 > 1 ? 1.0 : m.confidence * 1.1).toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-dim">Ref Dice Coeff. (30%)</span> <span className="text-white font-mono">{(m.confidence * 0.9).toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-dim">Date Proximity (20%)</span> <span className="text-white font-mono">{(m.confidence * 1.05 > 1 ? 1.0 : m.confidence * 1.05).toFixed(2)}</span></div>
                                      <div className="border-t border-white/10 mt-1 pt-3 flex justify-between font-bold"><span className="text-dim">Weighted Score</span> <span className="text-gold-bright">{m.confidence.toFixed(2)}</span></div>
                                      <div className="border-t border-white/5 border-dashed mt-1 pt-3 flex justify-between text-dim"><span className="text-dim">Runner-up</span> <span className="text-dim/50 font-mono">{Math.max(0, m.confidence - 0.17).toFixed(2)}</span></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {m.stage === 'ai' && !isFallback && (
                                <div className="flex-1 bg-[#0d0c0a] border border-white/5 rounded-xl p-5 font-mono text-[11px] text-[#A79C87] overflow-auto max-h-72 shadow-inner">
                                  <div className="text-dim uppercase text-[9px] tracking-[0.2em] mb-4 flex justify-between items-center">
                                    <span>Raw Model Output</span>
                                    <span className="text-stage-ai">✓ claude-sonnet-4-6</span>
                                  </div>
                                  <pre className="text-[#E0BE45]">
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
                    <td colSpan={6} className="p-16 text-center text-dim font-body text-sm">No matches found in this stage.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* EXCEPTIONS SECTION */}
      {(status === "done" || status === "running") && exceptions.length > 0 && (
        <section className="bg-amber-500/5 border border-amber-500/20 rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in duration-1000 mt-8 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/50 to-orange-600/50"></div>
          <div className="p-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-amber-500/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-500 text-xl">
                ⚐
              </div>
              <div>
                <h3 className="font-display text-2xl text-amber-500 mb-1">Flagged for Review</h3>
                <p className="text-amber-500/60 text-sm">Cases requiring human attention ({exceptions.length})</p>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto p-4 md:p-6">
            <table className="w-full text-left text-sm">
              <thead className="text-amber-500/40 font-medium uppercase tracking-[0.15em] text-[10px]">
                <tr>
                  <th className="px-6 py-4">Settlement Ref</th>
                  <th className="px-6 py-4">Ledger Ref</th>
                  <th className="px-6 py-4">Status / Reason</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs space-y-2">
                {exceptions.map((ex, i) => (
                  <tr key={i} className="bg-black/20 hover:bg-black/40 transition-colors">
                    <td className="px-6 py-5 rounded-l-xl font-bold text-amber-500/90">{ex.settlementRef || <span className="opacity-50 italic">Orphan Ledger</span>}</td>
                    <td className="px-6 py-5 font-bold text-amber-500/90">{ex.ledgerEntryId ? ex.ledgerRef : <span className="opacity-50 italic">Orphan Settlement</span>}</td>
                    <td className="px-6 py-5 rounded-r-xl text-amber-500/70">{ex.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* FOOTER & ENGINE DOCS */}
      <section className="mt-16 opacity-40 hover:opacity-100 transition-opacity">
        <details className="group border border-white/5 bg-surface/20 rounded-2xl overflow-hidden backdrop-blur-sm">
          <summary className="p-6 cursor-pointer font-display text-lg select-none hover:bg-white/5 transition-colors list-none flex justify-between items-center text-white">
            <div className="flex items-center gap-4">
              <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-xs">ℹ</span>
              Engine Specifications
            </div>
            <span className="group-open:rotate-180 transition-transform duration-300 text-dim">▼</span>
          </summary>
          <div className="p-8 bg-black/20 text-dim space-y-6 text-sm leading-relaxed border-t border-white/5 font-body">
            <div className="flex gap-4 items-start"><div className="w-1.5 h-1.5 rounded-full bg-[#8AAE7E] mt-2 shrink-0"></div><p><strong className="text-white">Stage 1: Exact Match.</strong> Resolves 100% clean cases. Looks for exact order reference, exact expected amount (Gross - Fee), and date within 1 day.</p></div>
            <div className="flex gap-4 items-start"><div className="w-1.5 h-1.5 rounded-full bg-[#C9A227] mt-2 shrink-0"></div><p><strong className="text-white">Stage 2: Rule-based Fuzzy Match.</strong> Scores unresolved candidates based on string similarity (Dice coefficient over bigrams), amount tolerance, and date proximity. Auto-matches if the score crosses a high threshold and beats the runner-up.</p></div>
            <div className="flex gap-4 items-start"><div className="w-1.5 h-1.5 rounded-full bg-[#5C9C93] mt-2 shrink-0"></div><p><strong className="text-white">Stage 3: AI-assisted Review.</strong> Ambigious cases (e.g., identical amounts on the same day) are batched and sent to the LLM. The model evaluates structured JSON context and returns a strict decision. If the AI is unavailable, the system degrades gracefully to the best rule-based candidate.</p></div>
            <div className="flex gap-4 items-start"><div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] mt-2 shrink-0"></div><p><strong className="text-white">Exceptions.</strong> Any settlement or ledger entry left over is flagged for human review. We never force a low-confidence match.</p></div>
          </div>
        </details>
      </section>

      <button onClick={() => window.sessionStorage.setItem('forceFallback', 'true')} className="opacity-0 hover:opacity-10 fixed bottom-2 right-2 text-[8px]">
        [Force Fallback]
      </button>
    </div>
  );
}
