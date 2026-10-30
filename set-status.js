/*
 * Staff tool for the demo: change the status of a request.
 *
 *   node set-status.js list
 *   node set-status.js BON-1001 "Under Review"
 *
 * Statuses: Submitted, Under Review, Approved, Ready for Collection, Rejected
 * Works on the same data/requests.json file that the server reads.
 */
const workflow = require("./workflow");

const [a, b] = process.argv.slice(2);

if (!a || a === "list") {
  const all = workflow.listRequests();
  if (!all.length) console.log("No requests yet.");
  all.forEach(r => console.log(`${r.id}  ${r.status.padEnd(20)} ${r.certificate}  (${r.name})`));
  process.exit(0);
}

const result = workflow.setStatus(a, b);
console.log(result.ok ? `OK: ${result.request.id} is now "${result.request.status}"` : "ERROR: " + result.error);
process.exit(result.ok ? 0 : 1);
