// Turns one spreadsheet row into patient fields (or a readable error). The web app parses the CSV; this only maps
// and validates. Headers are matched loosely (case/space/underscore-insensitive) so "First Name" and firstName both work.
const GENDERS = {
  m: "male",
  male: "male",
  f: "female",
  female: "female",
  o: "other",
  other: "other",
};
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const key = (k) =>
  String(k)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const ALIASES = {
  firstname: "firstName",
  middlename: "middleName",
  lastname: "lastName",
  name: "name",
  fullname: "name",
  patientname: "name",
  dob: "dob",
  dateofbirth: "dob",
  birthdate: "dob",
  age: "age",
  gender: "gender",
  sex: "gender",
  bloodgroup: "bloodGroup",
  phone: "phone",
  mobile: "phone",
  mobilenumber: "phone",
  phonenumber: "phone",
  contact: "phone",
  email: "email",
  emailaddress: "email",
  address: "street",
  street: "street",
  city: "city",
  state: "state",
  pincode: "pincode",
  pin: "pincode",
  zip: "pincode",
};

function parseDob(v, age) {
  const s = String(v || "").trim();
  let d;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)))
    d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); // DD/MM/YYYY (India)
  else if (!s && Number(age) >= 0 && Number(age) < 130)
    d = new Date(
      Date.UTC(new Date().getUTCFullYear() - Math.floor(Number(age)), 0, 1),
    ); // age only: 1 Jan of that year
  if (!d || isNaN(d) || d > new Date() || d.getUTCFullYear() < 1900)
    return null;
  return d;
}

function mapRow(raw) {
  const r = {};
  for (const [k, v] of Object.entries(raw || {}))
    if (ALIASES[key(k)] && v != null && String(v).trim() !== "")
      r[ALIASES[key(k)]] = String(v).trim();

  let { firstName, middleName, lastName } = r;
  if (!firstName && r.name) {
    const parts = r.name.split(/\s+/);
    firstName = parts.shift();
    lastName = lastName || (parts.length ? parts.pop() : "");
    middleName = middleName || parts.join(" ");
  }
  if (!firstName) return { error: "First name is missing" };
  if (!lastName) lastName = "-"; // schema requires a last name; many records only have one name
  const phone = String(r.phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  if (phone.length !== 10) return { error: "Mobile number must be 10 digits" };
  const gender = GENDERS[String(r.gender || "").toLowerCase()];
  if (!gender) return { error: "Gender must be male, female or other" };
  const dateOfBirth = parseDob(r.dob, r.age);
  if (!dateOfBirth)
    return {
      error:
        "Date of birth (YYYY-MM-DD or DD/MM/YYYY) or age is missing or invalid",
    };
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email))
    return { error: "Email looks invalid" };

  const bg =
    r.bloodGroup &&
    BLOOD.find((b) => b === r.bloodGroup.toUpperCase().replace(/\s/g, ""));
  return {
    fields: {
      firstName: firstName.slice(0, 50),
      middleName: (middleName || "").slice(0, 50),
      lastName: lastName.slice(0, 50),
      dateOfBirth,
      gender,
      bloodGroup: bg || "unknown",
      contact: { phone, email: (r.email || "").toLowerCase() },
      address: {
        street: (r.street || "").slice(0, 200),
        city: (r.city || "").slice(0, 80),
        state: (r.state || "").slice(0, 80),
        pincode: (r.pincode || "").replace(/\D/g, "").slice(0, 6),
      },
    },
  };
}

module.exports = { mapRow };

if (require.main === module) {
  const assert = require("assert");
  const a = mapRow({
    "First Name": "Asha",
    "Last Name": "Verma",
    Mobile: "+91 98765-43210",
    DOB: "05/03/1990",
    Sex: "F",
    "Blood Group": "o +",
    City: "Pune",
    Pincode: "411001",
  });
  assert.strictEqual(a.fields.contact.phone, "9876543210");
  assert.strictEqual(
    a.fields.dateOfBirth.toISOString().slice(0, 10),
    "1990-03-05",
  );
  assert.strictEqual(a.fields.gender, "female");
  assert.strictEqual(a.fields.bloodGroup, "O+");
  const b = mapRow({
    name: "Ravi Kumar Singh",
    phone: "9876500000",
    gender: "male",
    age: "40",
  });
  assert.deepStrictEqual(
    [b.fields.firstName, b.fields.middleName, b.fields.lastName],
    ["Ravi", "Kumar", "Singh"],
  );
  assert.match(
    mapRow({ name: "X", phone: "123", gender: "m", age: 3 }).error,
    /Mobile/,
  );
  assert.match(
    mapRow({ name: "X", phone: "9876500000", gender: "?", age: 3 }).error,
    /Gender/,
  );
  assert.match(
    mapRow({ name: "X", phone: "9876500000", gender: "m" }).error,
    /Date of birth/,
  );
  assert.match(
    mapRow({ phone: "9876500000", gender: "m", age: 3 }).error,
    /First name/,
  );
  assert.match(
    mapRow({ name: "X", phone: "9876500000", gender: "m", dob: "2999-01-01" })
      .error,
    /Date of birth/,
  );
  console.log("patientImport ok");
}
