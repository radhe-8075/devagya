
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const knowledgeBase = require("./knowledge-base");

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

const DEMO_NOTICE =
  "\n\n⚠️ Demo data — official university information nahi hai.";

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

function extractDetails(question) {
  const q = fuzzyFix(normalize(question));

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

  return out.intent ? out : null;
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
  const parsed = applyContext(extractDetails(question), ctx);

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
// ANSWER HELPERS (clean, emoji-based formatting)
// ---------------------------------------------------------------
function demoAnswer(text) {
  return text + DEMO_NOTICE;
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

function facultyLocation(f) {
  if (isUnknownValue(f.room)) {
    return "Cabin location abhi confirm nahi hai";
  }

  return `Room ${f.room}, ${f.block}, ${f.floor}`;
}

function facultyCard(f) {
  return (
    `👤 ${f.name}\n` +
    `🏫 ${f.department} • ${f.designation} • ${f.course}\n` +
    `📍 ${facultyLocation(f)}` +
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
    return {
      answer: `Matching ${p.subject ? `${p.subject} subject teacher` : "faculty"} ka demo record nahi mila. Main kisi teacher ka subject guess nahi karunga.`,
      ids: []
    };
  }

  if (list.length > 1) {
    return {
      answer: demoAnswer(
        `Mujhe ${list.length} matching faculty records mile:\n\n` +
        list.map(facultyCard).join("\n\n") +
        (p.name ? "\n\nDepartment ya designation batao, main sahi wala dhoondh dunga." : "")
      ),
      ids: []
    };
  }

  return {
    answer: demoAnswer(facultyCard(list[0])),
    ids: [list[0].id]
  };
}

function findFacultyRoom(ids = []) {
  const list = (knowledgeBase.faculties || []).filter(f => ids.includes(f.id));

  if (!list.length) {
    return "Kis teacher ka room chahiye? Teacher ka naam ya subject batao.";
  }

  return demoAnswer(
    list.map(f => `👤 ${f.name}\n📍 ${facultyLocation(f)}`).join("\n\n")
  );
}

function findRoom(p) {
  if (!p.room) {
    return "Room number batao, jaise: Room 3001 kis block mein hai?";
  }

  const rooms = (knowledgeBase.rooms || []).filter(
    r => String(r.room) === String(p.room)
  );

  if (!rooms.length) {
    return `Room ${p.room} ka record nahi mila. Main block guess nahi karunga.`;
  }

  return demoAnswer(
    rooms.map(r =>
      `📍 Room ${r.room} — ${r.block}, ${r.floor}\n🏷️ ${r.purpose || "Purpose not specified"}`
    ).join("\n\n")
  );
}

function findFee(p) {
  const fees = (knowledgeBase.fees || []).filter(f =>
    (!p.course || f.course === p.course) &&
    (!p.branch || f.branch === p.branch) &&
    f.feeType === p.feeType
  );

  if (!fees.length) {
    return "Is fee type ka demo record nahi mila. Course, branch aur fee type batao (jaise: B.Tech CSE hostel fee). Missing fee ka amount guess nahi kiya jayega.";
  }

  return demoAnswer(
    fees.map(f =>
      `💳 ${f.course} ${f.branch} — ${f.feeType} fee\n` +
      `₹${Number(f.amount).toLocaleString("en-IN")} per ${f.period} (${f.academicYear})`
    ).join("\n\n")
  );
}

function findPaper(p) {
  if (!p.branch || !p.subject || !p.semester) {
    return "Paper ke liye branch, semester aur subject batao. Example: B.Tech CSE semester 3 Data Structures ka 2025 paper do.";
  }

  const papers = (knowledgeBase.papers || []).filter(x =>
    x.branch === p.branch &&
    String(x.semester) === String(p.semester) &&
    normalize(x.subject) === normalize(p.subject) &&
    (!p.course || x.course === p.course) &&
    (!p.year || x.year === p.year)
  );

  if (!papers.length) {
    return "Is combination ka demo paper record nahi mila. Subject, branch, semester ya year check karo.";
  }

  return demoAnswer(
    `📄 ${p.subject} — previous year papers\n\n` +
    papers.map(paper => {
      const safeFile = path.basename(paper.file);
      const filePath = path.join(__dirname, "public", "papers", safeFile);

      return fs.existsSync(filePath)
        ? `• ${paper.year}: /papers/${encodeURIComponent(safeFile)}`
        : `• ${paper.year}: PDF abhi available nahi hai`;
    }).join("\n")
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
    return {
      answer: "Matching exam schedule nahi mila. Course, branch, semester aur subject batao.",
      records: []
    };
  }

  return {
    records: exams,
    answer: demoAnswer(
    exams.map(e =>
      `📅 ${e.subject} — ${e.examType}\n` +
      `🎓 ${e.course} ${e.branch} • Semester ${e.semester}\n` +
      `🗓️ ${formatDate(e.date)}  ⏰ ${e.time}\n` +
      `📍 ${e.venue}`
    ).join("\n\n")
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
    return "Is campus place ka demo record nahi mila. Library, Accounts Office, Admissions Office ya Student Services Desk pooch sakte ho. Cafe GD/Subway ki exact location abhi confirm nahi hai.";
  }

  return demoAnswer(
    list.map(c => {
      const where = isUnknownValue(c.block)
        ? "Exact location abhi confirm nahi hai"
        : `${c.block}${c.room ? `, Room ${c.room}` : ""}${c.floor && !isUnknownValue(c.floor) ? `, ${c.floor}` : ""}`;

      return `🏛️ ${c.name}\n📍 ${where}`;
    }).join("\n\n")
  );
}

function findAcademic(p) {
  const list = (knowledgeBase.academics || []).filter(a =>
    p.q.includes(normalize(a.type)) ||
    (a.type === "timetable" &&
      contains(p.q, ["class timing", "class time", "schedule"]))
  );

  if (!list.length) {
    return "Matching academic record nahi mila. Attendance ya timetable jaise topic specify karo.";
  }

  return demoAnswer(
    list.map(a => `📌 ${a.type[0].toUpperCase()}${a.type.slice(1)}\n${a.details}`).join("\n\n")
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
    return "Hostel ka demo record nahi mila.";
  }

  return demoAnswer(
    list.map(h =>
      `🏠 ${h.name} (${h.type})` +
      (isUnknownValue(h.block) && isUnknownValue(h.location)
        ? " — location abhi confirm nahi hai"
        : ` — ${h.block}, ${h.location}`)
    ).join("\n") +
    "\n\nNote: ye sample hostel names hain. Official names aur locations confirm karne baaki hain."
  );
}

function findIntro() {
  const a = knowledgeBase.assistant || {};

  return demoAnswer(
    `🙋‍♂️ ${a.name || "Devagya"} — ${a.role || "University Student Assistance Chatbot"}\n\n` +
    `${a.purpose || "I help with university-related demo information."}\n\n` +
    `🗣️ Languages: ${(a.languages || ["English", "Hindi", "Hinglish"]).join(", ")}\n` +
    `👨‍💻 Created by: ${a.createdBy || "The developer of this student-assistance demo project."}`
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
// FOLLOW-UP SUGGESTIONS (shown as clickable chips under the answer)
// ---------------------------------------------------------------
function suggestionsFor(intent, facultyIds = []) {
  switch (intent) {
    case "faculty":
    case "faculty_room":
      return [
        ...(facultyIds.length === 1 ? ["Uska room kaunsa hai?"] : []),
        "CSE ke HOD kaun hain?",
        "Data Structures ka exam kab hai?"
      ].slice(0, 3);
    case "exam":
      return [
        "B.Tech CSE exam fee kitni hai?",
        "Data Structures ke teacher kaun hain?",
        "Attendance rule kya hai?"
      ];
    case "fee":
      return [
        "Hostel fee kitni hai?",
        "Transport fee kitni hai?",
        "MBA tuition fee kitni hai?"
      ];
    case "hostel":
      return [
        "Girls hostel list",
        "Boys hostel list",
        "Hostel fee kitni hai?"
      ];
    case "campus":
      return [
        "Library kahan hai?",
        "Accounts office kahan hai?",
        "Student services desk kahan hai?"
      ];
    case "paper":
      return [
        "B.Tech CSE exam dates batao",
        "Data Structures ke teacher kaun hain?",
        "Exam fees kitni hai?"
      ];
    default:
      return [
        "Exam dates kab hain?",
        "English teacher kaun hai?",
        "Girls hostel list"
      ];
  }
}

function findEvents() {
  const events = Array.isArray(knowledgeBase.events)
    ? knowledgeBase.events
    : [];

  if (!events.length) {
    return "Events ke demo records abhi available nahi hain. Main date ya venue guess nahi karunga.";
  }

  return demoAnswer(
    events.map(e =>
      `${e.name || "Event"}\n` +
      `Date: ${e.date || "Not specified"}\n` +
      `Time: ${e.time || "Not specified"}\n` +
      `Venue: ${e.venue || "Not specified"}\n` +
      `${e.description || ""}`
    ).join("\n\n")
  );
}

function findCertificateOrDocument(p, kind) {
  const records = kind === "certificate"
    ? (knowledgeBase.certificates || [])
    : (knowledgeBase.documents || []);

  if (!records.length) {
    return `Is ${kind} ke demo records abhi available nahi hain. Exact process relevant university office se confirm karein.`;
  }

  const matches = records.filter(r => {
    const haystack = normalize(
      `${r.name || ""} ${r.type || ""} ${r.purpose || ""} ${r.id || ""}`
    );

    return haystack.split(" ").some(
      word => word.length > 3 && p.q.includes(word)
    );
  });

  if (!matches.length) {
    return `Kaunsa ${kind} chahiye? Uska naam batao.`;
  }

  return demoAnswer(
    matches.map(r =>
      `${r.name || r.type}\n` +
      `Purpose: ${r.purpose || "Not specified"}\n` +
      `Where to apply: ${r.applyAt || r.office || r.location || "Not specified"}\n` +
      `Documents: ${(r.sampleDocuments || r.requiredDocuments || r.documents || []).join(", ") || "Not specified"}`
    ).join("\n\n")
  );
}

function scholarshipAnswer(question) {
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
    return (
      "UP Scholarship Uttar Pradesh Government ki scheme hai.\n\n" +
      "General checklist mein Aadhaar details, photo, income certificate, domicile/residence certificate, previous marksheet, admission/course proof, fee receipt aur bank details ho sakte hain.\n\n" +
      "Category aur fresh/renewal application ke hisaab se requirements badal sakti hain. Current session ki final list official UP Scholarship portal par verify karein."
    );
  }

  return (
    "UP Scholarship Uttar Pradesh Government ki scheme hai, university ki apni scholarship se alag.\n\n" +
    "Main documents checklist, fresh/renewal application, status ya hard-copy submission guidance de sakta hoon. Current session ki final requirements official portal se verify karein."
  );
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

app.post("/api/chat", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim().slice(0, 500);

    if (!question) {
      return res.status(400).json({
        answer: "Pehle apna sawaal type karo."
      });
    }

    const ctx = sanitizeContext(req.body?.context);
    const p = await understandQuestion(question, ctx);

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
        answer = findFacultyRoom(ctx?.facultyIds);
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
        answer = findIntro();
        break;
      case "hostel":
        answer = findHostel(p);
        break;
      case "event":
        answer = findEvents();
        break;
      case "certificate":
        answer = findCertificateOrDocument(p, "certificate");
        break;
      case "document":
        answer = findCertificateOrDocument(p, "document");
        break;
      case "scholarship":
        answer = scholarshipAnswer(question);
        break;
      case "unrelated":
        answer = "Main university-related topics mein help karta hoon: teachers, fees, rooms, exams, question papers, campus locations, hostels, events, certificates, documents aur scholarship guidance.";
        break;
      default: {
        // Local matching did not understand: optionally ask the n8n AI helper.
        const aiAnswer = await askN8n(question);

        answer = aiAnswer
          ? demoAnswer("🤖 " + aiAnswer)
          : "Ye sawaal mujhe poori tarah samajh nahi aaya. Main teachers, fees, exams, rooms, hostels, campus locations, papers aur scholarship mein help kar sakta hoon. Neeche se koi sawaal try karo 👇";
      }
    }

    // Keep the old context for messages that carry no topic.
    const keepContext = ["unknown", "unrelated", "intro"].includes(p.intent);

    const context = keepContext
      ? ctx
      : {
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
      answer,
      intent: p.intent,
      demoData: true,
      context,
      suggestions: suggestionsFor(p.intent, facultyIds)
    });
  } catch (error) {
    console.error("Chat API error:", error);

    res.status(500).json({
      answer: "Request process nahi ho paayi. Dobara try karo."
    });
  }
});

// Last-resort error handler so one bad request can never crash the server.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ answer: "Kuch gadbad ho gayi. Dobara try karo." });
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
