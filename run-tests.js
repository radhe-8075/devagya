/*
 * Devagya automated tests.
 * Run with:  npm test
 * Starts the real server in-process on a random port and checks the answers.
 */
process.env.OPENAI_API_KEY = "";   // tests must not depend on any external AI
process.env.N8N_WEBHOOK_URL = "";

const app = require("./server");

const tests = [
  // [name, [questions in order], expected intent of LAST question, text the answer must contain]
  ["Intro in Hinglish",              ["tum kon ho"],                                  "intro",   "Devagya"],
  ["Faculty by subject",            ["Who is the English teacher?"],                 "faculty", "Demo English Faculty"],
  ["HOD lookup",                    ["Who is the CSE HOD?"],                         "faculty", "Room 3001"],
  ["Faculty with name + branch",    ["Dr. Neha Verma CSE"],                          "faculty", "Room 302"],
  ["Exam schedule",                 ["Data Structures exam kab hai?"],               "exam",    "15 Nov"],
  ["Exam fee",                      ["Exam fees kitni hai?"],                        "fee",     "2,500"],
  ["Tuition fee MBA",               ["MBA tuition fee"],                             "fee",     "90,000"],
  ["Hostel fee (not hostel list)",  ["hostel fee kitni hai"],                        "fee",     "85,000"],
  ["Hostel list girls",             ["Girls hostel list"],                           "hostel",  "Girls Hostel 2"],
  ["Campus: library",               ["Library kahan hai?"],                          "campus",  "Library Block L"],
  ["Campus: unknown location is honest", ["Cafe GD kahan hai"],                      "campus",  "confirm nahi"],
  ["Room lookup",                   ["Room 3001 kis block mein hai?"],               "room",    "Academic Block A"],
  ["Room that does not exist",      ["Room 9999 kis block mein hai?"],               "room",    "record nahi mila"],
  ["Previous-year paper",           ["B.Tech CSE semester 3 Data Structures ka 2025 paper do"], "paper", "2025"],
  ["Attendance rule",               ["attendance rule"],                             "academic","75%"],
  ["Scholarship documents",         ["scholarship documents"],                       "scholarship","UP Scholarship"],
  ["Typo: facluty",                 ["facluty list CSE HOD"],                        "faculty", "Aarav Sharma"],
  ["Typo: hostle",                  ["hostle list girls"],                           "hostel",  "Girls Hostel 1"],
  ["Hinglish: paisa",               ["kitna paisa lagega hostel ka"],                "fee",     "85,000"],
  ["Word 'sirf' is not 'sir'",      ["sirf ek sawaal hai"],                          "unknown", "samajh nahi aaya"],
  ["Gibberish gets a safe fallback",["random gibberish xyz"],                        "unknown", "samajh nahi aaya"],
  ["Follow-up: uska room",          ["Dr. Neha Verma CSE", "uska room kaunsa hai?"], "faculty_room", "Room 302"],
  ["Follow-up: aur MBA ki?",        ["B.Tech CSE tuition fee", "aur MBA ki?"],       "fee",     "90,000"],
  ["Follow-up: iski fees",          ["Data Structures exam kab hai?", "iski fees kitni hai?"], "fee", "75,000"],
  ["Follow-up: paper after exam",   ["B.Tech CSE exam dates batao", "Data Structures ka 2025 paper do"], "paper", "2025"]
];

async function call(base, question, context) {
  const response = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context })
  });

  return { status: response.status, body: await response.json() };
}

(async () => {
  const server = app.listen(0);
  const base = "http://localhost:" + server.address().port;

  let passed = 0;
  let failed = 0;

  function report(name, ok, detail) {
    ok ? passed++ : failed++;
    console.log((ok ? "PASS" : "FAIL") + "  " + name + (ok ? "" : "  -> " + detail));
  }

  for (const [name, questions, intent, mustContain] of tests) {
    let context = null;
    let last;

    for (const question of questions) {
      last = await call(base, question, context);
      context = last.body.context || context;
    }

    const answer = String(last.body.answer || "");
    const ok = last.body.intent === intent && answer.includes(mustContain);

    report(name, ok, `intent=${last.body.intent}, expected ${intent}; answer must include "${mustContain}"`);
  }

  // ---- API / safety checks ----
  const empty = await call(base, "", null);
  report("Empty question is rejected (400)", empty.status === 400, "status " + empty.status);

  const long = await call(base, "exam ".repeat(1000), null);
  report("Very long question does not crash", long.status === 200, "status " + long.status);

  const health = await (await fetch(base + "/api/health")).json();
  report("Health endpoint reports ok", health.status === "ok", JSON.stringify(health));

  for (const file of ["/server.js", "/.env", "/package.json"]) {
    const response = await fetch(base + file);
    report(`Private file ${file} is not downloadable`, response.status === 404, "status " + response.status);
  }

  const page = await fetch(base + "/");
  report("Website page loads", page.status === 200, "status " + page.status);

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
  server.close();
  process.exit(failed ? 1 : 0);
})();
