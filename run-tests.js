/*
 * Devagya automated tests.
 * Run with:  npm test
 * Starts the real server in-process on a random port and checks the answers.
 */
process.env.OPENAI_API_KEY = "";   // tests must not depend on any external AI
process.env.N8N_WEBHOOK_URL = "";
process.env.REQUESTS_FILE = require("path").join(require("os").tmpdir(), "devagya-test-requests-" + process.pid + ".json");
process.env.ADMIN_KEY = "test-admin-key";
try { require("fs").unlinkSync(process.env.REQUESTS_FILE); } catch (e) {}

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
  ["Gibberish gets a safe fallback (English)", ["random gibberish xyz"],            "unknown", "couldn't fully understand"],
  ["Unknown Hinglish gets Hinglish fallback", ["sirf ek sawaal hai"],               "unknown", "samajh nahi aaya"],
  ["Follow-up: uska room",          ["Dr. Neha Verma CSE", "uska room kaunsa hai?"], "faculty_room", "Room 302"],
  ["Follow-up: aur MBA ki?",        ["B.Tech CSE tuition fee", "aur MBA ki?"],       "fee",     "90,000"],
  ["Follow-up: iski fees",          ["Data Structures exam kab hai?", "iski fees kitni hai?"], "fee", "75,000"],
  // ---- language: answers follow the language of the question ----
  ["English question -> English answer",       ["Where is the library?"],            "campus", "not official university information"],
  ["English room not found",                   ["Which block is Room 9999 in?"],     "room",   "No record for Room 9999"],
  ["English exam fee",                         ["What is the exam fee for B.Tech CSE?"], "fee", "2,500"],
  ["Hindi: library",                           ["लाइब्रेरी कहाँ है?"],                "campus", "डेमो डेटा"],
  ["Hindi: hostel fee",                        ["हॉस्टल फीस कितनी है?"],              "fee",    "85,000"],
  ["Hindi: exam date",                         ["परीक्षा कब है?"],                    "exam",   "15 नव॰"],
  ["Hindi: English teacher",                   ["अंग्रेज़ी के टीचर कौन हैं?"],         "faculty","डेमो English फैकल्टी"],
  ["Hindi: girls hostel list",                 ["लड़कियों के हॉस्टल की लिस्ट"],        "hostel", "गर्ल्स हॉस्टल 1"],
  ["Hindi: HOD cabin (एचओडी)",                 ["एचओडी सर का केबिन कहाँ है"],          "faculty","Dr. Aarav Sharma"],
  ["Hindi: exam fee label in Hindi",            ["परीक्षा फीस कितनी है?"],             "fee",    "परीक्षा शुल्क"],
  ["English: HOD cabin",                        ["where is hod sir cabin"],            "faculty","I found 2 matching faculty records"],
  ["Hindi follow-up: उसका रूम",                ["Dr. Neha Verma CSE", "उसका रूम कौन सा है?"], "faculty_room", "Room 302"],
  ["Hindi unknown gets Hindi fallback",        ["ज़रूरी बात"],                        "unknown","समझ नहीं पाया"],
  ["Follow-up: paper after exam",   ["B.Tech CSE exam dates batao", "Data Structures ka 2025 paper do"], "paper", "2025"]
];

async function call(base, question, context, workflow) {
  const response = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context, workflow })
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
  // ---- every suggestion chip, in all 3 languages, must lead to a real answer ----
  const seeds = {
    en: ["Dr. Neha Verma CSE", "When is the Data Structures exam?", "What is the MBA tuition fee?", "Girls hostel list", "Where is the library?", "B.Tech CSE semester 3 Data Structures 2025 paper", "random gibberish xyz"],
    hinglish: ["Dr. Neha Verma kahan baithti hain", "Data Structures exam kab hai?", "MBA tuition fee kitni hai?", "Girls hostel ki list batao", "Library kahan hai?", "B.Tech CSE semester 3 Data Structures ka 2025 paper do", "sirf ek sawaal hai"],
    hi: ["Dr. Neha Verma CSE के टीचर का रूम", "परीक्षा कब है?", "MBA की ट्यूशन फीस कितनी है?", "लड़कियों के हॉस्टल की लिस्ट", "लाइब्रेरी कहाँ है?", "B.Tech CSE सेमेस्टर 3 Data Structures 2025 पेपर", "ज़रूरी बात"]
  };

  for (const [lang, questions] of Object.entries(seeds)) {
    let chipCount = 0;
    const badChips = [];

    for (const seed of questions) {
      const first = await call(base, seed, null);

      for (const chip of first.body.suggestions || []) {
        chipCount++;
        const next = await call(base, chip, first.body.context);

        if (next.body.intent === "unknown" || next.body.lang !== lang) {
          badChips.push(`"${chip}" -> ${next.body.intent}/${next.body.lang}`);
        }
      }
    }

    report(`All ${chipCount} suggestion chips work (${lang})`, badChips.length === 0, badChips.join("; "));
  }


  // ---- service-request workflow: apply -> Request ID -> tracking ----
  // A tiny "browser": remembers workflow state between messages like script.js does.
  function newChat() {
    const chat = { wf: null, ctx: null };
    chat.say = async question => {
      const r = await call(base, question, chat.ctx, chat.wf);
      chat.ctx = r.body.context || chat.ctx;
      chat.wf = r.body.workflow || null;
      return r.body;
    };
    return chat;
  }

  async function runApply(messages) {
    const chat = newChat();
    let last;
    for (const m of messages) last = await chat.say(m);
    return { chat, last };
  }

  const info = await newChat().say("I need information about a bonafide certificate");
  report("Workflow: asking for bonafide INFO does not start the form",
    info.intent === "certificate" && !info.workflow && info.answer.includes("Student Services Desk") && !info.answer.includes("Character Certificate"),
    "intent=" + info.intent);

  const infoHi = await newChat().say("बोनाफाइड सर्टिफिकेट की जानकारी चाहिए");
  report("Workflow: Hindi bonafide INFO question gets the record in Hindi",
    infoHi.intent === "certificate" && infoHi.answer.includes("उद्देश्य") && !infoHi.answer.includes("Character"),
    infoHi.answer);
  const infoHing = await newChat().say("bonafide certificate ki jaankari chahiye");
  report("Workflow: Hinglish bonafide INFO question gets the record in Hinglish",
    infoHing.intent === "certificate" && infoHing.answer.includes("Kahan apply karein"), infoHing.answer);

  const direct = await newChat().say("I need a bonafide certificate");
  report("Workflow: 'I need a bonafide certificate' starts the form",
    direct.intent === "workflow", "intent=" + direct.intent);

  const how = await newChat().say("How do I apply for a bonafide certificate?");
  report("Workflow: 'how do I apply' is information, not the form",
    how.intent === "certificate" && !how.workflow, "intent=" + how.intent);

  const start = await newChat().say("I want to apply for a bonafide certificate");
  report("Workflow: apply request starts the guided form (asks name)",
    start.intent === "workflow" && start.workflow && start.workflow.step === "name" && /name/i.test(start.answer),
    JSON.stringify(start.workflow));

  const full = await runApply([
    "I want to apply for a bonafide certificate", "Test Student", "TEST-1234", "Bonafide Certificate"
  ]);
  const idMatch = String(full.last.answer).match(/BON-\d{4}/);
  report("Workflow: full apply flow creates a request with ID BON-xxxx",
    full.last.intent === "request_created" && idMatch && full.last.workflow === null,
    full.last.answer);

  const requestId = idMatch ? idMatch[0] : "BON-0000";

  const tracked = await newChat().say("What is the status of my request " + requestId + "?");
  report("Workflow: status of the new request is returned (Submitted)",
    tracked.intent === "request_status" && tracked.answer.includes(requestId) && tracked.answer.includes("Submitted"),
    tracked.answer);
  report("Workflow: status reply hides the full student name and roll number",
    !tracked.answer.includes("Test Student") && !tracked.answer.includes("TEST-1234") && tracked.answer.includes("T***"),
    tracked.answer);

  const missing = await newChat().say("status of BON-9999");
  report("Workflow: unknown Request ID gets an honest 'not found'",
    missing.intent === "request_status" && /could not find/i.test(missing.answer), missing.answer);

  const noId = await newChat().say("track my request");
  const withId = noId.workflow ? await (async () => { const c = newChat(); c.wf = noId.workflow; return c.say(requestId); })() : {};
  report("Workflow: 'track my request' asks for the ID, then answers",
    noId.workflow && noId.workflow.step === "track_id" && withId.intent === "request_status" && String(withId.answer).includes(requestId),
    JSON.stringify(noId.workflow));

  const second = await runApply([
    "Mujhe character certificate apply karna hai", "Demo Student", "TEST-5678", "Character Certificate"
  ]);
  const secondId = (String(second.last.answer).match(/CHR-\d{4}/) || [""])[0];
  report("Workflow: Hinglish apply works end to end (CHR-xxxx, Hinglish text)",
    secondId && second.last.lang === "hinglish" && second.last.answer.includes("Request ID"), second.last.answer);

  const third = await runApply([
    "I want to apply for a bonafide certificate", "Another Student", "TEST-9999", "bonafide"
  ]);
  const thirdId = (String(third.last.answer).match(/BON-\d{4}/) || [""])[0];
  report("Workflow: every request gets a different, increasing ID",
    thirdId && thirdId !== requestId && Number(thirdId.slice(4)) > Number(requestId.slice(4)),
    requestId + " then " + thirdId);

  const hindi = await runApply(["मुझे बोनाफाइड सर्टिफिकेट अप्लाई करना है", "टेस्ट छात्र", "TEST-4321", "बोनाफाइड"]);
  report("Workflow: Hindi apply works end to end",
    hindi.last.intent === "request_created" && hindi.last.lang === "hi" && hindi.last.answer.includes("रिक्वेस्ट ID"),
    hindi.last.answer);

  const chatBad = newChat();
  await chatBad.say("I want to apply for a bonafide certificate");
  const badName = await chatBad.say("12345 !!!");
  report("Workflow: invalid name is rejected and the same question is asked again",
    badName.workflow && badName.workflow.step === "name" && /letters/i.test(badName.answer), badName.answer);
  await chatBad.say("Valid Name");
  const badRoll = await chatBad.say("a");
  report("Workflow: invalid roll number is rejected",
    badRoll.workflow && badRoll.workflow.step === "roll" && /roll number/i.test(badRoll.answer), badRoll.answer);
  await chatBad.say("TEST-1111");
  const badCert = await chatBad.say("pizza");
  report("Workflow: unknown certificate type is rejected, nothing is created",
    badCert.workflow && badCert.workflow.step === "cert" && badCert.intent === "workflow", badCert.answer);

  const chatCancel = newChat();
  await chatCancel.say("I want to apply for a bonafide certificate");
  await chatCancel.say("Test Student");
  const cancelled = await chatCancel.say("cancel");
  report("Workflow: 'cancel' stops the form and clears the state",
    cancelled.intent === "workflow_cancelled" && cancelled.workflow === null, cancelled.intent);

  const tampered = await call(base, "hello", null, { type: "cert", step: "hacker", data: { name: {}, roll: [] } });
  report("Workflow: a tampered state from the browser is ignored (no crash)",
    tampered.status === 200, "status " + tampered.status);

  const timetable = await newChat().say("What is the exact timetable for next semester?");
  report("Fallback: unverified topic gets the safe 'could not verify' answer",
    timetable.intent === "unverified" && timetable.answer.includes("could not verify") && timetable.answer.includes("examination office"),
    timetable.answer);
  const resultQ = await newChat().say("what is my result");
  report("Fallback: topics with no records (results) are not guessed",
    resultQ.intent === "unverified", resultQ.intent);

  // ---- staff status change ----
  const noKey = await fetch(base + "/api/admin/status", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: requestId, status: "Under Review" })
  });
  report("Admin: changing a status without the key is refused (403)", noKey.status === 403, "status " + noKey.status);

  const wrongKey = await fetch(base + "/api/admin/status", {
    method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": "wrong" },
    body: JSON.stringify({ id: requestId, status: "Under Review" })
  });
  report("Admin: wrong key is refused (403)", wrongKey.status === 403, "status " + wrongKey.status);

  const okKey = await fetch(base + "/api/admin/status", {
    method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": "test-admin-key" },
    body: JSON.stringify({ id: requestId, status: "Under Review" })
  });
  report("Admin: correct key changes the status", okKey.status === 200, "status " + okKey.status);

  const badStatus = await fetch(base + "/api/admin/status", {
    method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": "test-admin-key" },
    body: JSON.stringify({ id: requestId, status: "Banana" })
  });
  report("Admin: invalid status value is refused (400)", badStatus.status === 400, "status " + badStatus.status);

  const after = await newChat().say("BON status " + requestId);
  report("Workflow: student now sees the updated status (Under Review)",
    after.answer.includes("Under Review"), after.answer);

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
