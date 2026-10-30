"use strict";
/*
 * Devagya service-request workflow (certificate requests).
 *
 *   Student query -> intent -> guided form -> request saved -> Request ID -> tracking
 *
 * Rules only, no AI guessing. The form state lives in the browser and is sent
 * back with every message, so the server stays stateless.
 *
 * Requests are saved in a JSON file:
 *   - local run:   ./data/requests.json
 *   - on Vercel:   a temporary folder (NOT permanent, use a real database for production)
 *   - override:    REQUESTS_FILE=/some/path.json
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const CERTS = {
  bonafide: { prefix: "BON", name: "Bonafide Certificate" },
  character: { prefix: "CHR", name: "Character Certificate" }
};

const STATUSES = ["Submitted", "Under Review", "Approved", "Ready for Collection", "Rejected"];
const STEPS = ["name", "roll", "cert", "track_id"];
const LANGS = ["en", "hinglish", "hi"];

/* ---------------------------------------------------------- storage */

let memoryDb = null;

function storePath() {
  if (process.env.REQUESTS_FILE) return process.env.REQUESTS_FILE;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "devagya-requests.json");
  return path.join(__dirname, "data", "requests.json");
}

function loadDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    if (parsed && Array.isArray(parsed.requests)) return parsed;
  } catch (error) {
    // file missing or unreadable: fall through
  }
  return memoryDb || { requests: [] };
}

function saveDb(db) {
  memoryDb = db; // keep a copy so the demo still works if the disk is read-only
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(db, null, 2));
    return true;
  } catch (error) {
    console.error("Could not write requests file, using memory only:", error.message);
    return false;
  }
}

function nextId(db, prefix) {
  let max = 1000;
  for (const r of db.requests) {
    const m = String(r.id).match(new RegExp("^" + prefix + "-(\\d+)$"));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

function createRequest({ certKey, name, roll }) {
  const cert = CERTS[certKey];
  const db = loadDb();
  const now = new Date().toISOString();
  const record = {
    id: nextId(db, cert.prefix),
    certificate: cert.name,
    name,
    roll,
    status: "Submitted",
    createdAt: now,
    updatedAt: now
  };
  db.requests.push(record);
  saveDb(db);
  return record;
}

function findRequest(id) {
  const wanted = String(id || "").toUpperCase();
  return loadDb().requests.find(r => r.id === wanted) || null;
}

function listRequests() {
  return loadDb().requests.slice();
}

function setStatus(id, status) {
  const match = STATUSES.find(s => s.toLowerCase() === String(status || "").trim().toLowerCase());
  if (!match) return { ok: false, error: "Status must be one of: " + STATUSES.join(", ") };

  const db = loadDb();
  const record = db.requests.find(r => r.id === String(id || "").toUpperCase());
  if (!record) return { ok: false, error: "No request with that ID" };

  record.status = match;
  record.updatedAt = new Date().toISOString();
  saveDb(db);
  return { ok: true, request: record };
}

/* ---------------------------------------------------------- language */

function detectLang(text, fallback) {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/\b(mujhe|mera|meri|mere|chahiye|chahie|karna|karni|karne|karo|hai|hain|batao|bataiye|kya|kaise|kab|kahan|ka|ki|ke|aur|nahi|nahin|banwana|banwani|abhi)\b/i.test(text)) {
    return "hinglish";
  }
  return fallback || "en";
}

const T = {
  en: {
    askName: "Sure, I can help you apply for a certificate.\n\nPlease provide your name.",
    askRoll: n => `Thanks, ${n}.\n\nPlease provide your roll number.`,
    askCert: "Which certificate do you require?",
    badName: "Please enter your name using letters only (2 to 60 characters).",
    badRoll: "Please enter a valid roll number (letters, digits, - or /, 4 to 20 characters).",
    badCert: "I can currently process a Bonafide Certificate or a Character Certificate. Which one do you require?",
    created: r =>
      `✅ Your request has been created.\n\n🆔 Request ID: ${r.id}\n📄 Certificate: ${r.certificate}\n👤 Name: ${r.name}\n🎓 Roll No: ${r.roll}\n📌 Status: ${r.status}\n\nKeep your Request ID. You can ask for the status any time.\n\nDemo note: this request is stored only in the demo system. It is not sent to a real university office.`,
    status: (r, d) =>
      `🆔 Request ID: ${r.id}\n📄 Certificate: ${r.certificate}\n👤 Name: ${maskName(r.name)}\n📅 Submitted: ${d}\n📌 Status: ${r.status}\n\nDemo data: this is a prototype record, not an official university status.`,
    notFound: id => `I could not find a request with ID ${id}. Please check the ID and try again.`,
    askId: "Please share your Request ID (for example BON-1001).",
    cancelled: "Okay, I have cancelled this request. Nothing was saved.",
    unverified:
      "I could not verify this information from the official university knowledge base. Please contact the examination office.",
    chipStatus: id => `What is the status of my request ${id}?`
  },
  hinglish: {
    askName: "Zaroor, main certificate apply karne mein help karunga.\n\nApna naam batao.",
    askRoll: n => `Thanks, ${n}.\n\nAb apna roll number batao.`,
    askCert: "Aapko kaunsa certificate chahiye?",
    badName: "Naam sirf letters mein likho (2 se 60 characters).",
    badRoll: "Sahi roll number likho (letters, digits, - ya /, 4 se 20 characters).",
    badCert: "Abhi main Bonafide Certificate ya Character Certificate process kar sakta hoon. Kaunsa chahiye?",
    created: r =>
      `✅ Aapki request ban gayi hai.\n\n🆔 Request ID: ${r.id}\n📄 Certificate: ${r.certificate}\n👤 Naam: ${r.name}\n🎓 Roll No: ${r.roll}\n📌 Status: ${r.status}\n\nRequest ID sambhal ke rakhna. Status kabhi bhi pooch sakte ho.\n\nDemo note: ye request sirf demo system mein save hui hai, kisi real university office ko nahi bheji gayi.`,
    status: (r, d) =>
      `🆔 Request ID: ${r.id}\n📄 Certificate: ${r.certificate}\n👤 Naam: ${maskName(r.name)}\n📅 Submit hui: ${d}\n📌 Status: ${r.status}\n\nDemo data: ye prototype record hai, official university status nahi.`,
    notFound: id => `${id} ID ki koi request nahi mili. ID check karke dobara try karo.`,
    askId: "Apni Request ID batao (jaise BON-1001).",
    cancelled: "Theek hai, request cancel kar di. Kuch save nahi hua.",
    unverified:
      "Ye jaankari main official university knowledge base se verify nahi kar paaya. Kripya examination office se sampark karein.",
    chipStatus: id => `${id} ka status kya hai?`
  },
  hi: {
    askName: "ज़रूर, मैं सर्टिफिकेट के आवेदन में मदद करूँगा।\n\nकृपया अपना नाम बताइए।",
    askRoll: n => `धन्यवाद, ${n}।\n\nकृपया अपना रोल नंबर बताइए।`,
    askCert: "आपको कौन सा सर्टिफिकेट चाहिए?",
    badName: "कृपया नाम केवल अक्षरों में लिखिए (2 से 60 अक्षर)।",
    badRoll: "कृपया सही रोल नंबर लिखिए (अक्षर, अंक, - या /, 4 से 20 अक्षर)।",
    badCert: "अभी मैं Bonafide Certificate या Character Certificate प्रोसेस कर सकता हूँ। कौन सा चाहिए?",
    created: r =>
      `✅ आपकी रिक्वेस्ट बन गई है।\n\n🆔 रिक्वेस्ट ID: ${r.id}\n📄 सर्टिफिकेट: ${r.certificate}\n👤 नाम: ${r.name}\n🎓 रोल नंबर: ${r.roll}\n📌 स्टेटस: ${r.status}\n\nरिक्वेस्ट ID संभालकर रखिए। स्टेटस कभी भी पूछ सकते हैं।\n\nडेमो नोट: यह रिक्वेस्ट केवल डेमो सिस्टम में सेव हुई है, किसी असली विश्वविद्यालय कार्यालय को नहीं भेजी गई।`,
    status: (r, d) =>
      `🆔 रिक्वेस्ट ID: ${r.id}\n📄 सर्टिफिकेट: ${r.certificate}\n👤 नाम: ${maskName(r.name)}\n📅 जमा हुई: ${d}\n📌 स्टेटस: ${r.status}\n\nडेमो डेटा: यह प्रोटोटाइप रिकॉर्ड है, आधिकारिक विश्वविद्यालय स्टेटस नहीं।`,
    notFound: id => `ID ${id} की कोई रिक्वेस्ट नहीं मिली। कृपया ID जाँचकर फिर कोशिश करें।`,
    askId: "कृपया अपनी रिक्वेस्ट ID बताइए (जैसे BON-1001)।",
    cancelled: "ठीक है, रिक्वेस्ट रद्द कर दी। कुछ सेव नहीं हुआ।",
    unverified:
      "मैं यह जानकारी आधिकारिक विश्वविद्यालय ज्ञान-आधार से सत्यापित नहीं कर पाया। कृपया परीक्षा कार्यालय से संपर्क करें।",
    chipStatus: id => `${id} का स्टेटस क्या है?`
  }
};

const CHIP_CANCEL = { en: "Cancel", hinglish: "Cancel", hi: "रद्द करें" };

function maskName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first ? first.charAt(0) + "***" : "***";
}

/* ---------------------------------------------------------- intent */

const ID_RE = /\b(BON|CHR)\s?-?\s?(\d{3,6})\b/i;

const CERT_WORDS = /bonafide|bonafied|bonafid|bonofide|bona fide|character certificate|certificate|प्रमाण ?पत्र|बोनाफाइड|बोनाफ़ाइड|सर्टिफिकेट|चरित्र/i;
const APPLY_WORDS = /\b(apply|applying|application|banwana|banwani|banwa|banao|request karna|chahiye|chahie)\b|आवेदन|अप्लाई|चाहिए|बनवान/i;
const STRONG_APPLY = /\b((i|we) (need|want|require) (a |an |the )?(bonafide|bonafied|character)|want to apply|like to apply|need to apply|apply karna hai|apply karni hai|apply karna chahta|apply karna chahti)\b|अप्लाई करना|आवेदन करना/i;
const INFO_WORDS = /\b(how|what|which|where|when|why|kaise|kya|kaun|kab|kahan|kitne|kitna|process|procedure|information|info|details|jaankari|requirement|requirements|required|eligibility|fees?|charges?|documents?)\b|जानकारी|कैसे|क्या|कब|कहाँ|कहां|कितने/i;
const TRACK_NO_ID = /\b(track|status)\b.*\b(request|application)\b|\b(request|application)\b.*\b(track|status)\b|मेरी रिक्वेस्ट|रिक्वेस्ट का स्टेटस/i;

const TIMETABLE_WORDS = /\b(time ?table|timetable)\b|टाइम ?टेबल/i;
const TIMETABLE_SPECIFIC = /\b(exact|next|upcoming|new|detailed|final|agla|agle|nayi)\b|अगला|अगले|सटीक/i;
const NO_RECORD_WORDS = /\b(date ?sheet|results?|marks|marksheet|admit card|syllabus|backlog|re-?evaluation|revaluation)\b|रिज़?ल्ट|सिलेबस|एडमिट कार्ड/i;

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isCancel(text) {
  const t = normalizeText(text).replace(/[.!?]+$/g, "");
  return [
    "cancel", "cancel it", "cancel request", "stop", "exit", "quit", "nevermind", "never mind",
    "rehne do", "rehne de", "cancel karo", "band karo",
    "रद्द करें", "रद्द", "कैंसिल", "रहने दो", "छोड़ो"
  ].includes(t);
}

function extractId(text) {
  const m = String(text || "").match(ID_RE);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

function detectIntent(text) {
  const t = String(text || "");

  if (extractId(t)) return "track";
  if (TRACK_NO_ID.test(t)) return "track_no_id";

  if (CERT_WORDS.test(t) && (STRONG_APPLY.test(t) || (APPLY_WORDS.test(t) && !INFO_WORDS.test(t)))) {
    return "apply";
  }

  if (TIMETABLE_WORDS.test(t) && TIMETABLE_SPECIFIC.test(t)) return "unverified";
  if (NO_RECORD_WORDS.test(t)) return "unverified";

  return "other";
}

/* ---------------------------------------------------------- state */

function sanitizeState(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.type !== "cert" || !STEPS.includes(raw.step)) return null;

  const data = raw.data && typeof raw.data === "object" ? raw.data : {};

  return {
    type: "cert",
    step: raw.step,
    lang: LANGS.includes(raw.lang) ? raw.lang : "en",
    data: {
      name: typeof data.name === "string" ? data.name.slice(0, 60) : "",
      roll: typeof data.roll === "string" ? data.roll.slice(0, 20) : ""
    }
  };
}

function cleanName(text) {
  return String(text || "")
    .trim()
    .replace(/^(my name is|i am|i'm|mera naam|mera name|naam|name)\s*[:\-]?\s*/i, "")
    .replace(/\s+(hai|है)\s*$/i, "")
    .trim();
}

function cleanRoll(text) {
  return String(text || "")
    .trim()
    .replace(/^(my )?(roll( no| number)?|mera roll( no| number)?)\s*(is)?\s*[:\-]?\s*/i, "")
    .replace(/\s+(hai|है)\s*$/i, "")
    .trim();
}

function parseCert(text) {
  const t = normalizeText(text);
  if (/bonafide|bonafied|bonafid|bonofide|bona fide|बोनाफाइड|बोनाफ़ाइड/.test(t) || t === "1") return "bonafide";
  if (/character|चरित्र|कैरेक्टर/.test(t) || t === "2") return "character";
  return null;
}

/* ---------------------------------------------------------- responses */

function reply(lang, intent, answer, suggestions, workflow) {
  return {
    answer,
    intent,
    demoData: true,
    lang,
    suggestions: suggestions || [],
    workflow: workflow || null
  };
}

function certChips(lang) {
  return [CERTS.bonafide.name, CERTS.character.name, CHIP_CANCEL[lang]];
}

function trackReply(id, lang) {
  const record = findRequest(id);

  if (!record) return reply(lang, "request_status", T[lang].notFound(id));

  const date = new Date(record.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });

  return reply(lang, "request_status", T[lang].status(record, date));
}

/* ---------------------------------------------------------- main entry */

/**
 * Returns a chat response object, or null if this message is not part of the
 * workflow (the normal knowledge-base chatbot then answers it).
 */
function handle(question, rawState) {
  const text = String(question || "").trim();
  const state = sanitizeState(rawState);

  // ---- a form is in progress ----
  if (state) {
    const lang = state.lang;

    if (isCancel(text)) {
      return reply(lang, "workflow_cancelled", T[lang].cancelled);
    }

    if (state.step === "track_id") {
      const id = extractId(text);
      if (!id) return reply(lang, "request_status", T[lang].askId, [], state);
      return trackReply(id, lang);
    }

    if (state.step === "name") {
      const name = cleanName(text);
      if (!/^[\p{L}][\p{L}\p{M} .'\-]{1,59}$/u.test(name)) {
        return reply(lang, "workflow", T[lang].badName, [CHIP_CANCEL[lang]], state);
      }
      const next = { ...state, step: "roll", data: { ...state.data, name } };
      return reply(lang, "workflow", T[lang].askRoll(name), [CHIP_CANCEL[lang]], next);
    }

    if (state.step === "roll") {
      const roll = cleanRoll(text);
      if (!/^[A-Za-z0-9][A-Za-z0-9\-\/]{3,19}$/.test(roll)) {
        return reply(lang, "workflow", T[lang].badRoll, [CHIP_CANCEL[lang]], state);
      }
      const next = { ...state, step: "cert", data: { ...state.data, roll } };
      return reply(lang, "workflow", T[lang].askCert, certChips(lang), next);
    }

    if (state.step === "cert") {
      const certKey = parseCert(text);
      if (!certKey) {
        return reply(lang, "workflow", T[lang].badCert, certChips(lang), state);
      }
      const record = createRequest({
        certKey,
        name: state.data.name,
        roll: state.data.roll
      });
      return reply(lang, "request_created", T[lang].created(record), [T[lang].chipStatus(record.id)], null);
    }
  }

  // ---- no form in progress: look at what the message is ----
  const intent = detectIntent(text);
  const lang = detectLang(text, "en");

  if (intent === "track") {
    return trackReply(extractId(text), lang);
  }

  if (intent === "track_no_id") {
    return reply(lang, "request_status", T[lang].askId, [], {
      type: "cert", step: "track_id", lang, data: { name: "", roll: "" }
    });
  }

  if (intent === "apply") {
    return reply(lang, "workflow", T[lang].askName, [CHIP_CANCEL[lang]], {
      type: "cert", step: "name", lang, data: { name: "", roll: "" }
    });
  }

  if (intent === "unverified") {
    return reply(lang, "unverified", T[lang].unverified);
  }

  return null;
}

module.exports = {
  handle,
  detectIntent,
  setStatus,
  findRequest,
  listRequests,
  STATUSES
};
