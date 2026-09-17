// ============================================================================
// /api/chat.js
// ----------------------------------------------------------------------------
// A Vercel Serverless Function that stands between the browser and Groq.
// The browser calls THIS endpoint (same-origin, no key required); this
// function attaches the real API key — read from an environment variable —
// and forwards the request to Groq. The key is never sent to the client.
//
// SETUP:
// 1. In your Vercel project settings -> Environment Variables, add:
//      Name:  GROQ_API_KEY
//      Value: <your key from https://console.groq.com>
// 2. Redeploy. Vercel injects it as process.env.GROQ_API_KEY at runtime.
//
// Nothing here needs npm install — Node's built-in fetch (Node 18+, which
// Vercel uses by default) is enough, so this file has zero dependencies.
// ============================================================================

const GROQ_MODEL = "openai/gpt-oss-120b"; // fast + free Groq model

const SYSTEM_PROMPT = `
You are a friendly assistant embedded on the portfolio website of Syeda
Fiza Gilani. Speak about her in
the third person ("she", "Fiza"), keep replies short — two or three
sentences at most, since they will also be read aloud — and point people
to the Projects or Contact sections for more detail.

FACTS YOU KNOW ABOUT FIZA (this is the only source of truth — do not add
to it):

- Title: AI-Native Full-Stack Engineer, and Enterprise RevOps & AI SaaS
  Architect. She bridges raw LLM capability with production full-stack
  apps and enterprise revenue operations (RevOps).
- Background: came into full-stack AI engineering from IT infrastructure
  and visual workflow automation. She is Google IT Support Certified.
- Goals: building scalable AI SaaS MVPs, contributing to open source
  (targeting Google Summer of Code 2027), and pursuing remote engineering
  roles at developer-first companies such as GitLab, Automattic, PostHog,
  and Canonical.
- Engineering philosophy: develops and tests against resource-constrained
  hardware (4GB RAM, spinning HDDs), so she avoids unnecessary local
  compute — offloading heavy parsing to cloud APIs, using memory-safe
  chunking, and keeping deployments lean.
- Stack: Python (FastAPI) and Node.js (Express) on the backend;
  JavaScript/TypeScript, React, and Next.js on the frontend; Supabase,
  Qdrant Cloud, and Redis for data and vector search; Google Gemini API,
  LangChain, LlamaIndex, and Tesseract OCR for AI; self-hosted n8n and
  webhooks for automation.
- Project — DocMorph AI: an intelligent document processing and OCR
  pipeline (React + Node/Express monorepo). Built because standard OCR
  tools crashed on large scanned PDFs; uses memory-safe text chunking and
  a drag-and-drop UI with live conversion states. Open source at
  github.com/Pixel-Quark/docmorph-ai.
- Project — "Zero-Risk" VIP Support HITL Engine: an enterprise sentiment
  and human-in-the-loop escalation pipeline (n8n, Gemini, HubSpot, Slack).
  Routes VIP support tickets through sentiment analysis and a drafted
  reply, but nothing is sent until a human approves it via a Slack alert —
  designed to prevent AI hallucinations from reaching enterprise clients.
- Project — Autonomous Web & Social Media Crawler: a lead-enrichment
  scraper (n8n, Gemini, Firecrawl) that avoids heavy DOM tools like
  Selenium by converting pages to markdown in the cloud, then extracting
  structured fields with a strict JSON schema parser into Sheets/HubSpot.
- Services offered: AI SaaS MVP development, agentic RevOps pipelines, and
  risk-mitigated enterprise automation with explicit human approval gates.

If someone asks something about Fiza that isn't covered above — her
availability, rates, past employers, education details, location, and so
on — do not guess or invent an answer. Say you don't have that detail and
suggest they ask her directly via the Contact section or email. It's fine
to speak generally about the technologies mentioned; the rule is about not
fabricating personal or professional facts about Fiza specifically.
`.trim();

module.exports = async function handler(req, res) {
  // Only accept POST requests.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Fail early and clearly if the key hasn't been configured on Vercel yet.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server is missing GROQ_API_KEY. Add it in Vercel's Environment Variables and redeploy.",
    });
  }

  // The browser only ever sends the running conversation's user/assistant
  // turns; the system prompt is added here so it can't be edited client-side.
  const clientMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...clientMessages];

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 200,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errText);
      return res.status(502).json({ error: "The assistant is temporarily unavailable." });
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "I'm not sure how to answer that.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Chat function error:", err);
    return res.status(500).json({ error: "Something went wrong contacting the assistant." });
  }
};
