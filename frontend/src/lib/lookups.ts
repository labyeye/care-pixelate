// Free, key-less public APIs used for pickers / suggestions. Every call fails
// soft (returns []) so forms keep working offline — fields fall back to free text.

const memo = new Map<string, Promise<string[]>>();
const once = (key: string, fn: () => Promise<string[]>) => {
  if (!memo.has(key)) {
    memo.set(
      key,
      fn().catch(() => {
        memo.delete(key); // don't cache failures
        return [];
      }),
    );
  }
  return memo.get(key)!;
};

const CN = "https://countriesnow.space/api/v0.1/countries";
// The POST variants of these endpoints 301 to a GET /q?… URL (which browsers
// re-issue without the body), so call the GET form directly.
const getJson = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

export const FALLBACK_COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Australia",
  "Singapore",
  "Nepal",
  "Bangladesh",
  "Sri Lanka",
];

export const getCountries = () =>
  once("countries", async () => {
    const r = await fetch(`${CN}/iso`);
    const j = await r.json();
    return (j.data as { name: string }[])
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b));
  });

export const getStates = (country: string) =>
  once(`states:${country}`, async () => {
    const j = await getJson(
      `${CN}/states/q?country=${encodeURIComponent(country)}`,
    );
    return ((j.data?.states ?? []) as { name: string }[])
      .map((s) => s.name)
      .sort((a, b) => a.localeCompare(b));
  });

export const getCities = (country: string, state: string) =>
  once(`cities:${country}:${state}`, async () => {
    const j = await getJson(
      `${CN}/state/cities/q?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}`,
    );
    return ((j.data ?? []) as string[])
      .slice()
      .sort((a, b) => a.localeCompare(b));
  });

/** India Post: 6-digit pincode -> { state, city } (city = district). */
export async function lookupPincode(
  pin: string,
): Promise<{ state: string; city: string } | null> {
  try {
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const j = await r.json();
    const po = j?.[0]?.PostOffice?.[0];
    return j?.[0]?.Status === "Success" && po
      ? { state: po.State, city: po.District }
      : null;
  } catch {
    return null;
  }
}

// NLM Clinical Tables (CORS-enabled, no key).
const NLM = "https://clinicaltables.nlm.nih.gov/api";

export const searchConditions = (q: string) =>
  once(`cond:${q.toLowerCase()}`, async () => {
    const j = await (
      await fetch(
        `${NLM}/conditions/v3/search?terms=${encodeURIComponent(q)}&df=consumer_name&maxList=10`,
      )
    ).json();
    return ((j[3] ?? []) as string[][]).map((x) => x[0]).filter(Boolean);
  });

export const searchDrugs = (q: string) =>
  once(`drug:${q.toLowerCase()}`, async () => {
    const j = await (
      await fetch(
        `${NLM}/rxterms/v3/search?terms=${encodeURIComponent(q)}&maxList=10`,
      )
    ).json();
    return ((j[1] ?? []) as string[]).filter(Boolean);
  });
