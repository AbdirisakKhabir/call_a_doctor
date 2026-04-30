"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { WORKDAY_OPTIONS, type WorkdayCode } from "@/lib/hr-staff";

export type StaffMemberFormInitial = {
  name: string;
  phone: string;
  address: string;
  title: string;
  hireDate: string;
  workingDays: WorkdayCode[];
  workingHours: string;
  salaryAmount: string;
  cvUrl: string | null;
  cvPublicId: string | null;
  photoUrl: string | null;
  photoPublicId: string | null;
  isActive?: boolean;
};

const emptyInitial: StaffMemberFormInitial = {
  name: "",
  phone: "",
  address: "",
  title: "",
  hireDate: new Date().toISOString().slice(0, 10),
  workingDays: [],
  workingHours: "",
  salaryAmount: "",
  cvUrl: null,
  cvPublicId: null,
  photoUrl: null,
  photoPublicId: null,
  isActive: true,
};

type Props = {
  mode: "create" | "edit";
  staffId?: number;
  initial?: Partial<StaffMemberFormInitial>;
  listHref?: string;
};

async function uploadPhotoFile(file: File): Promise<{ url: string; publicId: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", "clinic/hr-staff-photos");
  const res = await authFetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Photo upload failed");
  }
  if (!data.url || !data.publicId) throw new Error("Invalid upload response");
  return { url: data.url as string, publicId: data.publicId as string };
}

async function uploadCvFile(file: File): Promise<{ url: string; publicId: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("type", "raw");
  fd.append("folder", "clinic/hr-staff-cv");
  const res = await authFetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "CV upload failed");
  }
  if (!data.url || !data.publicId) throw new Error("Invalid upload response");
  return { url: data.url as string, publicId: data.publicId as string };
}

export default function StaffMemberForm({ mode, staffId, initial, listHref = "/hr/staff" }: Props) {
  const router = useRouter();
  const merged = useMemo(() => ({ ...emptyInitial, ...initial }), [initial]);
  const [name, setName] = useState(merged.name);
  const [phone, setPhone] = useState(merged.phone);
  const [address, setAddress] = useState(merged.address);
  const [title, setTitle] = useState(merged.title);
  const [hireDate, setHireDate] = useState(merged.hireDate);
  const [workingDays, setWorkingDays] = useState<WorkdayCode[]>(merged.workingDays);
  const [workingHours, setWorkingHours] = useState(merged.workingHours);
  const [salaryAmount, setSalaryAmount] = useState(merged.salaryAmount);
  const [cvUrl, setCvUrl] = useState<string | null>(merged.cvUrl);
  const [cvPublicId, setCvPublicId] = useState<string | null>(merged.cvPublicId);
  const [photoUrl, setPhotoUrl] = useState<string | null>(merged.photoUrl);
  const [photoPublicId, setPhotoPublicId] = useState<string | null>(merged.photoPublicId);
  const [isActive, setIsActive] = useState(merged.isActive !== false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removeCv, setRemoveCv] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photoObjectUrl, setPhotoObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoFile) {
      setPhotoObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(photoFile);
    setPhotoObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photoFile]);

  function toggleDay(code: WorkdayCode) {
    setWorkingDays((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      let nextCvUrl = cvUrl;
      let nextCvPublicId = cvPublicId;
      let nextPhotoUrl = photoUrl;
      let nextPhotoPublicId = photoPublicId;
      if (cvFile) {
        const up = await uploadCvFile(cvFile);
        nextCvUrl = up.url;
        nextCvPublicId = up.publicId;
      }
      if (photoFile) {
        const up = await uploadPhotoFile(photoFile);
        nextPhotoUrl = up.url;
        nextPhotoPublicId = up.publicId;
      }

      const payload: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        title: title.trim(),
        hireDate,
        workingDays,
        workingHours: workingHours.trim(),
        salaryAmount: salaryAmount.trim() === "" ? null : Number(salaryAmount),
      };

      if (mode === "create") {
        payload.cvUrl = nextCvUrl;
        payload.cvPublicId = nextCvPublicId;
        payload.photoUrl = nextPhotoUrl;
        payload.photoPublicId = nextPhotoPublicId;
      } else {
        if (cvFile) {
          payload.cvUrl = nextCvUrl;
          payload.cvPublicId = nextCvPublicId;
        } else if (removeCv) {
          payload.cvUrl = null;
          payload.cvPublicId = null;
        }
        if (photoFile) {
          payload.photoUrl = nextPhotoUrl;
          payload.photoPublicId = nextPhotoPublicId;
        } else if (removePhoto) {
          payload.photoUrl = null;
          payload.photoPublicId = null;
        }
      }

      if (mode === "edit") {
        payload.isActive = isActive;
      }

      const url = mode === "create" ? "/api/hr/staff" : `/api/hr/staff/${staffId}`;
      const res = await authFetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      router.push(listHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="max-w-2xl space-y-5">
      {error ? (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      ) : null}

      <div>
        <Label>Profile photo (optional)</Label>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">JPEG, PNG, WebP or GIF — max 5MB.</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-white/5">
            {photoObjectUrl ? (
              <img src={photoObjectUrl} alt="" className="h-full w-full object-cover" />
            ) : photoUrl && !removePhoto ? (
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="px-2 text-center text-[11px] text-gray-400">No photo</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:text-gray-400 dark:file:bg-brand-950/50 dark:file:text-brand-300"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPhotoFile(f);
                if (mode === "edit") setRemovePhoto(false);
              }}
            />
            {photoUrl && !photoFile && mode === "edit" ? (
              <button
                type="button"
                onClick={() => {
                  setPhotoUrl(null);
                  setPhotoPublicId(null);
                  setPhotoFile(null);
                  setRemovePhoto(true);
                }}
                className="mt-2 text-sm text-error-600 hover:underline dark:text-error-400"
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <Label>Full name</Label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5 dark:text-white"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Phone</Label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5 dark:text-white"
          />
        </div>
        <div>
          <Label>Job title</Label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5 dark:text-white"
          />
        </div>
      </div>

      <div>
        <Label>Address</Label>
        <textarea
          required
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5 dark:text-white"
        />
      </div>

      <div>
        <Label>Hire date</Label>
        <div className="mt-1.5">
          <DateField value={hireDate} onChange={setHireDate} />
        </div>
      </div>

      <div>
        <Label>Working days</Label>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Select all days this staff member works.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {WORKDAY_OPTIONS.map((d) => (
            <label
              key={d.value}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                workingDays.includes(d.value)
                  ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-600 dark:bg-brand-950/40 dark:text-brand-200"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={workingDays.includes(d.value)}
                onChange={() => toggleDay(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>Working hours</Label>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">e.g. 08:00 - 17:00</p>
        <input
          required
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
          placeholder="08:00 - 17:00"
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5 dark:text-white"
        />
      </div>

      <div>
        <Label>Salary amount (optional)</Label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={salaryAmount}
          onChange={(e) => setSalaryAmount(e.target.value)}
          placeholder="USD per month (optional)"
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5 dark:text-white"
        />
      </div>

      <div>
        <Label>CV (PDF, optional)</Label>
        <input
          type="file"
          accept="application/pdf"
          className="mt-1.5 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:text-gray-400 dark:file:bg-brand-950/50 dark:file:text-brand-300"
          onChange={(e) => {
            setCvFile(e.target.files?.[0] ?? null);
            if (mode === "edit") setRemoveCv(false);
          }}
        />
        {cvUrl && !cvFile ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <a
              href={cvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              View current CV
            </a>
            {mode === "edit" ? (
              <button
                type="button"
                onClick={() => {
                  setCvUrl(null);
                  setCvPublicId(null);
                  setCvFile(null);
                  setRemoveCv(true);
                }}
                className="text-error-600 hover:underline dark:text-error-400"
              >
                Remove CV
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === "edit" ? (
        <div className="flex items-center gap-2">
          <input
            id="staff-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
          />
          <Label htmlFor="staff-active" className="mb-0 cursor-pointer">
            Active (shows on list as active staff)
          </Label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Register staff" : "Save changes"}
        </Button>
        <Link href={listHref}>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}