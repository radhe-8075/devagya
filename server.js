
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

const ai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 8000, maxRetries: 0 })
  : null;

const DEMO_NOTICE =
  "\n\n⚠️ Dummy Data — For Demonstration Only. Official university information nahi hai.";

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(text, words) {
  return words.some(word => text.includes(normalize(word)));
}

function extractDetails(question) {
  const q = normalize(question);

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

  let feeType = "tuition";

  if (contains(q, ["hostel fee", "hostel fees"])) {
    feeType = "hostel";
  } else if (contains(q, ["transport", "bus fee", "bus fees"])) {
    feeType = "transport";
  } else if (contains(q, ["exam fee", "examination fee"])) {
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
    /\b(?:dr\.?|doctor|prof\.?|professor|mr\.?|mrs\.?|ms\.?)\s+([a-z]+(?:\s+[a-z]+){0,2})/i
  );

  let intent = "unknown";

  if (introIntent) intent = "intro";
  else if (scholarshipIntent) intent = "scholarship";
  else if (certificateIntent) intent = "certificate";
  else if (documentIntent) intent = "document";
  else if (eventIntent) intent = "event";
  else if (paperIntent) intent = "paper";
  else if (hostelIntent) intent = "hostel";
  else if (facultyIntent || subject) intent = "faculty";
  else if (roomIntent) intent = "room";
  else if (feeIntent) intent = "fee";
  else if (examIntent) intent = "exam";
  else if (campusIntent) intent = "campus";
  else if (academicIntent) intent = "academic";

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
    designation,
    name: nameMatch ? nameMatch[0] : ""
  };
}

async function understandQuestion(question) {
  const parsed = extractDetails(question);

  // In these cases, local matching must not be overwritten by AI.
  const protectedIntents = [
    "intro",
    "hostel",
    "campus",
    "faculty",
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

function demoAnswer(text) {
  return text + DEMO_NOTICE;
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
    return `Matching ${p.subject ? `${p.subject} subject teacher` : "faculty"} ka demo record nahi mila. Main kisi teacher ka subject guess nahi karunga.`;
  }

  if (list.length > 1 && p.name) {
    return demoAnswer(
      "Ek se zyada matching faculty records mile:\n" +
      list.map((f, i) =>
        `${i + 1}. ${f.name} — ${f.department}, ${f.designation}, ${f.course}; Room ${f.room}`
      ).join("\n") +
      "\nDepartment ya designation specify karo."
    );
  }

  return demoAnswer(
    list.map(f =>
      `${f.name} — ${f.department}, ${f.designation}, ${f.course}; Office: ${f.block}, ${f.floor}, Room ${f.room}${f.subjects?.length ? `; Subjects: ${f.subjects.join(", ")}` : ""}`
    ).join("\n")
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
      `Room ${r.room}: ${r.block}, ${r.floor}. Purpose: ${r.purpose || "Not specified"}.`
    ).join("\n")
  );
}

function findFee(p) {
  const fees = (knowledgeBase.fees || []).filter(f =>
    (!p.course || f.course === p.course) &&
    (!p.branch || f.branch === p.branch) &&
    f.feeType === p.feeType
  );

  if (!fees.length) {
    return "Is fee type ka dummy record nahi mila. Course, branch aur fee type batao. Missing fee ka amount guess nahi kiya jayega.";
  }

  return demoAnswer(
    fees.map(f =>
      `${f.course} ${f.branch} ${f.feeType} fee: ₹${Number(f.amount).toLocaleString("en-IN")} per ${f.period} (${f.academicYear}).`
    ).join("\n")
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
    return "Is combination ka dummy paper record nahi mila. Subject, branch, semester ya year check karo.";
  }

  return demoAnswer(
    papers.map(paper => {
      const safeFile = path.basename(paper.file);
      const filePath = path.join(__dirname, "public", "papers", safeFile);

      return fs.existsSync(filePath)
        ? `${paper.year}: /papers/${encodeURIComponent(safeFile)}`
        : `${paper.year}: PDF abhi available nahi hai.`;
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
    return "Matching exam schedule nahi mila. Course, branch, semester aur subject batao.";
  }

  return demoAnswer(
    exams.map(e =>
      `${e.subject} — ${e.examType}\n` +
      `${e.course} ${e.branch}, Semester ${e.semester}\n` +
      `Date: ${e.date}\nTime: ${e.time}\nVenue: ${e.venue}`
    ).join("\n\n")
  );
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
    list.map(c =>
      `${c.name}: ${c.block || "Block not specified"}${c.room ? `, Room ${c.room}` : ""}${c.floor ? `, ${c.floor}` : ""}. ${c.location || "Exact directions are not specified in this demo record."}`
    ).join("\n")
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
    list.map(a => `${a.type}: ${a.details}`).join("\n")
  );
}

function findHostel(p) {
  const all = Array.isArray(knowledgeBase.hostels)
    ? knowledgeBase.hostels
    : [];

  const q = p.q;

  const girls = contains(q, [
    "girl",
    "girls",
    "ladies",
    "female",
    "लड़कियों"
  ]);

  const boys = contains(q, [
    "boy",
    "boys",
    "gents",
    "male",
    "लड़कों"
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
      `${h.name} (${h.type}) — ${h.block}; Location: ${h.location}`
    ).join("\n") +
    "\nNote: Ye sample/demo hostel names hain. Exact official names aur locations confirm karne baaki hain."
  );
}

function findIntro() {
  const a = knowledgeBase.assistant || {};

  return demoAnswer(
    `${a.name || "Devagya"} — ${a.role || "University Student Assistance Chatbot"}.\n` +
    `${a.purpose || "I help with university-related demo information."}\n` +
    `Created by: ${a.createdBy || "The developer of this student-assistance demo project."}\n` +
    `Languages: ${(a.languages || ["English", "Hindi", "Hinglish"]).join(", ")}`
  );
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
    message: "Devagya demo assistant is running."
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();

    if (!question) {
      return res.status(400).json({
        answer: "Pehle apna sawaal type karo."
      });
    }

    const p = await understandQuestion(question);
    let answer;

    switch (p.intent) {
      case "faculty":
        answer = findFaculty(p);
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
      case "exam":
        answer = findExam(p);
        break;
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
      default:
        answer = "University ka topic clear karo: teacher/subject/HOD, fees, room, exam, paper, campus location, hostel, event, certificate, document ya scholarship.";
    }

    res.json({
      answer,
      intent: p.intent,
      demoData: true
    });
  } catch (error) {
    console.error("Chat API error:", error);

    res.status(500).json({
      answer: "Request process nahi ho paayi. VS Code terminal mein error check karo."
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
