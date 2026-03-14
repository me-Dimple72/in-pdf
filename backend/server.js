const path = require("path");


require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const GROQ_KEY = process.env.GROQ_API_KEY;

app.get("/api/health", (req, res) => {
  res.json({
    status:   "ok",
    message:  "DISTILL backend running ✅",
    groq_key: GROQ_KEY ? "✅ loaded" : "❌ MISSING — add GROQ_API_KEY to .env",
  });
});

function buildPrompt(text) {
  return `You are an expert document analyst.
 
Carefully read the document below and return ONLY a valid JSON object.
No markdown, no backticks, no explanation before or after — just the raw JSON.
 
{
  "tldr": "One powerful sentence summarizing the entire document (max 30 words)",
  "summary": "A comprehensive 3-4 paragraph summary covering what the document is, main findings, conclusions, and significance. Write in clear direct prose.",
  "actions": ["Specific action item 1", "Specific action item 2", "Specific action item 3", "Specific action item 4", "Specific action item 5"],
  "facts": ["Key fact, number, or statistic 1", "Key fact 2", "Key fact 3", "Key fact 4", "Key fact 5"],
  "watchout": "2-3 sentences describing risks, red flags, deadlines, obligations, or critical warnings the reader must know.",
  "doctype": "Document type (e.g. Research Paper, Legal Contract, Financial Report, Technical Manual) and its intended audience in one sentence."
}
 
Rules:
- actions: 4-6 specific things the reader should DO after reading this
- facts: 4-6 specific numbers, dates, names, or direct claims from the document
- Return ONLY the JSON — nothing before it, nothing after it
Document:
${text}`;
}
 
 // ── Strip markdown fences & parse JSON safely ─────────────────
function parseJSON(rawText) {
  const cleaned = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(cleaned);
}
 
// ── Call Groq API ─────────────────────────────────────────────
async function callGroq(prompt) {
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model:       "llama-3.3-70b-versatile",
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens:  1500,
    },
    {
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type":  "application/json",
      },
      timeout: 30000, // 30 second timeout
    }
  );
 
  return response.data.choices[0].message.content;
}
 
// ── Main Summarize Route ──────────────────────────────────────
app.post("/api/summarize", async (req, res) => {
 
  try {
 
    // ── Check API key exists ──────────────────────────────────
    if (!GROQ_KEY) {
      return res.status(500).json({
        error: "GROQ_API_KEY is missing. Add it to your .env file. Get free key at console.groq.com"
      });
    }
 
    // ── Validate request body ─────────────────────────────────
    const { text } = req.body;
 
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "No text provided in request body." });
    }
 
    if (text.trim().length < 50) {
      return res.status(400).json({
        error: "Not enough text extracted. PDF may be scanned, image-based, or empty."
      });
    }
 
    // ── Truncate to stay within token limits ──────────────────
    const truncated = text.length > 50000
      ? text.substring(0, 50000) + "\n\n[Document truncated for analysis...]"
      : text;
 
    console.log(`📄 Processing document: ${truncated.length} characters`);
 
    // ── Build prompt and call Groq ────────────────────────────
    const prompt  = buildPrompt(truncated);
    const rawText = await callGroq(prompt);
 
    console.log("✅ Groq responded successfully");
 
    // ── Parse the AI response ─────────────────────────────────
    let parsed;
    try {
      parsed = parseJSON(rawText);
    } catch (parseErr) {
      console.error("❌ JSON parse failed. Raw AI response:\n", rawText);
      return res.status(500).json({
        error: "AI returned malformed response. Please try again."
      });
    }
 
    // ── Validate parsed result has required fields ────────────
    const required = ["tldr", "summary", "actions", "facts", "watchout", "doctype"];
    for (const field of required) {
      if (!parsed[field]) parsed[field] = field === "actions" || field === "facts" ? [] : "Not available";
    }
 
    // ── Send back to frontend ─────────────────────────────────
    return res.json({ success: true, data: parsed });
 
  } catch (error) {
 
    // ── Handle Groq API errors ────────────────────────────────
    if (error.response) {
      const status  = error.response.status;
      const message = error.response.data?.error?.message || "";
 
      console.error(`❌ Groq API error ${status}:`, message);
 
      if (status === 401) {
        return res.status(500).json({
          error: "Invalid Groq API key. Check your GROQ_API_KEY in .env file."
        });
      }
      if (status === 429) {
        return res.status(500).json({
          error: "Groq rate limit hit. Wait 1 minute and try again."
        });
      }
      if (status === 400) {
        return res.status(500).json({
          error: "Bad request to Groq. The document may be too large or contain unsupported characters."
        });
      }
 
      return res.status(500).json({ error: `Groq API error: ${status} — ${message}` });
    }
 
    // ── Handle network/timeout errors ─────────────────────────
    if (error.code === "ECONNABORTED") {
      return res.status(500).json({
        error: "Request timed out. The document may be too large. Try a smaller PDF."
      });
    }
 
    console.error("❌ Unexpected error:", error.message);
    return res.status(500).json({ error: "Server error: " + error.message });
  }
 
});
  
app.use(express.static(path.join(__dirname, "../build")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});



// ── Start Server ──────────────────────────────────────────────
app.listen(5000, () => {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   DISTILL Backend Running on Port 5000   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\n📌 Routes:");
  console.log("   GET  /api/health    → Check server status");
  console.log("   POST /api/summarize → Summarize PDF text");
  console.log("\n🔑 API Keys:");
  console.log("   Groq:", GROQ_KEY ? "✅ Loaded" : "❌ MISSING — add GROQ_API_KEY to .env");
 
  if (!GROQ_KEY) {
    console.log("\n⚠️  Get your FREE Groq key at: console.groq.com");
    console.log("   Then add to backend/.env:");
    console.log("   GROQ_API_KEY=gsk_your_key_here\n");
  } else {
    console.log("\n✅ Ready to summarize PDFs!\n");
  }
});
   