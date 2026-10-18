/** Common lab/diagnostic test catalogue. Reference ranges are generic adult values — the user can edit them per order. */
export type CatalogTest = {
  name: string;
  unit?: string;
  low?: number;
  high?: number;
};

// [name, unit, low, high] — numeric ranges only where a single adult range makes sense.
const t = (
  name: string,
  unit?: string,
  low?: number,
  high?: number,
): CatalogTest => ({ name, unit, low, high });

export const LAB_CATALOG: Record<string, CatalogTest[]> = {
  'Hematology / Blood': [
    t('Hemoglobin (Hb)', 'g/dL', 12, 17.5),
    t('Complete Blood Count (CBC) - WBC', 'x10^3/uL', 4, 11),
    t('CBC - RBC', 'x10^6/uL', 4.2, 5.9),
    t('CBC - Platelets', 'x10^3/uL', 150, 410),
    t('Hematocrit (PCV)', '%', 36, 52),
    t('MCV', 'fL', 80, 100),
    t('ESR', 'mm/hr', 0, 20),
    t('Reticulocyte Count', '%', 0.5, 2.5),
    t('Peripheral Blood Smear'),
    t('Blood Group & Rh Typing'),
    t('PT / INR', 'ratio', 0.8, 1.2),
    t('aPTT', 'sec', 25, 35),
    t('Bleeding Time', 'min', 1, 7),
    t('Clotting Time', 'min', 4, 10),
    t('Malaria Parasite (MP)'),
  ],
  Biochemistry: [
    t('Blood Sugar - Fasting', 'mg/dL', 70, 100),
    t('Blood Sugar - Postprandial', 'mg/dL', 70, 140),
    t('Blood Sugar - Random', 'mg/dL', 70, 140),
    t('HbA1c', '%', 4, 5.6),
    t('Urea', 'mg/dL', 15, 40),
    t('Creatinine', 'mg/dL', 0.6, 1.3),
    t('Uric Acid', 'mg/dL', 3.5, 7.2),
    t('Sodium (Na)', 'mmol/L', 135, 145),
    t('Potassium (K)', 'mmol/L', 3.5, 5.1),
    t('Chloride (Cl)', 'mmol/L', 98, 107),
    t('Calcium', 'mg/dL', 8.5, 10.5),
    t('Vitamin D (25-OH)', 'ng/mL', 30, 100),
    t('Vitamin B12', 'pg/mL', 200, 900),
    t('Serum Iron', 'ug/dL', 60, 170),
    t('CRP', 'mg/L', 0, 6),
  ],
  'Lipid Profile': [
    t('Total Cholesterol', 'mg/dL', 0, 200),
    t('Triglycerides', 'mg/dL', 0, 150),
    t('HDL Cholesterol', 'mg/dL', 40, 100),
    t('LDL Cholesterol', 'mg/dL', 0, 100),
    t('VLDL Cholesterol', 'mg/dL', 5, 40),
  ],
  'Liver Function (LFT)': [
    t('Bilirubin - Total', 'mg/dL', 0.2, 1.2),
    t('Bilirubin - Direct', 'mg/dL', 0, 0.3),
    t('SGOT (AST)', 'U/L', 5, 40),
    t('SGPT (ALT)', 'U/L', 5, 41),
    t('Alkaline Phosphatase (ALP)', 'U/L', 44, 147),
    t('Total Protein', 'g/dL', 6, 8.3),
    t('Albumin', 'g/dL', 3.5, 5.2),
  ],
  'Thyroid & Hormones': [
    t('TSH', 'uIU/mL', 0.4, 4.5),
    t('T3 (Total)', 'ng/dL', 80, 200),
    t('T4 (Total)', 'ug/dL', 5, 12),
    t('Free T3', 'pg/mL', 2.3, 4.2),
    t('Free T4', 'ng/dL', 0.8, 1.8),
    t('Prolactin', 'ng/mL', 2, 18),
    t('Cortisol (Morning)', 'ug/dL', 6, 23),
    t('Beta-hCG'),
  ],
  'Serology / Infectious': [
    t('HIV I & II'),
    t('HBsAg'),
    t('HCV Antibody'),
    t('VDRL'),
    t('Widal Test'),
    t('Dengue NS1 Antigen'),
    t('Dengue IgM / IgG'),
    t('Typhidot'),
    t('COVID-19 RT-PCR'),
    t('Rheumatoid Factor (RA)', 'IU/mL', 0, 14),
    t('ASO Titre', 'IU/mL', 0, 200),
  ],
  'Urine & Stool': [
    t('Urine Routine & Microscopy'),
    t('Urine Culture & Sensitivity'),
    t('Urine Albumin'),
    t('Urine Pregnancy Test (UPT)'),
    t('24-hr Urine Protein', 'mg/24h', 0, 150),
    t('Stool Routine & Microscopy'),
    t('Stool Occult Blood'),
  ],
  'Microbiology / Culture': [
    t('Blood Culture & Sensitivity'),
    t('Sputum Culture & Sensitivity'),
    t('Sputum AFB'),
    t('Throat Swab Culture'),
    t('Wound / Pus Culture'),
  ],
  Cardiac: [
    t('Troponin I', 'ng/mL', 0, 0.04),
    t('CK-MB', 'U/L', 0, 25),
    t('BNP', 'pg/mL', 0, 100),
    t('ECG'),
    t('2D Echo'),
    t('TMT (Stress Test)'),
  ],
  'Radiology / Imaging': [
    t('X-Ray Chest PA'),
    t('X-Ray Spine'),
    t('X-Ray Abdomen'),
    t('X-Ray Knee / Joint'),
    t('Ultrasound - Abdomen & Pelvis'),
    t('Ultrasound - Whole Abdomen'),
    t('Ultrasound - KUB'),
    t('Ultrasound - Obstetric (Pregnancy)'),
    t('Ultrasound - Neck / Thyroid'),
    t('Doppler Study'),
    t('CT Scan - Head'),
    t('CT Scan - Chest'),
    t('CT Scan - Abdomen'),
    t('MRI - Brain'),
    t('MRI - Spine'),
    t('MRI - Knee'),
    t('Mammography'),
    t('DEXA Bone Density'),
  ],
  'Pathology / Histology': [
    t('FNAC'),
    t('Biopsy / Histopathology'),
    t('Pap Smear'),
    t('Semen Analysis'),
    t('Bone Marrow Examination'),
  ],
};

export const LAB_CATEGORIES = Object.keys(LAB_CATALOG);

/** Find a catalogue test by exact name (case-insensitive), optionally within one category. */
export function findCatalogTest(
  name: string,
  category?: string,
): CatalogTest | undefined {
  const n = name.trim().toLowerCase();
  const pools =
    category && LAB_CATALOG[category]
      ? [LAB_CATALOG[category]]
      : Object.values(LAB_CATALOG);
  for (const pool of pools) {
    const hit = pool.find(x => x.name.toLowerCase() === n);
    if (hit) return hit;
  }
}

/** Category a test name belongs to, if it's in the catalogue. */
export function categoryOf(name: string): string | undefined {
  const n = name.trim().toLowerCase();
  return LAB_CATEGORIES.find(c =>
    LAB_CATALOG[c].some(x => x.name.toLowerCase() === n),
  );
}
