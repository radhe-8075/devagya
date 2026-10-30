
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const knowledgeBase = require("./knowledge-base");
const workflow = require("./workflow");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Local run: serve the public/ folder. On Vercel, files in public/ are served by the CDN instead.
app.use(express.static(path.join(__dirname, "public"), { dotfiles: "deny" }));

// Only treat the key as real if it is not the placeholder from .env.example.
const rawKey = (process.env.OPENAI_API_KEY || "").trim();
const hasRealKey = rawKey.length > 20 && !/your_api_key|here/i.test(rawKey);

const ai = hasRealKey
  ? new OpenAI({ apiKey: rawKey, timeout: 8000, maxRetries: 0 })
  : null;

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(text, words) {
  const tokens = new Set(text.split(" "));

  return words.some(word => {
    const w = normalize(word);
    if (!w) return false;

    // Very short words must match a whole word ("sir" must not match "sirf").
    if (w.length <= 3 && !w.includes(" ")) return tokens.has(w);

    return text.includes(w);
  });
}

// ----- typo tolerance: "facluty" -> "faculty", "hostle" -> "hostel" -----
const VOCAB = [
  "library", "hostel", "hostels", "faculty", "teacher", "teachers",
  "professor", "scholarship", "certificate", "document", "documents",
  "marksheet", "timetable", "attendance", "examination", "semester",
  "mechanical", "electronics", "computer", "science", "structures",
  "marketing", "management", "mathematics", "english", "canteen",
  "cafeteria", "admission", "admissions", "accounts", "question",
  "previous", "tuition", "transport", "installment", "registration",
  "workshop", "hackathon", "department", "student", "services"
];

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);

  for (let j = 1; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );

      // swapped neighbouring letters ("facluty") count as one mistake
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[a.length][b.length];
}

function fuzzyFix(text) {
  return text
    .split(" ")
    .map(token => {
      if (
        token.length < 5 ||
        /\d/.test(token) ||
        /[^\x00-\x7F]/.test(token) ||
        VOCAB.includes(token)
      ) {
        return token;
      }

      const maxDistance = token.length >= 9 ? 2 : 1;
      let best = token;
      let bestDistance = maxDistance + 1;

      for (const word of VOCAB) {
        if (Math.abs(word.length - token.length) > maxDistance) continue;

        const distance = editDistance(token, word);

        if (distance < bestDistance) {
          bestDistance = distance;
          best = word;
        }
      }

      return bestDistance <= maxDistance ? best : token;
    })
    .join(" ");
}

// Common Hindi (Devanagari) words mapped to the English words the matcher knows.
const HINDI_ALIASES = [
  ["लाइब्रेरी", "library"], ["पुस्तकालय", "library"], ["कैंटीन", "canteen"],
  ["अकाउंट्स", "accounts"], ["अकाउंट", "accounts"], ["ऑफिस", "office"],
  ["ऑफ़िस", "office"], ["एडमिशन", "admission"], ["स्टूडेंट", "student"],
  ["सर्विसेज", "services"], ["डेस्क", "desk"], ["इंग्लिश", "english"],
  ["अंग्रेज़ी", "english"], ["अंग्रेजी", "english"], ["गणित", "maths"],
  ["हॉस्टल", "hostel"], ["लड़कियों", "girls"], ["लड़कों", "boys"],
  ["फीस", "fee"], ["ट्यूशन", "tuition"], ["ट्रांसपोर्ट", "transport"],
  ["परीक्षा", "exam"], ["अटेंडेंस", "attendance"], ["टाइमटेबल", "timetable"],
  ["स्कॉलरशिप", "scholarship"], ["रूम", "room"], ["कमरा", "room"],
  ["टीचर", "teacher"], ["अध्यापक", "teacher"], ["शिक्षक", "teacher"],
  ["लिस्ट", "list"], ["उसका", "uska"], ["उनका", "unka"], ["इसका", "iska"],
  ["उसकी", "uski"], ["इसकी", "iski"], ["सेमेस्टर", "semester"], ["पेपर", "paper"],
  ["गर्ल्स", "girls"], ["बॉयज़", "boys"], ["बॉयज", "boys"], ["एचओडी", "hod"],
  ["सीएसई", "cse"], ["एमबीए", "mba"], ["केबिन", "cabin"], ["डेटा स्ट्रक्चर", "data structures"],
  ["डेटा स्ट्रक्चर्स", "data structures"], ["छात्रवृत्ति", "scholarship"], ["उपस्थिति", "attendance"],
  ["दस्तावेज़", "documents"], ["दस्तावेज", "documents"], ["छात्रावास", "hostel"]
]
  .map(([hindi, english]) => [normalize(hindi), english])
  .filter(([hindi]) => hindi.length >= 2)
  .sort((a, b) => b[0].length - a[0].length);

function applyAliases(text) {
  let out = text;

  for (const [hindi, english] of HINDI_ALIASES) {
    out = out.split(hindi).join(" " + english + " ");
  }

  return out.replace(/\s+/g, " ").trim();
}

function extractDetails(question) {
  const q = fuzzyFix(applyAliases(normalize(question)));

  const course = contains(q, [
    "mba",
    "एमबीए"
  ])
    ? "MBA"
    : contains(q, [
        "btech",
        "b.tech",
        "b tech",
        "बीटेक"
      ])
      ? "B.Tech"
      : "";

  let branch = "";

  if (contains(q, [
    "csed",
    "cse",
    "computer science",
    "सीएसई"
  ])) {
    branch = "CSE";
  } else if (contains(q, [
    "ece",
    "electronics"
  ])) {
    branch = "ECE";
  } else if (contains(q, [
    "mechanical"
  ])) {
    branch = "Mechanical Engineering";
  } else if (course === "MBA") {
    branch = "MBA";
  }

  const roomMatch = q.match(
    /(?:room|कमरा|रूम)\s*(?:number|no\.?)?\s*(\d{2,5})|\b(3001)\b/
  );

  const semesterMatch = q.match(
    /(?:semester|sem|सेमेस्टर)\s*(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s*(?:semester|sem)/
  );

  const yearMatch = q.match(/\b(202[2-9])\b/);

  const subjectAliases = [
    {
      name: "Data Structures",
      words: [
        "data structures",
        "data structure",
        "dsa",
        "डेटा स्ट्रक्चर"
      ]
    },
    {
      name: "Marketing Management",
      words: [
        "marketing management",
        "marketing"
      ]
    },
    {
      name: "Digital Electronics",
      words: [
        "digital electronics"
      ]
    },
    {
      name: "English",
      words: [
        "english",
        "अंग्रेजी",
        "इंग्लिश"
      ]
    },
    {
      name: "Mathematics",
      words: [
        "maths",
        "math",
        "mathematics",
        "गणित"
      ]
    }
  ];

  const subject =
    subjectAliases.find(item => contains(q, item.words))?.name || "";

  let feeTypeGiven = contains(q, [
    "hostel fee", "hostel fees", "transport", "bus fee", "bus fees",
    "exam fee", "exam fees", "examination fee", "refund", "late fee",
    "late fine", "installment", "instalment", "tuition"
  ]);

  let feeType = "tuition";

  if (contains(q, ["hostel fee", "hostel fees"])) {
    feeType = "hostel";
  } else if (contains(q, ["transport", "bus fee", "bus fees"])) {
    feeType = "transport";
  } else if (contains(q, ["exam fee", "exam fees", "examination fee"])) {
    feeType = "exam";
  } else if (contains(q, ["refund", "वापसी"])) {
    feeType = "refund";
  } else if (contains(q, ["late fee", "late fine"])) {
    feeType = "late";
  } else if (contains(q, ["installment", "instalment", "किस्त"])) {
    feeType = "installment";
  }

  const introIntent = contains(q, [
    "who are you",
    "who r you",
    "who are u",
    "what are you",
    "what is your name",
    "tell me your name",
    "introduce yourself",
    "your introduction",
    "tell me about yourself",
    "what can you do",
    "what do you do",
    "what is your purpose",
    "who made you",
    "who created you",
    "who developed you",
    "who is your developer",
    "who is your creator",
    "who built you",
    "how can you help me",
    "tum kaun ho",
    "tum kon ho",
    "tum koun ho",
    "aap kaun ho",
    "aap kon ho",
    "aap kaun hain",
    "tu kaun hai",
    "tu kon hai",
    "devagya kaun hai",
    "devagya kon hai",
    "devagya kya hai",
    "tum kya ho",
    "aap kya ho",
    "tum kya karte ho",
    "aap kya karte ho",
    "tum kya kar sakte ho",
    "aap kya kar sakte ho",
    "tumhara naam kya hai",
    "aapka naam kya hai",
    "apna introduction do",
    "apna intro do",
    "apna parichay do",
    "apne baare mein batao",
    "apne bare mein batao",
    "mujhe apna intro do",
    "tumhe kisne banaya",
    "aapko kisne banaya",
    "devagya ko kisne banaya",
    "तुम कौन हो",
    "आप कौन हो",
    "आप कौन हैं",
    "तुम क्या हो",
    "तुम्हारा नाम क्या है",
    "अपना परिचय दो",
    "अपने बारे में बताओ",
    "देवज्ञ कौन है",
    "देवज्ञ क्या है"
  ]);

  const scholarshipIntent = contains(q, [
    "up scholarship",
    "यूपी स्कॉलरशिप",
    "यूपी छात्रवृत्ति"
  ]);

  const certificateIntent = contains(q, [
    "certificate",
    "bonafide",
    "character certificate",
    "migration certificate",
    "provisional certificate",
    "degree certificate",
    "सर्टिफिकेट",
    "प्रमाण पत्र",
    "बोनाफाइड"
  ]);

  const documentIntent = contains(q, [
    "documents",
    "document",
    "marksheet",
    "transcript",
    "id card",
    "fee receipt",
    "duplicate document",
    "दस्तावेज",
    "कागजात",
    "मार्कशीट",
    "आईडी कार्ड"
  ]);

  const eventIntent = contains(q, [
    "event",
    "fest",
    "hackathon",
    "workshop",
    "seminar",
    "cultural fest",
    "registration",
    "कार्यक्रम",
    "इवेंट",
    "हैकाथॉन",
    "वर्कशॉप",
    "सेमिनार"
  ]);

  const paperIntent = contains(q, [
    "paper",
    "papers",
    "question paper",
    "previous year",
    "previous-year",
    "pyq",
    "paper do",
    "paper chahiye",
    "प्रश्न पत्र",
    "पुराना पेपर"
  ]);

  const hostelIntent = contains(q, [
    "hostel",
    "hostels",
    "हॉस्टल",
    "छात्रावास"
  ]);

  const facultyIntent = contains(q, [
    "teacher",
    "teachers",
    "faculty",
    "professor",
    "sir",
    "cabin",
    "baithte",
    "baithti",
    "madam",
    "hod",
    "head of department",
    "dr ",
    "dr.",
    "टीचर",
    "सर",
    "मैम",
    "अध्यापक",
    "शिक्षक"
  ]);

  const campusIntent = contains(q, [
    "library",
    "central library",
    "cafe gd",
    "café gd",
    "subway",
    "canteen",
    "cafeteria",
    "accounts office",
    "admission office",
    "admissions office",
    "help desk",
    "student services",
    "nearby",
    "near ",
    "location",
    "where is",
    "kahan hai",
    "kahan par hai",
    "kidhar hai",
    "कहाँ है",
    "लोकेशन"
  ]);

  const roomIntent =
    Boolean(roomMatch) ||
    contains(q, [
      "which block",
      "kis block",
      "किस ब्लॉक",
      "room number",
      "कमरा नंबर"
    ]);

  const feeIntent = contains(q, [
    "fee",
    "fees",
    "फीस",
    "शुल्क",
    "tuition",
    "installment",
    "refund",
    "late fine",
    "paisa",
    "kharcha",
    "खर्च"
  ]);

  const examIntent = contains(q, [
    "exam",
    "examination",
    "date sheet",
    "परीक्षा",
    "एग्जाम"
  ]);

  const academicIntent = contains(q, [
    "attendance",
    "scholarship",
    "timetable",
    "class timing",
    "result"
  ]);

  const designation = contains(q, [
    "hod",
    "head of department"
  ])
    ? "HOD"
    : q.includes("assistant professor")
      ? "Assistant Professor"
      : q.includes("associate professor")
        ? "Associate Professor"
        : q.includes("professor")
          ? "Professor"
          : "";

  const nameMatch = q.match(
    /\b(?:dr\.?|doctor|prof\.?|professor|mr\.?|mrs\.?|ms\.?)\s+([a-z]+(?:\s+[a-z]+){0,1})/i
  );

  let intent = "unknown";

  if (introIntent) intent = "intro";
  else if (scholarshipIntent || (contains(q, ["scholarship"]) && documentIntent)) intent = "scholarship";
  else if (certificateIntent) intent = "certificate";
  else if (documentIntent) intent = "document";
  else if (eventIntent) intent = "event";
  else if (paperIntent) intent = "paper";
  else if (hostelIntent && !feeIntent) intent = "hostel";
  else if (facultyIntent || (subject && !examIntent && !feeIntent)) intent = "faculty";
  else if (roomIntent) intent = "room";
  else if (feeIntent) intent = "fee";
  else if (examIntent) intent = "exam";
  else if (campusIntent) intent = "campus";
  else if (academicIntent) intent = "academic";

  if (intent === "fee" && hostelIntent && !feeTypeGiven) {
    feeType = "hostel";
    feeTypeGiven = true;
  }

  return {
    q,
    intent,
    course,
    branch,
    room: roomMatch ? roomMatch[1] || roomMatch[2] : "",
    semester: semesterMatch
      ? semesterMatch[1] || semesterMatch[2]
      : "",
    year: yearMatch ? Number(yearMatch[1]) : null,
    subject,
    feeType,
    feeTypeGiven,
    designation,
    name: nameMatch ? nameMatch[0] : ""
  };
}

// ---------------------------------------------------------------
// CONVERSATION MEMORY
// The browser sends back a small "context" object from the last
// answer, so follow-ups like "aur MBA ki?" or "uska room kaunsa hai?"
// can be understood.
// ---------------------------------------------------------------
const INHERITABLE = ["course", "branch", "semester", "subject", "year"];
const FOLLOWUP_INTENTS = ["fee", "exam", "paper", "faculty", "room"];

const PRONOUNS = [
  "uska", "uski", "uske", "iska", "iski", "iske",
  "unka", "unki", "unke", "his", "her", "their", "woh", "wo"
];

const ROOM_WORDS = [
  "room", "cabin", "kahan", "kidhar", "where", "block",
  "floor", "baithte", "baithti", "office"
];

function sanitizeContext(raw) {
  if (!raw || typeof raw !== "object") return null;

  const out = {};

  if (["en", "hi", "hinglish"].includes(raw.lang)) {
    out.lang = raw.lang;
  }

  for (const key of ["intent", "feeType", ...INHERITABLE]) {
    const value = raw[key];

    if (typeof value === "string" || typeof value === "number") {
      out[key] = String(value).slice(0, 40);
    }
  }

  if (Array.isArray(raw.facultyIds)) {
    out.facultyIds = raw.facultyIds
      .map(String)
      .filter(id => /^F\d{3}$/.test(id))
      .slice(0, 3);
  }

  return out.intent || out.lang ? out : null;
}

function applyContext(p, ctx) {
  if (!ctx) return p;

  const out = { ...p };
  const hasPronoun = contains(p.q, PRONOUNS);

  // "Uska room kaunsa hai?" right after a single faculty answer.
  if (
    ctx.facultyIds?.length &&
    hasPronoun &&
    contains(p.q, ROOM_WORDS) &&
    !p.room
  ) {
    out.intent = "faculty_room";
    return out;
  }

  const explicitProgram = Boolean(p.course || p.branch);
  const hasEntity = Boolean(
    p.course || p.branch || p.subject || p.semester || p.year
  );
  const shortQuestion = p.q.split(" ").filter(Boolean).length <= 5;
  const followUpWord = contains(p.q, [
    "aur", "and", "also", "what about", "how about", "kitni", "kitna", "kab", "kaun"
  ]);

  if (
    p.intent === "unknown" &&
    FOLLOWUP_INTENTS.includes(ctx.intent) &&
    (hasEntity || hasPronoun || (shortQuestion && followUpWord))
  ) {
    out.intent = ctx.intent;
  }

  const feeWithType = out.intent === "fee" && p.feeTypeGiven;

  if (FOLLOWUP_INTENTS.includes(out.intent) && !explicitProgram && !feeWithType) {
    for (const key of INHERITABLE) {
      if (!out[key] && ctx[key]) {
        out[key] = key === "year" ? Number(ctx[key]) || null : ctx[key];
      }
    }
  }

  if (out.intent === "fee" && !p.feeTypeGiven && ctx.feeType) {
    out.feeType = ctx.feeType;
  }

  return out;
}

async function understandQuestion(question, ctx) {
  const parsed = {
    ...applyContext(extractDetails(question), ctx),
    lang: detectLang(question, ctx)
  };

  // In these cases, local matching must not be overwritten by AI.
  const protectedIntents = [
    "intro",
    "hostel",
    "campus",
    "faculty",
    "faculty_room",
    "scholarship",
    "certificate",
    "document",
    "event",
    "paper",
    "room",
    "fee",
    "exam",
    "academic"
  ];

  if (protectedIntents.includes(parsed.intent) || !ai) {
    return parsed;
  }

  try {
    const result = await ai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      instructions:
        "Classify a question for a fictional university demo assistant. Return JSON only with university_related, intent, course, branch, semester, year, subject, room, feeType, designation, name. Allowed intents: faculty, room, fee, exam, paper, campus, academic, intro, event, certificate, document, scholarship, hostel, unknown. Extract details only; never invent facts. Set university_related false only for clearly unrelated questions.",
      input: question
    });

    const raw = String(result.output_text || "")
      .replace(/```json|```/g, "")
      .trim();

    const extracted = JSON.parse(raw);

    if (extracted.university_related === false) {
      return { ...parsed, intent: "unrelated" };
    }

    return {
      ...parsed,
      intent: extracted.intent || parsed.intent,
      course: extracted.course || parsed.course,
      branch: extracted.branch || parsed.branch,
      semester: String(extracted.semester || parsed.semester || ""),
      year: Number(extracted.year) || parsed.year,
      subject: extracted.subject || parsed.subject,
      room: String(extracted.room || parsed.room || ""),
      feeType: extracted.feeType || parsed.feeType,
      designation: extracted.designation || parsed.designation,
      name: extracted.name || parsed.name
    };
  } catch (error) {
    console.error("AI classification failed:", error.message);
    return parsed;
  }
}

// ---------------------------------------------------------------
// LANGUAGE: answers follow the language of the question
//   "en" = English, "hi" = Hindi (Devanagari), "hinglish" = Hindi in English letters
// ---------------------------------------------------------------
const HINGLISH_WORDS = [
  "hai", "hain", "kahan", "kaun", "kon", "kitni", "kitna", "kab", "batao",
  "bataiye", "mujhe", "kya", "ka", "ki", "ke", "ko", "mein", "nahi", "aur",
  "uska", "uski", "iska", "iski", "tum", "aap", "chahiye", "lagega", "milega",
  "kaise", "kidhar", "hoga", "wala", "wali", "sab", "zyada", "paisa",
  "baithte", "baithti", "dikhao", "batana", "karo"
];

function detectLang(question, ctx) {
  const text = String(question || "");

  if (/[ऀ-ॿ]/.test(text)) return "hi";

  const tokens = normalize(text).split(" ");

  if (tokens.some(token => HINGLISH_WORDS.includes(token))) return "hinglish";

  // Short English-looking follow-ups ("MBA?") keep the earlier language.
  if (ctx?.lang && tokens.length <= 3) return ctx.lang;

  return "en";
}

const MSG = {
  demo: {
    en: "⚠️ Demo data — not official university information.",
    hi: "⚠️ डेमो डेटा — यह विश्वविद्यालय की आधिकारिक जानकारी नहीं है।",
    hinglish: "⚠️ Demo data — official university information nahi hai."
  },
  typeQuestion: {
    en: "Please type your question first.",
    hi: "कृपया पहले अपना सवाल लिखें।",
    hinglish: "Pehle apna sawaal type karo."
  },
  serverError: {
    en: "Something went wrong. Please try again.",
    hi: "कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।",
    hinglish: "Request process nahi ho paayi. Dobara try karo."
  },
  unknown: {
    en: "I couldn't fully understand that. I can help with teachers, fees, exams, rooms, hostels, campus locations, question papers and scholarships. Try one of the questions below 👇",
    hi: "मैं यह पूरी तरह समझ नहीं पाया। मैं टीचर, फीस, परीक्षा, रूम, हॉस्टल, कैंपस की जगहों, प्रश्न पत्र और स्कॉलरशिप में मदद कर सकता हूँ। नीचे दिए सवालों में से कोई आज़माएँ 👇",
    hinglish: "Ye sawaal mujhe poori tarah samajh nahi aaya. Main teachers, fees, exams, rooms, hostels, campus locations, papers aur scholarship mein help kar sakta hoon. Neeche se koi sawaal try karo 👇"
  },
  unrelated: {
    en: "I only help with university topics: teachers, fees, rooms, exams, question papers, campus locations, hostels, events, certificates, documents and scholarships.",
    hi: "मैं सिर्फ़ विश्वविद्यालय से जुड़े विषयों में मदद करता हूँ: टीचर, फीस, रूम, परीक्षा, प्रश्न पत्र, कैंपस की जगहें, हॉस्टल, इवेंट, सर्टिफिकेट, दस्तावेज़ और स्कॉलरशिप।",
    hinglish: "Main university-related topics mein help karta hoon: teachers, fees, rooms, exams, question papers, campus locations, hostels, events, certificates, documents aur scholarship guidance."
  },
  noFaculty: {
    en: s => `No demo record found for ${s ? s + " teacher" : "faculty"}. I won't guess.`,
    hi: s => `${s ? s + " के टीचर" : "फैकल्टी"} का डेमो रिकॉर्ड नहीं मिला। मैं अंदाज़ा नहीं लगाऊँगा।`,
    hinglish: s => `Matching ${s ? `${s} subject teacher` : "faculty"} ka demo record nahi mila. Main kisi teacher ka subject guess nahi karunga.`
  },
  multiFaculty: {
    en: n => `I found ${n} matching faculty records:`,
    hi: n => `मुझे ${n} मिलते-जुलते फैकल्टी रिकॉर्ड मिले:`,
    hinglish: n => `Mujhe ${n} matching faculty records mile:`
  },
  specifyDept: {
    en: "Tell me the department or designation and I'll find the right one.",
    hi: "विभाग या पद बताइए, मैं सही व्यक्ति ढूँढ दूँगा।",
    hinglish: "Department ya designation batao, main sahi wala dhoondh dunga."
  },
  whichTeacher: {
    en: "Whose room do you need? Tell me the teacher's name or subject.",
    hi: "किस टीचर का रूम चाहिए? टीचर का नाम या विषय बताइए।",
    hinglish: "Kis teacher ka room chahiye? Teacher ka naam ya subject batao."
  },
  cabinUnknown: {
    en: "Cabin location not confirmed yet",
    hi: "केबिन की जगह अभी पक्की नहीं है",
    hinglish: "Cabin location abhi confirm nahi hai"
  },
  needRoom: {
    en: "Please give a room number, for example: Which block is Room 3001 in?",
    hi: "कृपया रूम नंबर बताइए, जैसे: रूम 3001 किस ब्लॉक में है?",
    hinglish: "Room number batao, jaise: Room 3001 kis block mein hai?"
  },
  roomNotFound: {
    en: n => `No record for Room ${n}. I won't guess the block.`,
    hi: n => `रूम ${n} का रिकॉर्ड नहीं मिला। मैं ब्लॉक का अंदाज़ा नहीं लगाऊँगा।`,
    hinglish: n => `Room ${n} ka record nahi mila. Main block guess nahi karunga.`
  },
  feeNotFound: {
    en: "No demo record for this fee type. Tell me the course, branch and fee type (for example: B.Tech CSE hostel fee). I won't guess missing amounts.",
    hi: "इस फीस का डेमो रिकॉर्ड नहीं मिला। कोर्स, ब्रांच और फीस का प्रकार बताइए (जैसे: B.Tech CSE हॉस्टल फीस)। मैं अंदाज़े से राशि नहीं बताऊँगा।",
    hinglish: "Is fee type ka demo record nahi mila. Course, branch aur fee type batao (jaise: B.Tech CSE hostel fee). Missing fee ka amount guess nahi kiya jayega."
  },
  paperNeed: {
    en: "For a question paper I need the branch, semester and subject. Example: B.Tech CSE semester 3 Data Structures 2025 paper.",
    hi: "प्रश्न पत्र के लिए ब्रांच, सेमेस्टर और विषय बताइए। उदाहरण: B.Tech CSE सेमेस्टर 3 Data Structures 2025 पेपर।",
    hinglish: "Paper ke liye branch, semester aur subject batao. Example: B.Tech CSE semester 3 Data Structures ka 2025 paper do."
  },
  paperNotFound: {
    en: "No demo paper record for this combination. Check the subject, branch, semester or year.",
    hi: "इस संयोजन का डेमो पेपर रिकॉर्ड नहीं मिला। विषय, ब्रांच, सेमेस्टर या वर्ष जाँचें।",
    hinglish: "Is combination ka demo paper record nahi mila. Subject, branch, semester ya year check karo."
  },
  paperHeader: {
    en: s => `📄 ${s} — previous year papers`,
    hi: s => `📄 ${s} — पिछले वर्षों के प्रश्न पत्र`,
    hinglish: s => `📄 ${s} — previous year papers`
  },
  pdfMissing: {
    en: "PDF not available yet",
    hi: "PDF अभी उपलब्ध नहीं है",
    hinglish: "PDF abhi available nahi hai"
  },
  examNotFound: {
    en: "No matching exam schedule found. Tell me the course, branch, semester and subject.",
    hi: "कोई मिलता-जुलता परीक्षा कार्यक्रम नहीं मिला। कोर्स, ब्रांच, सेमेस्टर और विषय बताइए।",
    hinglish: "Matching exam schedule nahi mila. Course, branch, semester aur subject batao."
  },
  campusNotFound: {
    en: "No demo record for that place. You can ask about the Library, Accounts Office, Admissions Office or Student Services Desk. The exact location of Cafe GD and Subway is not confirmed yet.",
    hi: "उस जगह का डेमो रिकॉर्ड नहीं मिला। आप लाइब्रेरी, अकाउंट्स ऑफिस, एडमिशन ऑफिस या स्टूडेंट सर्विसेज डेस्क के बारे में पूछ सकते हैं। Cafe GD और Subway की सटीक जगह अभी पक्की नहीं है।",
    hinglish: "Is campus place ka demo record nahi mila. Library, Accounts Office, Admissions Office ya Student Services Desk pooch sakte ho. Cafe GD/Subway ki exact location abhi confirm nahi hai."
  },
  locUnknown: {
    en: "Exact location not confirmed yet",
    hi: "सटीक जगह अभी पक्की नहीं है",
    hinglish: "Exact location abhi confirm nahi hai"
  },
  academicNotFound: {
    en: "No matching academic record. Try a topic like attendance or timetable.",
    hi: "कोई मिलता-जुलता अकादमिक रिकॉर्ड नहीं मिला। अटेंडेंस या टाइमटेबल जैसा विषय पूछें।",
    hinglish: "Matching academic record nahi mila. Attendance ya timetable jaise topic specify karo."
  },
  hostelNone: {
    en: "No demo hostel record found.",
    hi: "हॉस्टल का डेमो रिकॉर्ड नहीं मिला।",
    hinglish: "Hostel ka demo record nahi mila."
  },
  hostelLocUnknown: {
    en: " — location not confirmed yet",
    hi: " — जगह अभी पक्की नहीं है",
    hinglish: " — location abhi confirm nahi hai"
  },
  hostelNote: {
    en: "Note: these are sample hostel names. Official names and locations are yet to be confirmed.",
    hi: "नोट: ये नमूना हॉस्टल नाम हैं। आधिकारिक नाम और जगहें अभी पक्की होनी बाकी हैं।",
    hinglish: "Note: ye sample hostel names hain. Official names aur locations confirm karne baaki hain."
  },
  languagesLabel: { en: "🗣️ Languages: ", hi: "🗣️ भाषाएँ: ", hinglish: "🗣️ Languages: " },
  createdByLabel: { en: "👨‍💻 Created by: ", hi: "👨‍💻 निर्माता: ", hinglish: "👨‍💻 Created by: " },
  noEvents: {
    en: "There are no demo event records yet. I won't guess dates or venues.",
    hi: "इवेंट के डेमो रिकॉर्ड अभी उपलब्ध नहीं हैं। मैं तारीख या जगह का अंदाज़ा नहीं लगाऊँगा।",
    hinglish: "Events ke demo records abhi available nahi hain. Main date ya venue guess nahi karunga."
  },
  noCertDoc: {
    en: kind => `There are no demo ${kind} records yet. Please confirm the exact process with the relevant university office.`,
    hi: kind => `${kind === "certificate" ? "सर्टिफिकेट" : "दस्तावेज़"} के डेमो रिकॉर्ड अभी उपलब्ध नहीं हैं। सही प्रक्रिया संबंधित विश्वविद्यालय कार्यालय से पूछें।`,
    hinglish: kind => `Is ${kind} ke demo records abhi available nahi hain. Exact process relevant university office se confirm karein.`
  },
  whichCertDoc: {
    en: kind => `Which ${kind} do you need? Tell me its name.`,
    hi: kind => `कौन सा ${kind === "certificate" ? "सर्टिफिकेट" : "दस्तावेज़"} चाहिए? उसका नाम बताइए।`,
    hinglish: kind => `Kaunsa ${kind} chahiye? Uska naam batao.`
  },
  scholarshipDocs: {
    en: "UP Scholarship is a scheme of the Uttar Pradesh Government.\n\nA general checklist may include Aadhaar details, a photo, income certificate, domicile/residence certificate, previous marksheet, admission/course proof, fee receipt and bank details.\n\nRequirements can change with your category and whether the application is fresh or renewal. Verify the final list on the official UP Scholarship portal.",
    hi: "UP स्कॉलरशिप उत्तर प्रदेश सरकार की योजना है।\n\nसामान्य चेकलिस्ट में आधार की जानकारी, फोटो, आय प्रमाण पत्र, निवास प्रमाण पत्र, पिछली मार्कशीट, एडमिशन/कोर्स का प्रमाण, फीस रसीद और बैंक विवरण हो सकते हैं।\n\nश्रेणी और नए/नवीनीकरण आवेदन के अनुसार ज़रूरतें बदल सकती हैं। अंतिम सूची आधिकारिक UP Scholarship पोर्टल पर जाँचें।",
    hinglish: "UP Scholarship Uttar Pradesh Government ki scheme hai.\n\nGeneral checklist mein Aadhaar details, photo, income certificate, domicile/residence certificate, previous marksheet, admission/course proof, fee receipt aur bank details ho sakte hain.\n\nCategory aur fresh/renewal application ke hisaab se requirements badal sakti hain. Current session ki final list official UP Scholarship portal par verify karein."
  },
  scholarshipInfo: {
    en: "UP Scholarship is a scheme of the Uttar Pradesh Government, separate from the university's own scholarship.\n\nI can give guidance on the documents checklist, fresh/renewal application, status or hard-copy submission. Verify the final requirements on the official portal.",
    hi: "UP स्कॉलरशिप उत्तर प्रदेश सरकार की योजना है, जो विश्वविद्यालय की अपनी स्कॉलरशिप से अलग है।\n\nमैं दस्तावेज़ चेकलिस्ट, नया/नवीनीकरण आवेदन, स्टेटस या हार्ड कॉपी जमा करने के बारे में मार्गदर्शन दे सकता हूँ। अंतिम ज़रूरतें आधिकारिक पोर्टल पर जाँचें।",
    hinglish: "UP Scholarship Uttar Pradesh Government ki scheme hai, university ki apni scholarship se alag.\n\nMain documents checklist, fresh/renewal application, status ya hard-copy submission guidance de sakta hoon. Current session ki final requirements official portal se verify karein."
  }
};

// Look up a message in the user's language (falls back to Hinglish).
function tr(lang, key, ...args) {
  const entry = MSG[key] || {};
  const value = entry[lang] ?? entry.hinglish;

  return typeof value === "function" ? value(...args) : value;
}

// ---------------------------------------------------------------
// ANSWER HELPERS (clean, emoji-based formatting)
// ---------------------------------------------------------------
function demoAnswer(text, lang) {
  return text + "\n\n" + tr(lang, "demo");
}

function isUnknownValue(value) {
  return !value || /to be confirmed|not confirmed/i.test(String(value));
}

function formatDate(iso) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

function facultyLocation(f, lang) {
  if (isUnknownValue(f.room)) {
    return tr(lang, "cabinUnknown");
  }

  return `Room ${f.room}, ${f.block}, ${f.floor}`;
}

function facultyCard(f, lang) {
  return (
    `👤 ${f.name}\n` +
    `🏫 ${f.department} • ${f.designation} • ${f.course}\n` +
    `📍 ${facultyLocation(f, lang)}` +
    (f.subjects?.length ? `\n📚 ${f.subjects.join(", ")}` : "")
  );
}

function findFaculty(p) {
  const faculty = Array.isArray(knowledgeBase.faculties)
    ? knowledgeBase.faculties
    : [];

  const cleanedName = normalize(p.name).replace(
    /^(dr\.?|doctor|prof\.?|professor|mr\.?|mrs\.?|ms\.?)\s*/,
    ""
  );

  const subject = normalize(p.subject);

  const list = faculty.filter(f => {
    const haystack = normalize(
      `${f.name || ""} ${f.department || ""} ${f.course || ""} ${f.designation || ""} ${(f.subjects || []).join(" ")}`
    );

    const nameOk =
      !cleanedName ||
      normalize(f.name).includes(cleanedName) ||
      cleanedName.includes(normalize(f.name));

    const branchOk =
      !p.branch || normalize(f.department).includes(normalize(p.branch));

    const courseOk = !p.course || f.course === p.course;

    const designationOk =
      !p.designation ||
      normalize(f.designation) === normalize(p.designation);

    const subjectOk = !subject || haystack.includes(subject);

    return nameOk && branchOk && courseOk && designationOk && subjectOk;
  });

  if (!list.length) {
    return { answer: tr(p.lang, "noFaculty", p.subject), ids: [] };
  }

  if (list.length > 1) {
    return {
      answer: demoAnswer(
        tr(p.lang, "multiFaculty", list.length) + "\n\n" +
        list.map(f => facultyCard(f, p.lang)).join("\n\n") +
        (p.name ? "\n\n" + tr(p.lang, "specifyDept") : ""),
        p.lang
      ),
      ids: []
    };
  }

  return {
    answer: demoAnswer(facultyCard(list[0], p.lang), p.lang),
    ids: [list[0].id]
  };
}

function findFacultyRoom(ids = [], lang) {
  const list = (knowledgeBase.faculties || []).filter(f => ids.includes(f.id));

  if (!list.length) {
    return tr(lang, "whichTeacher");
  }

  return demoAnswer(
    list.map(f => `👤 ${f.name}\n📍 ${facultyLocation(f, lang)}`).join("\n\n"),
    lang
  );
}

function findRoom(p) {
  if (!p.room) {
    return tr(p.lang, "needRoom");
  }

  const rooms = (knowledgeBase.rooms || []).filter(
    r => String(r.room) === String(p.room)
  );

  if (!rooms.length) {
    return tr(p.lang, "roomNotFound", p.room);
  }

  return demoAnswer(
    rooms.map(r =>
      `📍 Room ${r.room} — ${r.block}, ${r.floor}\n🏷️ ${r.purpose || "—"}`
    ).join("\n\n"),
    p.lang
  );
}

function feeLabel(type, lang) {
  if (lang === "hi") {
    const m = { tuition: "ट्यूशन शुल्क", hostel: "हॉस्टल शुल्क", exam: "परीक्षा शुल्क", transport: "ट्रांसपोर्ट शुल्क" };
    return m[type] || type + " शुल्क";
  }
  return `${type} fee`;
}

function periodLabel(period, lang) {
  if (lang === "hi") {
    const m = { semester: "प्रति सेमेस्टर", year: "प्रति वर्ष" };
    return m[period] || "प्रति " + period;
  }
  return `per ${period}`;
}

// Hindi answers: translate the English labels that come from the data records.
// Names of people, subjects and buildings stay as they are.
function localizeHi(text) {
  const days = { Sun: "रवि", Mon: "सोम", Tue: "मंगल", Wed: "बुध", Thu: "गुरु", Fri: "शुक्र", Sat: "शनि" };
  const months = { Jan: "जन॰", Feb: "फ़र॰", Mar: "मार्च", Apr: "अप्रैल", May: "मई", Jun: "जून", Jul: "जुल॰", Aug: "अग॰", Sep: "सित॰", Oct: "अक्टू॰", Nov: "नव॰", Dec: "दिस॰" };
  const ord = { "1st": "पहली", "2nd": "दूसरी", "3rd": "तीसरी", "4th": "चौथी", "5th": "पाँचवीं" };
  return String(text)
    .replace(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat),? (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec),? (\d{4})/g,
      (_, d, n, m, y) => `${days[d]}, ${n} ${months[m]} ${y}`)
    .replace(/Ground Floor/g, "भूतल")
    .replace(/(\d(?:st|nd|rd|th)) Floor/g, (_, o) => `${ord[o] || o} मंज़िल`)
    .replace(/Mid-Semester/g, "मध्य-सेमेस्टर")
    .replace(/End-Semester/g, "अंतिम सेमेस्टर")
    .replace(/Semester (\d+)/g, "सेमेस्टर $1")
    .replace(/Assistant Professor/g, "सहायक प्रोफेसर")
    .replace(/Associate Professor/g, "एसोसिएट प्रोफेसर")
    .replace(/• Professor/g, "• प्रोफेसर")
    .replace(/• HOD/g, "• विभागाध्यक्ष")
    .replace(/Engineering Mathematics/g, "इंजीनियरिंग गणित")
    .replace(/Mathematics/g, "गणित")
    .replace(/Demo (गणित|English) Faculty/g, "डेमो $1 फैकल्टी")
    .replace(/Girls Hostel/g, "गर्ल्स हॉस्टल")
    .replace(/Boys Hostel/g, "बॉयज़ हॉस्टल")
    .replace(/\(Girls\)/g, "(लड़कियाँ)")
    .replace(/\(Boys\)/g, "(लड़के)")
    .replace(/Central Library/g, "सेंट्रल लाइब्रेरी");
}

function findFee(p) {
  const fees = (knowledgeBase.fees || []).filter(f =>
    (!p.course || f.course === p.course) &&
    (!p.branch || f.branch === p.branch) &&
    f.feeType === p.feeType
  );

  if (!fees.length) {
    return tr(p.lang, "feeNotFound");
  }

  return demoAnswer(
    fees.map(f =>
      `💳 ${f.course === f.branch ? f.course : f.course + " " + f.branch} — ${feeLabel(f.feeType, p.lang)}\n` +
      `₹${Number(f.amount).toLocaleString("en-IN")} ${periodLabel(f.period, p.lang)} (${f.academicYear})`
    ).join("\n\n"),
    p.lang
  );
}

function findPaper(p) {
  if (!p.branch || !p.subject || !p.semester) {
    return tr(p.lang, "paperNeed");
  }

  const papers = (knowledgeBase.papers || []).filter(x =>
    x.branch === p.branch &&
    String(x.semester) === String(p.semester) &&
    normalize(x.subject) === normalize(p.subject) &&
    (!p.course || x.course === p.course) &&
    (!p.year || x.year === p.year)
  );

  if (!papers.length) {
    return tr(p.lang, "paperNotFound");
  }

  return demoAnswer(
    tr(p.lang, "paperHeader", p.subject) + "\n\n" +
    papers.map(paper => {
      const safeFile = path.basename(paper.file);
      const filePath = path.join(__dirname, "public", "papers", safeFile);

      return fs.existsSync(filePath)
        ? `• ${paper.year}: /papers/${encodeURIComponent(safeFile)}`
        : `• ${paper.year}: ${tr(p.lang, "pdfMissing")}`;
    }).join("\n"),
    p.lang
  );
}

function findExam(p) {
  const exams = (knowledgeBase.exams || []).filter(e =>
    (!p.course || e.course === p.course) &&
    (!p.branch || e.branch === p.branch) &&
    (!p.semester || String(e.semester) === String(p.semester)) &&
    (!p.subject || normalize(e.subject) === normalize(p.subject)) &&
    (!p.year || e.date.startsWith(String(p.year)))
  );

  if (!exams.length) {
    return { answer: tr(p.lang, "examNotFound"), records: [] };
  }

  return {
    records: exams,
    answer: demoAnswer(
      exams.map(e =>
        `📅 ${e.subject} — ${e.examType}\n` +
        `🎓 ${e.course} ${e.branch} • Semester ${e.semester}\n` +
        `🗓️ ${formatDate(e.date)}  ⏰ ${e.time}\n` +
        `📍 ${e.venue}`
      ).join("\n\n"),
      p.lang
    )
  };
}

function findCampus(p) {
  const q = p.q;

  const list = (knowledgeBase.campus || []).filter(c => {
    const haystack = normalize(
      `${c.name || ""} ${c.category || ""} ${c.block || ""}`
    );

    const words = haystack.split(" ").filter(word => word.length > 3);

    return words.some(word => q.includes(word)) ||
      (normalize(c.name).includes("cafe gd") && q.includes("cafe gd")) ||
      (normalize(c.name).includes("subway") && q.includes("subway"));
  });

  if (!list.length) {
    return tr(p.lang, "campusNotFound");
  }

  return demoAnswer(
    list.map(c => {
      const where = isUnknownValue(c.block)
        ? tr(p.lang, "locUnknown")
        : `${c.block}${c.room ? `, Room ${c.room}` : ""}${c.floor && !isUnknownValue(c.floor) ? `, ${c.floor}` : ""}`;

      return `🏛️ ${c.name}\n📍 ${where}`;
    }).join("\n\n"),
    p.lang
  );
}

function findAcademic(p) {
  const list = (knowledgeBase.academics || []).filter(a =>
    p.q.includes(normalize(a.type)) ||
    (a.type === "timetable" &&
      contains(p.q, ["class timing", "class time", "schedule"]))
  );

  if (!list.length) {
    return tr(p.lang, "academicNotFound");
  }

  return demoAnswer(
    list.map(a => `📌 ${a.type[0].toUpperCase()}${a.type.slice(1)}\n${a.details}`).join("\n\n"),
    p.lang
  );
}

function findHostel(p) {
  const all = Array.isArray(knowledgeBase.hostels)
    ? knowledgeBase.hostels
    : [];

  const q = p.q;

  const girls = contains(q, [
    "girl", "girls", "ladies", "female", "लड़कियों"
  ]);

  const boys = contains(q, [
    "boy", "boys", "gents", "male", "लड़कों"
  ]);

  const list = all.filter(h =>
    (!girls && !boys) ||
    (girls && normalize(h.type) === "girls") ||
    (boys && normalize(h.type) === "boys")
  );

  if (!list.length) {
    return tr(p.lang, "hostelNone");
  }

  return demoAnswer(
    list.map(h =>
      `🏠 ${h.name} (${h.type})` +
      (isUnknownValue(h.block) && isUnknownValue(h.location)
        ? tr(p.lang, "hostelLocUnknown")
        : ` — ${h.block}, ${h.location}`)
    ).join("\n") +
    "\n\n" + tr(p.lang, "hostelNote"),
    p.lang
  );
}

function findIntro(lang) {
  const a = knowledgeBase.assistant || {};

  return demoAnswer(
    `🙋‍♂️ ${a.name || "Devagya"} — ${a.role || "University Student Assistance Chatbot"}\n\n` +
    `${a.purpose || "I help with university-related demo information."}\n\n` +
    `${tr(lang, "languagesLabel")}${(a.languages || ["English", "Hindi", "Hinglish"]).join(", ")}\n` +
    `${tr(lang, "createdByLabel")}${a.createdBy || "The developer of this student-assistance demo project."}`,
    lang
  );
}

// If every record found shares a value, remember it for follow-up questions.
function commonFields(records = []) {
  const out = {};

  if (!records.length) return out;

  for (const key of ["course", "branch", "semester", "subject"]) {
    const values = new Set(records.map(r => String(r[key] ?? "")));

    if (values.size === 1 && [...values][0]) {
      out[key] = [...values][0];
    }
  }

  return out;
}

// ---------------------------------------------------------------
// OPTIONAL AI HELPER via an n8n webhook (only if N8N_WEBHOOK_URL is set)
// Used ONLY when local matching cannot understand the question.
// ---------------------------------------------------------------
async function askN8n(question) {
  const url = process.env.N8N_WEBHOOK_URL;

  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const headers = { "Content-Type": "application/json" };

    if (process.env.N8N_WEBHOOK_SECRET) {
      headers["x-devagya-secret"] = process.env.N8N_WEBHOOK_SECRET;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        question,
        instructions:
          "You are Devagya, a student assistant for a FICTIONAL demo university. Answer ONLY from the knowledge provided. If the answer is not in the knowledge, say you do not have that record. Keep the answer short.",
        knowledge: {
          faculties: knowledgeBase.faculties,
          rooms: knowledgeBase.rooms,
          fees: knowledgeBase.fees,
          exams: knowledgeBase.exams,
          campus: knowledgeBase.campus,
          hostels: knowledgeBase.hostels,
          academics: knowledgeBase.academics
        }
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const answer = String(data.answer || data.output || data.text || "").trim();

    return answer ? answer.slice(0, 1500) : null;
  } catch (error) {
    console.error("n8n webhook failed:", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------
// FOLLOW-UP SUGGESTIONS (clickable chips under the answer, in the user's language)
// ---------------------------------------------------------------
const SUGGESTIONS = {
  en: {
    faculty_withId: ["Where is their room?", "Who is the CSE HOD?", "When is the Data Structures exam?"],
    faculty: ["Who is the CSE HOD?", "Who teaches Data Structures?", "Where is the library?"],
    exam: ["What is the B.Tech CSE exam fee?", "Who teaches Data Structures?", "What is the attendance rule?"],
    fee: ["What is the hostel fee?", "What is the transport fee?", "What is the MBA tuition fee?"],
    hostel: ["Girls hostel list", "Boys hostel list", "What is the hostel fee?"],
    campus: ["Where is the library?", "Where is the accounts office?", "Where is the student services desk?"],
    paper: ["B.Tech CSE exam dates", "Who teaches Data Structures?", "What are the exam fees?"],
    other: ["When are the exams?", "Who is the English teacher?", "Girls hostel list"]
  },
  hinglish: {
    faculty_withId: ["Uska room kaunsa hai?", "CSE ke HOD kaun hain?", "Data Structures ka exam kab hai?"],
    faculty: ["CSE ke HOD kaun hain?", "Data Structures ke teacher kaun hain?", "Library kahan hai?"],
    exam: ["B.Tech CSE exam fee kitni hai?", "Data Structures ke teacher kaun hain?", "Attendance rule kya hai?"],
    fee: ["Hostel fee kitni hai?", "Transport fee kitni hai?", "MBA tuition fee kitni hai?"],
    hostel: ["Girls hostel list", "Boys hostel list", "Hostel fee kitni hai?"],
    campus: ["Library kahan hai?", "Accounts office kahan hai?", "Student services desk kahan hai?"],
    paper: ["B.Tech CSE exam dates batao", "Data Structures ke teacher kaun hain?", "Exam fees kitni hai?"],
    other: ["Exam dates kab hain?", "English teacher kaun hai?", "Girls hostel list"]
  },
  hi: {
    faculty_withId: ["उसका रूम कौन सा है?", "CSE के HOD कौन हैं?", "Data Structures की परीक्षा कब है?"],
    faculty: ["CSE के HOD कौन हैं?", "Data Structures के टीचर कौन हैं?", "लाइब्रेरी कहाँ है?"],
    exam: ["B.Tech CSE की परीक्षा फीस कितनी है?", "Data Structures के टीचर कौन हैं?", "अटेंडेंस नियम क्या है?"],
    fee: ["हॉस्टल फीस कितनी है?", "ट्रांसपोर्ट फीस कितनी है?", "MBA की ट्यूशन फीस कितनी है?"],
    hostel: ["लड़कियों के हॉस्टल की लिस्ट", "लड़कों के हॉस्टल की लिस्ट", "हॉस्टल फीस कितनी है?"],
    campus: ["लाइब्रेरी कहाँ है?", "अकाउंट्स ऑफिस कहाँ है?", "स्टूडेंट सर्विसेज डेस्क कहाँ है?"],
    paper: ["B.Tech CSE की परीक्षा तिथियाँ बताइए", "Data Structures के टीचर कौन हैं?", "परीक्षा फीस कितनी है?"],
    other: ["परीक्षा कब है?", "अंग्रेज़ी के टीचर कौन हैं?", "लड़कियों के हॉस्टल की लिस्ट"]
  }
};

const CERT_APPLY_CHIPS = {
  en: ["I want to apply for a bonafide certificate", "Where is the Student Services Desk?"],
  hinglish: ["Mujhe bonafide certificate apply karna hai", "Student Services Desk kahan hai?"],
  hi: ["मुझे बोनाफाइड सर्टिफिकेट अप्लाई करना है", "Student Services Desk कहाँ है?"]
};

function suggestionsFor(intent, facultyIds = [], lang = "hinglish") {
  const set = SUGGESTIONS[lang] || SUGGESTIONS.hinglish;

  switch (intent) {
    case "faculty":
    case "faculty_room":
      return facultyIds.length === 1 ? set.faculty_withId : set.faculty;
    case "exam":
      return set.exam;
    case "fee":
      return set.fee;
    case "hostel":
      return set.hostel;
    case "campus":
      return set.campus;
    case "paper":
      return set.paper;
    case "certificate":
      return CERT_APPLY_CHIPS[lang] || CERT_APPLY_CHIPS.en;
    default:
      return set.other;
  }
}

function findEvents(lang) {
  const events = Array.isArray(knowledgeBase.events)
    ? knowledgeBase.events
    : [];

  if (!events.length) {
    return tr(lang, "noEvents");
  }

  return demoAnswer(
    events.map(e =>
      `${e.name || "Event"}\n` +
      `Date: ${e.date || "Not specified"}\n` +
      `Time: ${e.time || "Not specified"}\n` +
      `Venue: ${e.venue || "Not specified"}\n` +
      `${e.description || ""}`
    ).join("\n\n"),
    lang
  );
}

const CERT_LABELS = {
  en: { purpose: "Purpose", where: "Where to apply", docs: "Documents", time: "Time needed", none: "Not specified" },
  hinglish: { purpose: "Purpose", where: "Kahan apply karein", docs: "Documents", time: "Time lagega", none: "Specified nahi" },
  hi: { purpose: "उद्देश्य", where: "कहाँ आवेदन करें", docs: "दस्तावेज़", time: "समय", none: "उपलब्ध नहीं" }
};

function findCertificateOrDocument(p, kind, rawQuestion = "") {
  const records = kind === "certificate"
    ? (knowledgeBase.certificates || [])
    : (knowledgeBase.documents || []);

  if (!records.length) {
    return tr(p.lang, "noCertDoc", kind);
  }

  // Hindi spellings of the certificate names, so Hindi questions match the records too.
  // (p.q has Devanagari vowel signs stripped, so this checks the original question text.)
  let q = p.q;
  if (/बोनाफ/.test(rawQuestion)) q += " bonafide";
  if (/चरित्र|कैरेक्टर/.test(rawQuestion)) q += " character";

  const words = r => normalize(
    `${r.name || ""} ${r.type || ""} ${r.purpose || ""} ${r.id || ""}`
  ).split(" ").filter((word, i, all) => word.length > 3 && q.includes(word) && all.indexOf(word) === i);

  const matches = records.filter(r => words(r).length > 0);

  // If some records match more words (e.g. "bonafide certificate"), keep only the best ones.
  const best = matches.length ? Math.max(...matches.map(r => words(r).length)) : 0;
  const top = matches.filter(r => words(r).length === best);

  if (!top.length) {
    return tr(p.lang, "whichCertDoc", kind);
  }

  const L = CERT_LABELS[p.lang] || CERT_LABELS.en;
  const pick = (r, key) => {
    const suffix = p.lang === "hi" ? "Hi" : p.lang === "hinglish" ? "Hinglish" : "";
    return (suffix && r[key + suffix]) || r[key];
  };

  return demoAnswer(
    top.map(r =>
      `${r.name || r.type}\n` +
      `${L.purpose}: ${pick(r, "purpose") || L.none}\n` +
      `${L.where}: ${r.applyAt || r.office || r.location || L.none}\n` +
      `${L.docs}: ${(pick(r, "sampleDocuments") || r.requiredDocuments || r.documents || []).join(", ") || L.none}` +
      (r.processingTime ? `\n${L.time}: ${pick(r, "processingTime")}` : "")
    ).join("\n\n"),
    p.lang
  );
}

function scholarshipAnswer(question, lang) {
  const q = normalize(question);

  if (contains(q, [
    "document",
    "documents",
    "kagaz",
    "kagazat",
    "dastavez",
    "दस्तावेज",
    "कागजात",
    "what required"
  ])) {
    return tr(lang, "scholarshipDocs");
  }

  return tr(lang, "scholarshipInfo");
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    demoData: true,
    aiEnabled: Boolean(ai),
    n8nEnabled: Boolean(process.env.N8N_WEBHOOK_URL),
    message: "Devagya demo assistant is running."
  });
});

// Staff-only: change a request status. Disabled unless ADMIN_KEY is set.
app.post("/api/admin/status", (req, res) => {
  const key = process.env.ADMIN_KEY || "";
  const given = String(req.get("x-admin-key") || "");
  const sha = v => require("crypto").createHash("sha256").update(v).digest();

  if (!key || !require("crypto").timingSafeEqual(sha(key), sha(given))) {
    return res.status(403).json({ error: "forbidden" });
  }

  const result = workflow.setStatus(req.body?.id, req.body?.status);
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/chat", async (req, res) => {
  let lang = "en";

  try {
    const question = String(req.body?.question || "").trim().slice(0, 500);
    const ctx = sanitizeContext(req.body?.context);

    if (!question) {
      return res.status(400).json({
        answer: tr(ctx?.lang || "en", "typeQuestion")
      });
    }

    // Service-request workflow (apply / track / unverified topics) runs first.
    const wf = workflow.handle(question, req.body?.workflow);

    if (wf) {
      return res.json(wf);
    }

    const p = await understandQuestion(question, ctx);
    lang = p.lang;

    let answer;
    let facultyIds = [];
    let learned = {};

    switch (p.intent) {
      case "faculty": {
        const result = findFaculty(p);
        answer = result.answer;
        facultyIds = result.ids;
        break;
      }
      case "faculty_room":
        answer = findFacultyRoom(ctx?.facultyIds, p.lang);
        facultyIds = ctx?.facultyIds || [];
        break;
      case "room":
        answer = findRoom(p);
        break;
      case "fee":
        answer = findFee(p);
        break;
      case "paper":
        answer = findPaper(p);
        break;
      case "exam": {
        const result = findExam(p);
        answer = result.answer;
        learned = commonFields(result.records);
        break;
      }
      case "campus":
        answer = findCampus(p);
        break;
      case "academic":
        answer = findAcademic(p);
        break;
      case "intro":
        answer = findIntro(p.lang);
        break;
      case "hostel":
        answer = findHostel(p);
        break;
      case "event":
        answer = findEvents(p.lang);
        break;
      case "certificate":
        answer = findCertificateOrDocument(p, "certificate", question);
        break;
      case "document":
        answer = findCertificateOrDocument(p, "document");
        break;
      case "scholarship":
        answer = scholarshipAnswer(question, p.lang);
        break;
      case "unrelated":
        answer = tr(p.lang, "unrelated");
        break;
      default: {
        // Local matching did not understand: optionally ask the n8n AI helper.
        const aiAnswer = await askN8n(question);

        answer = aiAnswer
          ? demoAnswer("🤖 " + aiAnswer, p.lang)
          : tr(p.lang, "unknown");
      }
    }

    // Keep the old context for messages that carry no topic.
    const keepContext = ["unknown", "unrelated", "intro"].includes(p.intent);

    const context = keepContext
      ? { ...(ctx || {}), lang: p.lang }
      : {
          lang: p.lang,
          intent: p.intent === "faculty_room" ? "faculty" : p.intent,
          course: p.course || learned.course || "",
          branch: p.branch || learned.branch || "",
          semester: p.semester || learned.semester || "",
          subject: p.subject || learned.subject || "",
          year: p.year || "",
          feeType: p.feeType || "",
          facultyIds
        };

    res.json({
      answer: p.lang === "hi" ? localizeHi(answer) : answer,
      intent: p.intent,
      demoData: true,
      context,
      lang: p.lang,
      suggestions: suggestionsFor(p.intent, facultyIds, p.lang)
    });
  } catch (error) {
    console.error("Chat API error:", error);

    res.status(500).json({
      answer: tr(lang, "serverError")
    });
  }
});

// Last-resort error handler so one bad request can never crash the server.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ answer: tr("en", "serverError") });
});

// Vercel imports the app; locally `node server.js` starts the listener.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Devagya demo portal: http://localhost:${PORT}`);
    console.log(
      `AI question understanding: ${ai ? "enabled" : "disabled — fallback active"}`
    );
  });
}

module.exports = app;
