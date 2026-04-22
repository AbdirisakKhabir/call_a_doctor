import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** dr5hn/countries-states-cities-database (JSON export). */
export const GITHUB_COUNTRIES_JSON_URL =
  "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json";

const PHONE_COUNTRIES_SESSION_KEY = "cad-phone-countries-json-v1";
const PHONE_COUNTRIES_CACHE_MS = 1000 * 60 * 60 * 24;

export type PhoneCountryDef = {
  iso2: string;
  name: string;
  dialCode: string;
};

export const DEFAULT_PHONE_COUNTRY_ISO2 = "SO";

/** Offline fallback if GitHub fetch fails (Somalia default). */
export const PHONE_COUNTRIES_FALLBACK: PhoneCountryDef[] = [
  { iso2: "SO", name: "Somalia", dialCode: "+252" },
];

type GithubCountryRow = {
  name?: string;
  iso2?: string;
  phonecode?: string | number | null;
};

export function flagEmojiFromIso2(iso2: string): string {
  const s = iso2.trim().toUpperCase();
  if (s.length !== 2 || !/^[A-Z]{2}$/.test(s)) return "\u{1F3F3}\uFE0F";
  return String.fromCodePoint(...[...s].map((c) => 127397 + c.charCodeAt(0)));
}

export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function sortPhoneCountries(list: PhoneCountryDef[]): PhoneCountryDef[] {
  const somalia = list.find((c) => c.iso2 === DEFAULT_PHONE_COUNTRY_ISO2);
  const rest = list
    .filter((c) => c.iso2 !== DEFAULT_PHONE_COUNTRY_ISO2)
    .sort((a, b) => a.name.localeCompare(b.name));
  return somalia ? [somalia, ...rest] : rest;
}

export function normalizeGithubCountriesPayload(data: unknown): PhoneCountryDef[] {
  if (!Array.isArray(data)) return [];
  const out: PhoneCountryDef[] = [];
  const seenIso2 = new Set<string>();
  for (const row of data as GithubCountryRow[]) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const iso2 = typeof row.iso2 === "string" ? row.iso2.trim().toUpperCase() : "";
    if (!name || !iso2 || iso2.length !== 2) continue;
    const pcRaw = row.phonecode;
    if (pcRaw == null || pcRaw === "") continue;
    const pcDigits = String(pcRaw).replace(/\D/g, "");
    if (!pcDigits) continue;
    if (seenIso2.has(iso2)) continue;
    seenIso2.add(iso2);
    out.push({ iso2, name, dialCode: `+${pcDigits}` });
  }
  return sortPhoneCountries(out);
}

export async function fetchPhoneCountriesFromGithub(): Promise<PhoneCountryDef[]> {
  const res = await fetch(GITHUB_COUNTRIES_JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Countries request failed (${res.status})`);
  const data: unknown = await res.json();
  const list = normalizeGithubCountriesPayload(data);
  if (!list.length) throw new Error("No countries parsed from GitHub data");
  return list;
}

/**
 * Fetches country metadata from GitHub (24h sessionStorage cache in the browser).
 */
export async function fetchPhoneCountriesFromGithubCached(): Promise<PhoneCountryDef[]> {
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(PHONE_COUNTRIES_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { t: number; list: PhoneCountryDef[] };
        if (
          typeof parsed.t === "number" &&
          Date.now() - parsed.t < PHONE_COUNTRIES_CACHE_MS &&
          Array.isArray(parsed.list) &&
          parsed.list.length > 0
        ) {
          return parsed.list;
        }
      }
    } catch {
      /* ignore */
    }
  }

  const list = await fetchPhoneCountriesFromGithub();

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(
        PHONE_COUNTRIES_SESSION_KEY,
        JSON.stringify({ t: Date.now(), list })
      );
    } catch {
      /* ignore */
    }
  }

  return list;
}

export function parseStoredPhoneIntoParts(stored: string | null | undefined): {
  countryIso2: string;
  national: string;
} {
  if (!stored?.trim()) {
    return { countryIso2: DEFAULT_PHONE_COUNTRY_ISO2, national: "" };
  }
  const trimmed = stored.trim();
  const p = parsePhoneNumberFromString(trimmed);
  if (p?.country) {
    return { countryIso2: p.country, national: p.nationalNumber ?? "" };
  }
  const allDigits = phoneDigitsOnly(trimmed);
  if (!allDigits.length) {
    return { countryIso2: DEFAULT_PHONE_COUNTRY_ISO2, national: "" };
  }
  return { countryIso2: DEFAULT_PHONE_COUNTRY_ISO2, national: allDigits };
}

export function validateClientPhoneNational(countryIso2: string, nationalRaw: string): string | null {
  const national = phoneDigitsOnly(nationalRaw);
  if (!national.length) return null;
  try {
    const p = parsePhoneNumberFromString(national, countryIso2 as CountryCode);
    if (!p || !p.isPossible()) {
      return "Enter a valid phone number for the selected country.";
    }
  } catch {
    return "Enter a valid phone number for the selected country.";
  }
  return null;
}

export function formatInternationalPhoneForStorage(
  countryIso2: string,
  nationalRaw: string
): string | null {
  const national = phoneDigitsOnly(nationalRaw);
  if (!national.length) return null;
  const p = parsePhoneNumberFromString(national, countryIso2 as CountryCode);
  if (!p || !p.isPossible()) return null;
  return p.format("E.164");
}

export function validateOptionalClientPhoneNational(
  countryIso2: string,
  nationalRaw: string
): string | null {
  if (!phoneDigitsOnly(nationalRaw)) return null;
  return validateClientPhoneNational(countryIso2, nationalRaw);
}

