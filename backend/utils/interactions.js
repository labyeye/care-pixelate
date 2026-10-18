// Curated list of well-known, clinically significant drug pairs. A soft alert for the prescriber, never a block,
// and NOT a complete interaction database: it covers common high-risk pairs only. [a, b, what happens]
const PAIRS = [
  ["warfarin", "aspirin", "raises bleeding risk"],
  ["warfarin", "ibuprofen", "raises bleeding risk"],
  ["warfarin", "diclofenac", "raises bleeding risk"],
  ["warfarin", "metronidazole", "raises INR / bleeding risk"],
  ["warfarin", "azithromycin", "may raise INR"],
  ["clopidogrel", "omeprazole", "omeprazole reduces clopidogrel effect"],
  ["clopidogrel", "aspirin", "raises bleeding risk"],
  ["rivaroxaban", "aspirin", "raises bleeding risk"],
  ["apixaban", "aspirin", "raises bleeding risk"],
  ["enalapril", "spironolactone", "risk of high potassium"],
  ["ramipril", "spironolactone", "risk of high potassium"],
  ["losartan", "spironolactone", "risk of high potassium"],
  ["telmisartan", "spironolactone", "risk of high potassium"],
  ["enalapril", "ibuprofen", "may reduce BP control and harm kidneys"],
  ["losartan", "diclofenac", "may reduce BP control and harm kidneys"],
  ["atenolol", "verapamil", "risk of bradycardia / heart block"],
  ["metoprolol", "verapamil", "risk of bradycardia / heart block"],
  ["digoxin", "amiodarone", "raises digoxin level"],
  ["digoxin", "furosemide", "low potassium raises digoxin toxicity"],
  ["sildenafil", "nitroglycerin", "severe drop in blood pressure"],
  ["sildenafil", "isosorbide", "severe drop in blood pressure"],
  ["metformin", "contrast", "risk of lactic acidosis around contrast dye"],
  ["ciprofloxacin", "theophylline", "raises theophylline toxicity"],
  ["ciprofloxacin", "tizanidine", "raises tizanidine level"],
  [
    "clarithromycin",
    "atorvastatin",
    "raises statin level (muscle damage risk)",
  ],
  ["erythromycin", "atorvastatin", "raises statin level (muscle damage risk)"],
  ["fluconazole", "atorvastatin", "raises statin level (muscle damage risk)"],
  ["fluoxetine", "tramadol", "risk of serotonin syndrome / seizures"],
  ["sertraline", "tramadol", "risk of serotonin syndrome / seizures"],
  ["escitalopram", "tramadol", "risk of serotonin syndrome / seizures"],
  ["alprazolam", "tramadol", "risk of heavy sedation / breathing depression"],
  ["diazepam", "tramadol", "risk of heavy sedation / breathing depression"],
  ["clonazepam", "alcohol", "heavy sedation"],
  ["methotrexate", "ibuprofen", "raises methotrexate toxicity"],
  ["methotrexate", "trimethoprim", "raises methotrexate toxicity"],
  ["levothyroxine", "calcium", "calcium blocks absorption; give 4 hours apart"],
  ["levothyroxine", "iron", "iron blocks absorption; give 4 hours apart"],
  ["tetracycline", "calcium", "calcium blocks absorption"],
  ["doxycycline", "iron", "iron blocks absorption"],
  ["lithium", "ibuprofen", "raises lithium level"],
  ["lithium", "hydrochlorothiazide", "raises lithium level"],
  ["allopurinol", "amoxicillin", "higher chance of skin rash"],
  ["sumatriptan", "fluoxetine", "risk of serotonin syndrome"],
];

const norm = (s) => String(s || "").toLowerCase();
const hit = (it, key) =>
  `${norm(it.drug)} ${norm(it.genericName)}`.includes(key);

// items: prescription items ({drug, genericName}). Returns readable warning strings, one per interacting pair.
function interactionWarnings(items = []) {
  const out = [];
  const seen = new Set();
  for (const [a, b, why] of PAIRS) {
    const x = items.find((i) => hit(i, a));
    const y = items.find((i) => hit(i, b));
    if (x && y && x !== y && !seen.has(a + b)) {
      seen.add(a + b);
      out.push(`${x.drug} + ${y.drug}: ${why}`);
    }
  }
  return out;
}

module.exports = { interactionWarnings };

if (require.main === module) {
  const assert = require("assert");
  const w = interactionWarnings([
    { drug: "Warfarin 5mg" },
    { drug: "Disprin", genericName: "Aspirin" },
    { drug: "Paracetamol" },
  ]);
  assert.deepStrictEqual(w, ["Warfarin 5mg + Disprin: raises bleeding risk"]);
  assert.deepStrictEqual(
    interactionWarnings([{ drug: "Paracetamol" }, { drug: "Cetirizine" }]),
    [],
  );
  assert.deepStrictEqual(
    interactionWarnings([{ drug: "Warfarin + aspirin combo" }]),
    [],
    "one item is not a pair",
  );
  assert.strictEqual(
    interactionWarnings([{ drug: "Sildenafil" }, { drug: "Nitroglycerin" }])
      .length,
    1,
  );
  console.log("interactions ok");
}
