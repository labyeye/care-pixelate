import { useEffect, useState } from "react";
import { Field, inputCls } from "@/components/forms/WizardModal";
import { FALLBACK_COUNTRIES, getCities, getCountries, getStates, lookupPincode } from "@/lib/lookups";

export interface Location {
  state: string;
  city: string;
  pincode: string;
  country: string;
}

/** Loads an option list; `list` is null until the first response, [] if the API failed. */
function useList(load: (() => Promise<string[]>) | null, deps: unknown[]) {
  const [list, setList] = useState<string[] | null>(null);
  useEffect(() => {
    if (!load) {
      setList([]);
      return;
    }
    let live = true;
    setList(null);
    load().then((r) => live && setList(r));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return list;
}

// A <select> when the API gave us options, otherwise a plain text input.
function Picker({
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  value: string;
  options: string[] | null;
  placeholder: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (options && options.length === 0) {
    return (
      <input className={inputCls} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    );
  }
  const opts = options ?? [];
  const withCurrent = value && !opts.includes(value) ? [value, ...opts] : opts;
  return (
    <select className={inputCls} value={value} disabled={disabled || options === null} onChange={(e) => onChange(e.target.value)}>
      <option value="">{options === null ? "Loading…" : placeholder}</option>
      {withCurrent.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * State · City · Pincode · Country in one row. Country/state/city come from a
 * public API; an Indian pincode auto-fills state + city via India Post.
 */
export function LocationFields({
  value,
  onChange,
  pincodeError,
}: {
  value: Location;
  onChange: (patch: Partial<Location>) => void;
  pincodeError?: string;
}) {
  const [hint, setHint] = useState("");
  const countries = useList(getCountries, []);
  const states = useList(value.country ? () => getStates(value.country) : null, [value.country]);
  const cities = useList(value.country && value.state ? () => getCities(value.country, value.state) : null, [value.country, value.state]);
  const countryOpts = countries && countries.length ? countries : countries === null ? null : FALLBACK_COUNTRIES;

  const onPin = async (raw: string) => {
    const pin = raw.replace(/\D/g, "").slice(0, 6);
    onChange({ pincode: pin });
    setHint("");
    if (pin.length === 6 && value.country === "India") {
      const hit = await lookupPincode(pin);
      if (hit) {
        onChange({ pincode: pin, state: hit.state, city: hit.city });
        setHint(`${hit.city}, ${hit.state}`);
      } else {
        setHint("Pincode not found");
      }
    }
  };

  return (
    <div className="col-span-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="State">
          <Picker value={value.state} options={states} placeholder="Select state" onChange={(state) => onChange({ state, city: "" })} />
        </Field>
        <Field label="City">
          <Picker value={value.city} options={cities} placeholder={value.state ? "Select city" : "Select state first"} disabled={!value.state} onChange={(city) => onChange({ city })} />
        </Field>
        <Field label="Pincode" error={pincodeError}>
          <input className={inputCls} inputMode="numeric" maxLength={6} value={value.pincode} placeholder="400001" onChange={(e) => onPin(e.target.value)} />
        </Field>
        <Field label="Country">
          <Picker
            value={value.country}
            options={countryOpts}
            placeholder="Select country"
            onChange={(country) => onChange({ country, state: "", city: "" })}
          />
        </Field>
      </div>
      {hint && <p className="mt-1 text-xs font-medium text-muted-foreground">Pincode matched: {hint}</p>}
    </div>
  );
}
