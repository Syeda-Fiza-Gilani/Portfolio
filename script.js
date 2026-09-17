/* ==========================================================================
   PORTFOLIO CHAT ASSISTANT
   --------------------------------------------------------------------------
   Path B from the brief: a custom chat UI, wired to a free LLM API tier,
   with spoken replies via the browser's built-in Web Speech API.

   DEPLOYMENT (Vercel):
   The browser never talks to Groq directly and never holds an API key.
   Instead it calls this site's own /api/chat endpoint (see api/chat.js),
   a Vercel Serverless Function that attaches process.env.GROQ_API_KEY on
   the server and forwards the request. Set that environment variable in
   your Vercel project settings, then redeploy — see api/chat.js for the
   exact steps.

   Notes on cost and load:
   - Groq's free tier is enough for a personal portfolio's traffic.
   - The chat and voice logic below only run when the visitor opens the
     chat widget, so they add no load to the page on first paint.
   - No build step, no extra libraries, nothing to install locally.
   ========================================================================== */

// -----------------------------------------------------------------------
// 1. DOM references
// -----------------------------------------------------------------------
const chatToggle = document.getElementById("chatToggle");
const chatPanel = document.getElementById("chatPanel");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMute = document.getElementById("chatMute");
const chatStatus = document.getElementById("chatStatus");
const chatOrb = document.getElementById("chatOrb");

// Conversation history sent to the API each turn, so replies stay in context.
// The system prompt is added server-side in api/chat.js, not here, so it
// can't be inspected or overridden from the browser.
const conversation = [];

let voiceEnabled = true;

// -----------------------------------------------------------------------
// 2. Open / close the chat panel
// -----------------------------------------------------------------------

chatToggle.addEventListener("click", () => {
  const isOpen = chatPanel.hasAttribute("hidden") === false;

  if (isOpen) {
    chatPanel.setAttribute("hidden", "");        // panel closes
    chatToggle.setAttribute("aria-expanded", "false");
  } else {
    chatPanel.removeAttribute("hidden");         // panel opens
    chatToggle.setAttribute("aria-expanded", "true");
    chatInput.focus();
  }
});
// -----------------------------------------------------------------------
// 3. Sending a message
// -----------------------------------------------------------------------
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = chatInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  conversation.push({ role: "user", content: text });
  chatInput.value = "";
  chatInput.disabled = true;

  const typingEl = addTypingIndicator();

  try {
    const reply = await askAssistant(conversation);
    conversation.push({ role: "assistant", content: reply });
    typingEl.remove();
    addMessage(reply, "bot");
    if (voiceEnabled) speak(reply);
  } catch (err) {
    typingEl.remove();
    addMessage(
      "Sorry — I couldn't reach the assistant just now. Please try again in a moment, or email Fiza directly.",
      "bot"
    );
    console.error("Chat error:", err);
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

// -----------------------------------------------------------------------
// 4. Call the site's own /api/chat serverless function
//    (this is what forwards to Groq — see api/chat.js for that side)
// -----------------------------------------------------------------------
async function askAssistant(messages) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data.reply || "I'm not sure how to answer that.";
}

// -----------------------------------------------------------------------
// 5. Rendering messages
// -----------------------------------------------------------------------
function addMessage(text, who) {
  const el = document.createElement("div");
  el.className = `msg msg--${who}`;
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return el;
}

function addTypingIndicator() {
  const el = document.createElement("div");
  el.className = "msg msg--bot msg--typing";
  el.textContent = "Typing…";
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return el;
}

// -----------------------------------------------------------------------
// 6. Voice replies — native Web Speech API (free, no API key, no server)
// -----------------------------------------------------------------------
let cachedVoice = null;

function pickNaturalVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Preference order: well-known natural-sounding English voices first,
  // then any English voice, then whatever the browser has by default.
  const preferredNames = [
    "Microsoft Aria Online (Natural)",
    "Microsoft Jenny Online (Natural)",
    "Samantha", // macOS/iOS
  ];

  for (const name of preferredNames) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }

  const anyEnglish = voices.find((v) => v.lang && v.lang.startsWith("en"));
  return anyEnglish || voices[0];
}

// Voice lists load asynchronously in some browsers, so listen for the event
// and also try immediately in case they're already available.
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickNaturalVoice();
  };
  cachedVoice = pickNaturalVoice();
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;

  // Cancel any reply still being read before starting the next one.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = cachedVoice || pickNaturalVoice();
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  // The rings only ripple for as long as this utterance is actually being
  // spoken out loud — that's the whole effect, tied directly to real events
  // from the browser's speech engine rather than a fixed-length animation.
  utterance.onstart = () => chatOrb.classList.add("is-speaking");
  utterance.onend = () => chatOrb.classList.remove("is-speaking");
  utterance.onerror = () => chatOrb.classList.remove("is-speaking");

  window.speechSynthesis.speak(utterance);
}

// -----------------------------------------------------------------------
// 7. Mute / unmute spoken replies
// -----------------------------------------------------------------------
chatMute.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  chatMute.setAttribute("aria-pressed", String(!voiceEnabled));
  chatMute.textContent = voiceEnabled ? "🔊" : "🔇";
  chatStatus.textContent = voiceEnabled ? "Voice replies on" : "Voice replies off";

  if (!voiceEnabled) {
    window.speechSynthesis.cancel();
    chatOrb.classList.remove("is-speaking");
  }
});
