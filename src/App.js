import React, { useState,useRef  } from "react";
import "./App.css";
import * as pdfjsLib from "pdfjs-dist";


pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const BACKEND = "https://in-pdf-api.onrender.com";

export default function App() {
 
  const [file,     setFile]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef                = useRef(null);

  // ── Validate & store selected file ───────────────────────────
  const onFileSelected = (f) => {
    setError("");
    setResult(null);
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Please upload a PDF file only (.pdf)");
      return;
    }
    if (f.size > 70 * 1024 * 1024) {
      setError("File too large. Maximum size is 70MB.");
      return;
    }
    setFile(f);
  };

const handleFileChange = (e) => onFileSelected(e.target.files[0]);
 
  // ── Drag & Drop ───────────────────────────────────────────────
  const onDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = ()  => setDragOver(false);
  const onDrop      = (e) => {
    e.preventDefault();
    setDragOver(false);
    onFileSelected(e.dataTransfer.files[0]);
  };
 
// ── Extract text from PDF using PDF.js ────────────────────────
  // Wrapped in Promise so it can be properly awaited
  const extractText = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
 
      reader.onload = async function () {
        try {
          const typedArray = new Uint8Array(this.result);
          const pdf        = await pdfjsLib.getDocument({ data: typedArray }).promise;
 
          let   fullText = "";
          const maxPages = Math.min(pdf.numPages, 30);
 
          for (let i = 1; i <= maxPages; i++) {
            const page    = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map((item) => item.str).join(" ") + "\n";
          }
 
          const trimmed = fullText.trim();
 
          if (trimmed.length < 50) {
            reject(new Error(
              "Not enough text found. This PDF may be scanned or image-based (no selectable text)."
            ));
            return;
          }

          // Truncate to 50,000 chars — enough for ~40 pages
          const final = trimmed.length > 50000
            ? trimmed.substring(0, 50000) + "\n[Truncated...]"
            : trimmed;
 
          resolve(final);
 
        } catch (err) {
          reject(new Error("PDF parse error: " + err.message));
        }
      };
 
      reader.onerror = () => reject(new Error("Could not read the file. Please try again."));
      reader.readAsArrayBuffer(f);
    });
// ── Send text to backend → Groq AI ───────────────────────────
  const sendToBackend = async (text) => {
    let response;
 
    try {
      response = await fetch(`${BACKEND}/api/summarize`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text }),
      });
    } catch {
      throw new Error(
        `Cannot connect to backend at ${BACKEND}. Make sure your server is running with: node server.js`
      );
    }
 
    const json = await response.json();
 
    if (!response.ok) {
      throw new Error(json.error || `Server error ${response.status}`);
    }
 
    return json.data;
  };
 const handleAnalyze = async () => {
    if (!file) return;
 
    setLoading(true);
    setError("");
    setResult(null);
 
    try {
      // Step 1: Extract text from PDF in browser
      console.log("📄 Extracting text from PDF...");
      const text = await extractText(file);
      console.log(`✅ Extracted ${text.length} characters`);
 
      // Step 2: Send to backend → Groq AI
      const data = await sendToBackend(text);
      setResult(data);
    } catch (err) {
      console.error("Error:", err.message);
      setError("⚠ " + (err.message || "Something went wrong."));
    }
    setLoading(false);
  };
 
  const handleReset = () => {
    setFile(null); setResult(null); setError(""); setLoading(false);
    if (inputRef.current) inputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (

    <div className="page">

     <div className="hero">

<div className="bg-text">
in'PDF in'PDF in'PDF in'PDF in'PDF in'PDF in'PDF
</div>

<div className="center-text">
<h1>Turn any PDF into{" "} <span className="highlight">clear action</span></h1>
</div>
</div>

      <div className="upload-section">
        <p className="upload-label">UPLOAD DOCUMENT</p>

        <div
         className="drop-area">
          <div className="drop-inner">

            <h2>Drop your PDF here</h2>

            <p>
              Research papers, contracts, reports, manuals — any PDF works
            </p>

            
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="file-input-hidden"
              />
            <div className="choose-btn-label">Choose File</div>
          </div>
        </div>

      {file && !loading && (
          <div className="file-bar">
            <span className="file-icon-sm">📑</span>
            <div className="file-meta">
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB · PDF</span>
            </div>
            <div className="file-btns">
              <button className="btn-clear"   onClick={handleReset}>✕ Clear</button>
              <button className="btn-analyze" onClick={handleAnalyze} disabled={loading}> ✦ Analyze</button>
            </div>
        </div>
      )}

      {/* Error */}
        {error && <div className="error-bar">{error}</div>}
      </div>
 
      
      {loading && (
        <div className="loading-wrap">
          <div className="spinner"></div>
          <p className="loading-text">Reading your document…</p>
          <p className="loading-sub">Extracting text · Sending to AI · Structuring results</p>
          <div className="progress-track">
          <div className="progress-fill"></div>
        </div>
        </div>
      )}
 
      {/* ── ✅ FIX 4: RESULTS — proper cards not raw JSON ──── */}
      {result && (
        <div className="results">
          <div className="results-label">✅ Analysis Complete</div>

 
          {/* TL;DR */}
          <div className="card card-dark">
            <div className="card-label">⚡ One-Line Summary</div>
            <p className="tldr-text">{result.tldr}</p>
          </div>
 
          {/* Summary */}
          <div className="card card-left-black">
            <div className="card-label">📋 Full Summary</div>
            <p className="card-body">{result.summary}</p>
          </div>

          {/* Actions + Facts */}
          <div className="two-col">
 
            <div className="card card-left-green">
              <div className="card-label">✅ What You Should Do</div>
              <ul className="action-list">
                {(result.actions || []).map((action, i) => (
                  <li key={i} className="action-item">
                    <span className="action-num">{i + 1}</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
 
            <div className="card card-accent-amber">
              <div className="card-label">🔎 Key Facts & Figures</div>
              <div className="fact-list">
                {(result.facts || []).map((f, i) => (
                  <div key={i} className="fact-item">
                    <span className="arrow">→</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

    </div>

{/* Watch Out + Doc Type */}
          <div className="two-col">
 
            <div className="card card-accent-red">
              <div className="card-label">⚠️ Watch Out For</div>
              <p className="card-body">{result.watchout}</p>
            </div>
 
            <div className="card card-accent-black">
              <div className="card-label">🏷️ Document Type </div>
              <p className="card-body">{result.doctype}</p>
            </div>
 
          </div>
 
          <button className="btn-reset" onClick={handleReset}>
            ← Analyze another document
          </button>
 
        </div>
      )}
 
    </div>
  );

}
