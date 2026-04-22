"use client";

import Label from "@/components/form/Label";
import {
  PHONE_COUNTRIES_FALLBACK,
  fetchPhoneCountriesFromGithubCached,
  flagEmojiFromIso2,
  type PhoneCountryDef,
  phoneDigitsOnly,
} from "@/lib/phone-country";
import { useEffect, useState } from "react";

const selectClass =
  "h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700 dark:text-white";
const inputClass =
  "h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white";

type ClientPhoneFieldsProps = {
  label?: string;
  /** When true, input placeholder uses "Mobile". */
  optionalMobile?: boolean;
  countryIso2: string;
  national: string;
  onCountryIso2Change: (iso2: string) => void;
  onNationalChange: (national: string) => void;
  nationalInputId?: string;
};

export default function ClientPhoneFields({
  label = "Phone",
  optionalMobile = false,
  countryIso2,
  national,
  onCountryIso2Change,
  onNationalChange,
  nationalInputId,
}: ClientPhoneFieldsProps) {
  const [countries, setCountries] = useState<PhoneCountryDef[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPhoneCountriesFromGithubCached()
      .then((list) => {
        if (!cancelled) {
          setCountries(list);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCountries(PHONE_COUNTRIES_FALLBACK);
          setLoadError("Could not load countries from GitHub. Somalia-only list is available offline.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = countries ?? PHONE_COUNTRIES_FALLBACK;
  const loading = countries === null;

  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <select
          value={countryIso2}
          onChange={(e) => onCountryIso2Change(e.target.value)}
          disabled={loading}
          className={`${selectClass} w-full sm:max-w-md`}
          aria-label="Country"
        >
          {loading ? (
            <option value={countryIso2}>
              {flagEmojiFromIso2(countryIso2)} Loading countries…
            </option>
          ) : (
            list.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {flagEmojiFromIso2(c.iso2)} {c.name} ({c.dialCode})
              </option>
            ))
          )}
        </select>
        <input
          id={nationalInputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={national}
          onChange={(e) => onNationalChange(phoneDigitsOnly(e.target.value))}
          className={inputClass}
          placeholder={optionalMobile ? "Mobile" : "Phone"}
        />
      </div>
      {loadError ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{loadError}</p>
      ) : null}
    </div>
  );
}
