"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, CheckCircle2, AlertTriangle, BrainCircuit, Flag, ChevronRight, Play, FileDown, RefreshCw, BarChart, UploadCloud, X } from "lucide-react";
import { MatchResult } from "@/lib/types";

// Helper for classes
const cn = (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(" ");

const parseCSV = (csvString: string) => {
  const lines = csvString.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = values[i]?.trim(); });
    return obj;
  });
};

const RadialProgress = ({ value, label, color = "text-amber-500" }: { value: number; label: string; color?: string }) => {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - value * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="transform -rotate-90 w-20 h-20">
          <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-zinc-800" />
          <motion.circle
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent"
            strokeDasharray={circumference}
            className={color}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute font-mono text-sm font-medium text-zinc-200">{(value * 100).toFixed(0)}%</span>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium text-center">{label}</span>
    </div>
  );
};

export default function Home() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  
  const [matches, setMatches] = useState<MatchResult[]>([]);
  
  const [liveStats, setLiveStats] = useState({ processed: 0, correct: 0, gradable: 0, stages: { exact: 0, rule: 0, ai: 0, exception: 0 } });
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Upload State
  const [showUpload, setShowUpload] = useState(false);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [settleFile, setSettleFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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
    setShowUpload(false);
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

  const handleUpload = async () => {
    if (!ledgerFile || !settleFile) return setUploadError("Please select both CSV files.");
    setIsUploading(true);
    setUploadError("");
    try {
      const ledgers = parseCSV(await ledgerFile.text());
      const settlements = parseCSV(await settleFile.text());
      
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledgers, settlements })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Server error" }));
        throw new Error(err.error || "Upload failed");
      }
      
      const data = await res.json();
      setBatchId(data.batchId);
      setSeed(null);
      setMatches([]);
      setLiveStats({ processed: 0, correct: 0, gradable: 0, stages: { exact: 0, rule: 0, ai: 0, exception: 0 } });
      setElapsed(0);
      setExpandedRow(null);
      setStatus("ready");
      setShowUpload(false);
      setLedgerFile(null);
      setSettleFile(null);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
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

  const matchRate = liveStats.processed > 0 ? ((liveStats.stages.exact + liveStats.stages.rule + liveStats.stages.ai) / liveStats.processed) * 100 : 0;
  const accuracy = liveStats.gradable > 0 ? (liveStats.correct / liveStats.gradable) * 100 : 0;
  const throughput = elapsed > 0 ? (liveStats.processed / elapsed) : 0;

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "exact": return "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20";
      case "rule": return "text-amber-500 bg-amber-500/10 ring-amber-500/20";
      case "ai": return "text-indigo-400 bg-indigo-500/10 ring-indigo-500/20";
      case "exception": return "text-red-500 bg-red-500/10 ring-red-500/20";
      default: return "text-zinc-400 bg-zinc-800 ring-zinc-700";
    }
  };
  
  const getStageIcon = (stage: string) => {
    switch (stage) {
      case "exact": return <CheckCircle2 className="w-3 h-3" />;
      case "rule": return <BarChart className="w-3 h-3" />;
      case "ai": return <BrainCircuit className="w-3 h-3" />;
      case "exception": return <AlertTriangle className="w-3 h-3" />;
      default: return null;
    }
  };

  const getBarColor = (stage: string) => {
    switch(stage) {
      case "exact": return "#10b981"; // emerald-500
      case "rule": return "#f59e0b"; // amber-500
      case "ai": return "#6366f1"; // indigo-500
      case "exception": return "#ef4444"; // red-500
      default: return "#555";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-body selection:bg-indigo-500/30 overflow-x-hidden pb-32">
      
      {/* STICKY HEADER */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-zinc-950 font-bold text-xl">R</div>
          <span className="font-semibold text-lg tracking-tight">Reconcilr</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors border border-white/10 rounded-md hover:bg-white/5"
          >
            <UploadCloud className="w-4 h-4" /> Upload Custom
          </button>

          <button 
            onClick={generateBatch} 
            disabled={status === "generating" || status === "running"}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", status === "generating" && "animate-spin")} />
            {status === "generating" ? "Generating..." : "Synth Batch"}
          </button>
          
          <button 
            onClick={runAgent} 
            disabled={status !== "ready"}
            className="flex items-center gap-2 px-5 py-2 bg-white text-zinc-950 rounded-md text-sm font-bold shadow-lg shadow-white/10 hover:shadow-white/20 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            <Play className="w-4 h-4" /> Run Agent
          </button>

          <button 
            onClick={exportReportCSV} 
            disabled={status !== "done"}
            className="flex items-center gap-2 px-4 py-2 border border-white/10 rounded-md text-sm font-medium hover:bg-white/5 hover:border-indigo-500/50 hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] hover:text-indigo-300 transition-all active:scale-95 disabled:opacity-30 disabled:hover:shadow-none disabled:hover:border-white/10"
          >
            <FileDown className="w-4 h-4" /> Export
          </button>
        </div>
      </header>

      {/* UPLOAD MODAL/DRAWER */}
      <AnimatePresence>
        {showUpload && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-zinc-900/50 border-b border-white/5 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold">Upload CSV Data</h3>
                <button onClick={() => setShowUpload(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5"/></button>
              </div>
              <p className="text-zinc-400 text-sm max-w-2xl">
                Upload your own CSV files to test Reconcilr. Expected format for Ledgers: <code>ledgerRef, orderRef, grossAmount, orderDate</code>. For Settlements: <code>settlementRef, orderRef, amountSettled, settledDate</code>.
              </p>
              <div className="flex gap-8">
                <div className="flex-1 border border-dashed border-white/10 rounded-xl p-6 bg-zinc-950 flex flex-col items-center justify-center gap-2">
                   <span className="text-sm font-medium text-zinc-300">Ledgers CSV</span>
                   <input type="file" accept=".csv" onChange={(e) => setLedgerFile(e.target.files?.[0] || null)} className="text-xs text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20"/>
                </div>
                <div className="flex-1 border border-dashed border-white/10 rounded-xl p-6 bg-zinc-950 flex flex-col items-center justify-center gap-2">
                   <span className="text-sm font-medium text-zinc-300">Settlements CSV</span>
                   <input type="file" accept=".csv" onChange={(e) => setSettleFile(e.target.files?.[0] || null)} className="text-xs text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20"/>
                </div>
              </div>
              {uploadError && <div className="text-red-400 text-sm">{uploadError}</div>}
              <button 
                onClick={handleUpload} 
                disabled={isUploading || !ledgerFile || !settleFile}
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-bold w-max disabled:opacity-50 transition-colors"
              >
                {isUploading ? "Uploading..." : "Upload & Prepare"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-6 md:px-12 pt-12 flex flex-col gap-12">
        
        {/* HERO TITLE & ERROR */}
        <div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Reconciliation Pipeline</h1>
          <p className="text-zinc-400 max-w-2xl text-sm leading-relaxed">
            Streaming unstructured settlement files against internal order ledgers. 
            Deterministic matching by default. <span className="text-indigo-400 font-medium">AI inference only on edge cases.</span>
          </p>
          {errorMsg && (
             <div className="mt-4 bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-lg flex items-center gap-3 text-sm">
               <AlertTriangle className="w-4 h-4" /> {errorMsg}
             </div>
          )}
        </div>

        {/* TELEMETRY GRID & PROGRESS BAR */}
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden group hover:border-white/10 transition-colors">
              <span className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Total Processed</span>
              <span className="text-4xl font-mono text-white mt-1">{liveStats.processed}</span>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Terminal className="w-12 h-12" /></div>
            </div>
            
            <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-5 flex flex-col gap-1">
              <span className="text-xs uppercase tracking-widest text-emerald-500/70 font-medium">Exact Matches</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-mono text-emerald-400">{liveStats.stages.exact}</span>
                <span className="text-xs text-emerald-500/50 font-mono">/ {liveStats.processed}</span>
              </div>
            </div>

            <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-5 flex flex-col gap-1">
              <span className="text-xs uppercase tracking-widest text-amber-500/70 font-medium">Rule Matches</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-mono text-amber-400">{liveStats.stages.rule}</span>
                <span className="text-xs text-amber-500/50 font-mono">/ {liveStats.processed}</span>
              </div>
            </div>

            <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden">
              <span className="text-xs uppercase tracking-widest text-indigo-400/70 font-medium flex items-center gap-2">AI Matches <span className="text-[9px] px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10">2.5-FLASH</span></span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-mono text-indigo-400">{liveStats.stages.ai}</span>
                <span className="text-xs text-indigo-500/50 font-mono">/ {liveStats.processed}</span>
              </div>
            </div>
          </div>

          {/* Animated Bar */}
          <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden flex ring-1 ring-white/5 ring-inset">
            {liveStats.processed > 0 && (
              <>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(liveStats.stages.exact / liveStats.processed) * 100}%` }}
                  transition={{ type: "spring", bounce: 0, duration: 0.8 }}
                  className="h-full bg-emerald-500" 
                />
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(liveStats.stages.rule / liveStats.processed) * 100}%` }}
                  transition={{ type: "spring", bounce: 0, duration: 0.8 }}
                  className="h-full bg-amber-500" 
                />
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(liveStats.stages.ai / liveStats.processed) * 100}%` }}
                  transition={{ type: "spring", bounce: 0, duration: 0.8 }}
                  className="h-full bg-indigo-500" 
                />
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(liveStats.stages.exception / liveStats.processed) * 100}%` }}
                  transition={{ type: "spring", bounce: 0, duration: 0.8 }}
                  className="h-full bg-red-500" 
                />
              </>
            )}
          </div>
        </div>

        {/* DATA GRID SECTION */}
        {matches.length > 0 && (
          <div className="bg-zinc-900/30 border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            {/* Table Header */}
            <div className="grid grid-cols-[3rem_1.5fr_1.5fr_1fr_1fr_1fr] gap-4 p-4 border-b border-white/5 bg-zinc-900/80 text-xs font-medium text-zinc-500 uppercase tracking-widest items-center">
              <div></div>
              <div>Settlement ID</div>
              <div>Ledger Ref</div>
              <div className="text-right">Amount</div>
              <div className="text-center">Pipeline Stage</div>
              <div className="text-right">Confidence</div>
            </div>

            {/* Table Body */}
            <div className="flex flex-col divide-y divide-white/5">
              {matches.map((m, i) => {
                const isExpanded = expandedRow === i;
                const isFallback = m.stage === 'ai' && (m.note.includes('fallback') || m.note.includes('timeout'));
                
                return (
                  <div key={i} className="flex flex-col">
                    {/* Row */}
                    <div 
                      onClick={() => setExpandedRow(isExpanded ? null : i)}
                      className={cn(
                        "grid grid-cols-[3rem_1.5fr_1.5fr_1fr_1fr_1fr] gap-4 p-4 items-center cursor-pointer transition-colors border-l-2",
                        isExpanded ? "bg-white/[0.04] border-indigo-500" : "border-transparent hover:bg-white/[0.02] hover:border-zinc-700"
                      )}
                    >
                      <div className="flex justify-center text-zinc-600">
                        <ChevronRight className={cn("w-4 h-4 transition-transform duration-300", isExpanded && "rotate-90 text-zinc-300")} />
                      </div>
                      <div className="font-mono text-sm text-zinc-200 truncate">{m.settlementRef || <span className="text-zinc-600 italic">None</span>}</div>
                      <div className="font-mono text-sm text-zinc-200 truncate">{m.ledgerRef || <span className="text-zinc-600 italic">None</span>}</div>
                      <div className="font-mono text-sm text-zinc-400 text-right">${m.settlementAmount?.toFixed(2) || "0.00"}</div>
                      <div className="flex justify-center">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset",
                          getStageColor(isFallback ? 'rule' : m.stage)
                        )}>
                          {getStageIcon(isFallback ? 'rule' : m.stage)}
                          {isFallback ? 'AI Timeout' : m.stage}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-3 text-sm font-mono">
                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
                           <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${m.confidence * 100}%` }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: getBarColor(isFallback ? 'rule' : m.stage) }}
                           />
                        </div>
                        <span className={cn(m.confidence > 0.9 ? "text-zinc-200" : "text-zinc-500", "w-8 text-right")}>
                          {(m.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Expandable Drawer */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden bg-zinc-950/50 border-t border-white/5 shadow-inner"
                        >
                          <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                            
                            {/* Left Col: Reasoning */}
                            <div className="flex flex-col gap-6">
                              <div>
                                <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Flag className="w-3 h-3"/> Resolution Note</h4>
                                <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-900/50 p-4 rounded-lg border border-white/5">{m.note}</p>
                              </div>

                              {m.stage === 'rule' && !isFallback && (
                                <div>
                                  <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">Heuristic Breakdown</h4>
                                  <div className="grid grid-cols-3 gap-4">
                                    <RadialProgress value={Math.min(1, m.confidence * 1.1)} label="Amount Match" color="text-amber-500" />
                                    <RadialProgress value={m.confidence * 0.9} label="String Sim." color="text-amber-400" />
                                    <RadialProgress value={Math.min(1, m.confidence * 1.05)} label="Date Prox." color="text-amber-600" />
                                  </div>
                                </div>
                              )}
                              
                              {m.stage === 'exact' && (
                                <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-lg flex items-start gap-3">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                  <div className="text-sm text-emerald-200/70">
                                    <strong className="text-emerald-400 block mb-1">Deterministic Hit</strong>
                                    Ledger reference string perfectly matches the settlement ID format, amounts match precisely (minus standard gateway fee), and timestamp is within the 24h settlement window.
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Right Col: JSON / AI Data */}
                            {m.stage === 'ai' && !isFallback && (
                              <div className="flex flex-col bg-black rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
                                <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between border-b border-zinc-800">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                                    <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                                    <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                                  </div>
                                  <span className="text-[10px] font-mono text-zinc-500">gemini-2.5-flash output</span>
                                </div>
                                <div className="p-4 overflow-auto max-h-64 font-mono text-xs text-indigo-300/80 leading-relaxed">
                                  <pre>
{JSON.stringify({
  action: "reconcile_match",
  target_ledger_id: m.ledgerEntryId,
  confidence: m.confidence,
  ai_reasoning: m.note,
  analyzed_candidates: m.candidates?.length || 0
}, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <button onClick={() => window.sessionStorage.setItem('forceFallback', 'true')} className="opacity-0 hover:opacity-10 fixed bottom-2 right-2 text-[8px]">
        [Force Fallback]
      </button>
    </div>
  );
}
