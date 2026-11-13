"use strict";
const express = require("express");
const OpenAI = require("openai");
const router = express.Router();

// These records are deliberately fictional and visibly labelled as demo data.
const DEMO_OPPORTUNITIES = [
  { id: "demo-hack-01", title: "Campus Innovation Hackathon", category: "Hackathon", mode: "On campus / demo", eligibility: "Open to student teams (sample eligibility)", deadline: "To be announced", source: "Sample listing — not an official event", verified: false },
  { id: "demo-intern-01", title: "AI & Software Internship Search Sprint", category: "Internship", mode: "Online learning activity", eligibility: "Students exploring AI/software roles", deadline: "Self-paced", source: "Curated demo activity — not a job offer", verified: false },
  { id: "demo-work-01", title: "Build a Portfolio Workshop", category: "Workshop", mode: "Self-paced", eligibility: "Beginner-friendly", deadline: "No fixed deadline", source: "Sample learning activity", verified: false },
  { id: "demo-scholar-01", title: "Scholarship Readiness Checklist", category: "Scholarship", mode: "Guidance", eligibility: "Check the official scheme rules before applying", deadline: "Check official portal", source: "Guidance only — not an active scholarship announcement", verified: false }
];

const ROADMAPS = {
  "full stack": [
    ["Web foundations", "HTML, CSS, JavaScript, Git", "Build a responsive personal portfolio"],
    ["Frontend development", "DOM, async JavaScript, React", "Build a dashboard with API integration"],
    ["Backend development", "Node.js, Express, REST APIs", "Build an authenticated CRUD API"],
    ["Database & deployment", "SQL, PostgreSQL, testing, deployment", "Deploy a full-stack student project"]
  ],
  "ai ml": [
    ["Programming foundations", "Python, problem solving, Git", "Build Python utilities and data scripts"],
    ["Math & data", "Linear algebra basics, probability, NumPy, pandas", "Explore and explain a small dataset"],
    ["Machine learning", "Scikit-learn, model evaluation, feature engineering", "Build a documented prediction project"],
    ["LLM applications", "Prompt design, embeddings, retrieval, evaluation", "Build a source-grounded study assistant"]
  ],
  "data science": [
    ["Python & statistics", "Python, probability, descriptive statistics", "Analyse a public dataset"],
    ["Data handling", "SQL, pandas, NumPy, cleaning", "Create a reproducible analysis notebook"],
    ["Visualisation & ML", "Charts, scikit-learn, evaluation", "Build an insight dashboard"],
    ["Portfolio", "Storytelling, reproducibility, deployment", "Publish two end-to-end case studies"]
  ],
  "cybersecurity": [
    ["Foundations", "Networking, Linux, operating systems", "Create a home lab and document it"],
    ["Security basics", "HTTP, OWASP concepts, cryptography basics", "Complete legal beginner security labs"],
    ["Defensive skills", "Logs, threat modelling, secure coding", "Write a defensive security checklist"],
    ["Specialisation", "Cloud security or application security", "Publish a responsible, ethical lab report"]
  ],
  "competitive programming": [
    ["Core programming", "One language, complexity, arrays, strings", "Solve beginner problems consistently"],
    ["Data structures", "Stacks, queues, hash maps, linked lists", "Implement and test core structures"],
    ["Algorithms", "Sorting, binary search, recursion, greedy", "Solve topic-wise practice sets"],
    ["Advanced problem solving", "Trees, graphs, dynamic programming", "Review contest submissions and explain solutions"]
  ]
};

const TEAM_DEMOS = [
  { id: "demo-member-1", alias: "Frontend Builder", skills: ["HTML", "CSS", "JavaScript", "React"], interests: ["web", "AI"], availability: "Evenings", demo: true },
  { id: "demo-member-2", alias: "Python Explorer", skills: ["Python", "ML", "Data"], interests: ["AI", "hackathons"], availability: "Weekends", demo: true },
  { id: "demo-member-3", alias: "Backend Learner", skills: ["Node.js", "Express", "SQL"], interests: ["web", "automation"], availability: "Flexible", demo: true }
];

function cleanText(value, max) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max || 120);
}
function normalizeGoal(value) {
  const s = cleanText(value, 80).toLowerCase();
  if (/ai|ml|machine learning|artificial/.test(s)) return "ai ml";
  if (/data|analyst|analytics/.test(s)) return "data science";
  if (/cyber|security|ethical hack/.test(s)) return "cybersecurity";
  if (/competitive|leetcode|dsa|programming/.test(s)) return "competitive programming";
  return "full stack";
}
function makeOpenAI() {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (key.length < 20 || /your_api_key|here/i.test(key)) return null;
  return new OpenAI({ apiKey: key, timeout: 20000, maxRetries: 0 });
}
const ai = makeOpenAI();

router.get("/meta", (req, res) => {
  res.json({
    version: "2.0",
    modules: ["career", "radar", "teams", "xp", "study", "directory", "automation"],
    aiStudyEnabled: Boolean(ai),
    n8nEnabled: Boolean(process.env.N8N_SMART_CAMPUS_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL),
    databaseEnabled: Boolean(process.env.DATABASE_URL || process.env.SUPABASE_URL),
    authenticationEnabled: false,
    demoData: true
  });
});

router.get("/radar", (req, res) => {
  const requested = cleanText(req.query.category || "all", 40).toLowerCase();
  const items = requested === "all" ? DEMO_OPPORTUNITIES : DEMO_OPPORTUNITIES.filter(item => item.category.toLowerCase() === requested);
  res.json({ items, demoData: true, verifiedOnly: false, notice: "Sample records only. No live registrations or deadlines are represented." });
});

router.post("/career/plan", (req, res) => {
  const goal = normalizeGoal(req.body && req.body.goal);
  const skills = Array.isArray(req.body && req.body.skills) ? req.body.skills.slice(0, 20).map(item => cleanText(item, 32)).filter(Boolean) : [];
  const titles = { "ai ml": "AI / Machine Learning", "data science": "Data Science", cybersecurity: "Cybersecurity", "competitive programming": "Competitive Programming", "full stack": "Full-Stack Development" };
  const skillList = ROADMAPS[goal].flatMap(step => step[1].split(", "));
  res.json({
    goal, title: titles[goal], currentSkills: skills,
    skillGap: skillList.filter(skill => !skills.some(own => own.toLowerCase() === skill.toLowerCase())).slice(0, 10),
    stages: ROADMAPS[goal].map((step, index) => ({ step: index + 1, title: step[0], skills: step[1], project: step[2] })),
    disclaimer: "Suggested learning roadmap, not a placement prediction or employment guarantee."
  });
});

router.get("/teams", (req, res) => {
  const skills = cleanText(req.query.skills || "", 200).toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const people = TEAM_DEMOS.map(person => {
    const overlap = skills.filter(skill => person.skills.some(own => own.toLowerCase().includes(skill) || skill.includes(own.toLowerCase())));
    return Object.assign({}, person, { matchScore: skills.length ? Math.round(overlap.length / skills.length * 100) : 0, matchingSkills: overlap });
  }).sort((a, b) => b.matchScore - a.matchScore);
  res.json({ people, demoData: true, notice: "These are fictional sample profiles. Real student matching needs sign-in, consent and moderation." });
});

router.get("/directory", (req, res) => {
  res.json({ records: [], demoData: true, notice: "No verified live campus directory is connected. We will not guess faculty names, cabin numbers or building locations." });
});

router.post("/study/assist", async (req, res) => {
  const topic = cleanText(req.body && req.body.topic, 1600);
  const level = cleanText(req.body && req.body.level || "beginner", 40);
  const mode = cleanText(req.body && req.body.mode || "explain", 40);
  if (!topic) return res.status(400).json({ error: "Please enter a topic or question." });
  if (!ai) {
    return res.status(503).json({ error: "StudyMate AI is not configured yet. Add OPENAI_API_KEY in the server environment to enable generated explanations.", fallback: "Your StudyMate request is ready. Add an AI API key to generate explanations, notes summaries, flashcards or practice questions." });
  }
  try {
    const response = await ai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      instructions: "You are StudyMate, a careful university study tutor. Explain accurately at the requested level. Do not invent facts or claim this is official GLA material. Use headings and examples. For summaries, summarise only user-provided text. For flashcards, return question/answer pairs. For practice, include solutions after the questions. Reply in the language used by the student (English, Hindi or Hinglish).",
      input: "Mode: " + mode + "\nLevel: " + level + "\nTopic or supplied notes:\n" + topic
    });
    res.json({ answer: response.output_text || "I could not create a response. Please try again.", generated: true });
  } catch (error) {
    console.error("StudyMate error:", error.message);
    res.status(502).json({ error: "StudyMate could not reach the AI service. Please try again." });
  }
});

// Server-to-server only: browser code never receives the n8n URL or shared secret.
router.post("/automation/dispatch", async (req, res) => {
  const shared = process.env.AUTOMATION_API_KEY || "";
  const supplied = String(req.get("x-automation-key") || "");
  const crypto = require("crypto");
  const digest = value => crypto.createHash("sha256").update(value).digest();
  if (!shared || !crypto.timingSafeEqual(digest(shared), digest(supplied))) return res.status(403).json({ error: "forbidden" });
  const allowed = new Set(["certificate_request", "opportunity_alert", "deadline_reminder", "admin_digest"]);
  const event = cleanText(req.body && req.body.event, 40);
  if (!allowed.has(event)) return res.status(400).json({ error: "Unsupported automation event." });
  const ok = await dispatchEvent(event, req.body && req.body.payload || {});
  if (!ok) return res.status(502).json({ error: "Could not reach the configured n8n webhook." });
  res.json({ ok: true, event });
});

async function dispatchEvent(event, payload) {
  const webhook = process.env.N8N_SMART_CAMPUS_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    const result = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json", "x-devagya-event": event },
      body: JSON.stringify({ event, payload: payload || {}, sentAt: new Date().toISOString(), source: "Devagya 2.0" }),
      signal: AbortSignal.timeout(10000)
    });
    return result.ok;
  } catch (error) {
    console.error("n8n dispatch error:", error.message);
    return false;
  }
}
router.dispatchEvent = dispatchEvent;

module.exports = router;
