// The clinic code is the tenant slug patients type into the app, so it must be short, readable and safe.
const RESERVED = new Set(["admin", "api", "www", "app", "login", "register", "nestcare", "support", "billing"]);

// Returns an error message, or null when valid. Input is lower-cased by the caller.
function clinicCodeError(code) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code)) return "Clinic code can use lowercase letters, numbers and single hyphens";
  if (code.length < 3 || code.length > 40) return "Clinic code must be 3-40 characters";
  if (RESERVED.has(code)) return "That clinic code is reserved";
  return null;
}

module.exports = { clinicCodeError };

if (require.main === module) {
  const assert = require("assert");
  assert.strictEqual(clinicCodeError("dr-sharma-clinic"), null);
  assert.ok(clinicCodeError("Dr Sharma"));
  assert.ok(clinicCodeError("ab"));
  assert.ok(clinicCodeError("a--b"));
  assert.ok(clinicCodeError("-abc"));
  assert.ok(clinicCodeError("admin"));
  assert.ok(clinicCodeError("x".repeat(41)));
  console.log("clinicCode ok");
}
