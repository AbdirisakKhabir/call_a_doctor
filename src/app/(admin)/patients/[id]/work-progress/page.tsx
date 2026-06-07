"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardList, FolderOpen, ListChecks } from "lucide-react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type StepState = "pending" | "in_progress" | "done" | "cancelled" | "skipped";

type Step = {
  key: string;
  label: string;
  detail: string | null;
  state: StepState;
  href: string | null;
};

type TimelineAppointment = {
  kind: "appointment";
  row: {
    id: number;
    sortAt: string;
    appointmentDate: string;
    startTime: string;
    branch: { id: number; name: string };
    doctor: { id: number; name: string };
    visitStatus: string;
    steps: Step[];
  };
};

type TimelineVisitCard = {
  kind: "visit_card";
  row: {
    id: number;
    sortAt: string;
    cardNumber: string;
    visitDate: string;
    branch: { id: number; name: string };
    doctor: { id: number; name: string };
    status: string;
    paymentStatus: string;
    visitFee: number;
    steps: Step[];
  };
};

type CareFileRow = {
  id: number;
  fileCode: string;
  title: string | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
};

function formatDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function stateBadgeClasses(state: StepState): string {
  switch (state) {
    case "done":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "in_progress":
      return "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
    case "cancelled":
      return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200";
    case "skipped":
      return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
    default:
      return "bg-gray-50 text-gray-700 dark:bg-gray-800/80 dark:text-gray-300";
  }
}

function stateLabel(state: StepState): string {
  switch (state) {
    case "done":
      return "Done";
    case "in_progress":
      return "In progress";
    case "cancelled":
      return "Cancelled";
    case "skipped":
      return "—";
    default:
      return "Pending";
  }
}

function formatVisitStatus(raw: string): string {
  switch (raw) {
    case "inProgress":
      return "With clinician";
    case "inWaiting":
      return "Waiting (reception)";
    case "no-show":
      return "No-show";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "scheduled":
      return "Scheduled";
    default:
      return raw
        .replace(/-/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function statePlainSentence(state: StepState): string {
  switch (state) {
    case "done":
      return "Finished for this encounter.";
    case "in_progress":
      return "Started but not finished.";
    case "pending":
      return "Not done yet.";
    case "cancelled":
      return "Stopped or does not apply.";
    case "skipped":
      return "Not counted for this visit.";
    default:
      return "";
  }
}

type ProgressBreakdown = {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  percentSmoothed: number;
};

function computeProgressBreakdown(steps: Step[]): ProgressBreakdown {
  const relevant = steps.filter((s) => s.state !== "skipped");
  let done = 0;
  let inProgress = 0;
  let pending = 0;
  let cancelled = 0;
  for (const s of relevant) {
    if (s.state === "done") done += 1;
    else if (s.state === "in_progress") inProgress += 1;
    else if (s.state === "cancelled") cancelled += 1;
    else pending += 1;
  }
  const total = relevant.length;
  const percentSmoothed =
    total === 0 ? 0 : Math.round(((done + inProgress * 0.5) / total) * 100);
  return { total, done, inProgress, pending, cancelled, percentSmoothed };
}

function segmentClass(state: StepState): string {
  switch (state) {
    case "done":
      return "bg-emerald-500";
    case "in_progress":
      return "bg-amber-500";
    case "cancelled":
      return "bg-gray-400 dark:bg-gray-500";
    case "pending":
    default:
      return "bg-gray-200 dark:bg-gray-600";
  }
}

function SummaryProgressBar({ percent }: { percent: number }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
      <div
        className="h-full rounded-full bg-brand-500 dark:bg-brand-400"
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

function SegmentedStepBar({ steps }: { steps: Step[] }) {
  const relevant = steps.filter((s) => s.state !== "skipped");
  if (relevant.length === 0) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">No checklist steps.</p>;
  }
  return (
    <div
      className="flex h-2.5 w-full max-w-xl overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
      role="img"
      aria-label="One colored block per step in order"
    >
      {relevant.map((s) => (
        <div
          key={s.key}
          className={`min-w-[6px] flex-1 border-r border-white/40 last:border-r-0 ${segmentClass(s.state)}`}
          title={`${s.label}: ${stateLabel(s.state)}`}
        />
      ))}
    </div>
  );
}

export default function PatientWorkProgressPage() {
  const params = useParams();
  const idParam = params?.id;
  const patientId = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : "";

  const { hasPermission } = useAuth();
  const canView = hasPermission("patients.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{
    patient: {
      id: number;
      patientCode: string;
      name: string;
    };
    timeline: Array<TimelineAppointment | TimelineVisitCard>;
    careFiles: CareFileRow[];
    access: {
      appointments: boolean;
      lab: boolean;
      prescriptions: boolean;
      forms: boolean;
      visitCards: boolean;
    };
  } | null>(null);

  useEffect(() => {
    if (!patientId || !canView) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    authFetch(`/api/patients/${patientId}/work-progress`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load");
        if (!cancelled) {
          setData({
            patient: json.patient,
            timeline: Array.isArray(json.timeline) ? json.timeline : [],
            careFiles: Array.isArray(json.careFiles) ? json.careFiles : [],
            access: {
              appointments: Boolean(json.access?.appointments),
              lab: Boolean(json.access?.lab),
              prescriptions: Boolean(json.access?.prescriptions),
              forms: Boolean(json.access?.forms),
              visitCards: Boolean(json.access?.visitCards),
            },
          });
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, canView]);

  const overviewRows = useMemo(() => {
    if (!data?.timeline.length) return [];
    return data.timeline.map((entry) => {
      const steps = entry.row.steps;
      const b = computeProgressBreakdown(steps);
      const label =
        entry.kind === "appointment"
          ? `Calendar · ${formatDateLabel(entry.row.appointmentDate)} · ${entry.row.startTime}`
          : `Reception card #${entry.row.cardNumber} · ${formatDateLabel(entry.row.visitDate)}`;
      const sub =
        entry.kind === "appointment"
          ? `${entry.row.branch.name} · Dr. ${entry.row.doctor.name}`
          : `${entry.row.branch.name} · Dr. ${entry.row.doctor.name}`;
      const anchor =
        entry.kind === "appointment" ? `visit-appt-${entry.row.id}` : `visit-vc-${entry.row.id}`;
      return { entry, steps, b, label, sub, anchor };
    });
  }, [data?.timeline]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Work progress" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission to view clients.</p>
      </div>
    );
  }

  if (!patientId) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Work progress" />
        <p className="mt-6 text-sm text-gray-500">Invalid client.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Client work progress" />
        <div className="flex flex-wrap gap-4">
          <Link
            href={`/patients/${patientId}/history`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <ClipboardList className="h-4 w-4" />
            History
          </Link>
          <Link
            href={`/patients/${patientId}/care-files`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <FolderOpen className="h-4 w-4" />
            Client files
          </Link>
          <Link
            href="/patients"
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            ← Back to clients
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
      ) : data ? (
        <div className="space-y-8">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
            <div className="flex flex-wrap items-start gap-3">
              <ListChecks className="h-8 w-8 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{data.patient.name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{data.patient.patientCode}</p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Track visits, lab, prescriptions, forms, reception cards, and billing steps in one place. Steps reflect
                  current records; links open the area where work is done.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              {!data.access.appointments && <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">No calendar access</span>}
              {!data.access.lab && <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">No lab module</span>}
              {!data.access.prescriptions && (
                <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">No prescriptions module</span>
              )}
              {!data.access.forms && <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">Limited forms view</span>}
              {!data.access.visitCards && (
                <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">No visit cards access</span>
              )}
            </div>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Visits and reception cards</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Newest first. Each encounter has an{" "}
                <strong className="font-medium text-gray-700 dark:text-gray-300">overall progress bar</strong>, a{" "}
                <strong className="font-medium text-gray-700 dark:text-gray-300">colored strip</strong> (one block per
                checklist step: green = done, amber = in progress, gray = waiting), and a{" "}
                <strong className="font-medium text-gray-700 dark:text-gray-300">table</strong> with plain-English status.
                Skipped rows are not part of the bar.
              </p>
            </div>

            {data.timeline.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No visits or reception cards yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Encounter
                        </TableCell>
                        <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Where
                        </TableCell>
                        <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Visit state
                        </TableCell>
                        <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Progress
                        </TableCell>
                        <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Jump
                        </TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overviewRows.map(({ entry, b, label, sub, anchor }) => (
                        <TableRow key={`ov-${entry.row.id}-${entry.kind}`}>
                          <TableCell className="max-w-[220px] text-xs text-gray-900 dark:text-gray-100">
                            <span className="font-medium">{label}</span>
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 dark:text-gray-400">{sub}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs capitalize text-gray-700 dark:text-gray-300">
                            {entry.kind === "appointment"
                              ? formatVisitStatus(entry.row.visitStatus)
                              : formatVisitStatus(entry.row.status)}
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <div className="space-y-1">
                              <p className="text-[11px] tabular-nums text-gray-600 dark:text-gray-400">
                                {b.total === 0
                                  ? "—"
                                  : `${b.done} of ${b.total} done${b.inProgress ? ` · ${b.inProgress} in progress` : ""}`}
                              </p>
                              <div className="w-32">
                                <SummaryProgressBar percent={b.percentSmoothed} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <a
                              href={`#${anchor}`}
                              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                            >
                              Details
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <ul className="space-y-6">
                  {data.timeline.map((entry) => {
                    const steps = entry.row.steps;
                    const b = computeProgressBreakdown(steps);
                    const isAppt = entry.kind === "appointment";
                    const anchor = isAppt ? `visit-appt-${entry.row.id}` : `visit-vc-${entry.row.id}`;
                    const title = isAppt ? "Calendar visit" : "Reception desk visit";
                    const headline = isAppt
                      ? `${formatDateLabel(entry.row.appointmentDate)} at ${entry.row.startTime}`
                      : formatDateLabel(entry.row.visitDate);
                    const whereWho = `${entry.row.branch.name} · Dr. ${entry.row.doctor.name}`;
                    const statusText = isAppt ? entry.row.visitStatus : entry.row.status;

                    return (
                      <li
                        key={isAppt ? `appt-${entry.row.id}` : `vc-${entry.row.id}`}
                        id={anchor}
                        className="scroll-mt-20 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              {title}
                            </p>
                            <p className="text-base font-semibold text-gray-900 dark:text-white">{headline}</p>
                            {!isAppt ? (
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                Card #{entry.row.cardNumber} · {whereWho}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-600 dark:text-gray-300">{whereWho}</p>
                            )}
                          </div>
                          <span className="rounded-md bg-gray-100 px-2 py-1 text-xs capitalize text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                            {formatVisitStatus(statusText)}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Overall completion</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {b.total === 0
                                ? "No tracked steps."
                                : `${b.done} of ${b.total} steps complete${
                                    b.inProgress ? ` (${b.inProgress} still in progress)` : ""
                                  }. Gray blocks are waiting; amber means someone has started that step.`}
                            </p>
                            <div className="mt-2 max-w-md">
                              <SummaryProgressBar percent={b.percentSmoothed} />
                              <p className="mt-1 text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
                                ~{b.percentSmoothed}% overall (in-progress steps count half)
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Step-by-step</p>
                            <div className="mt-2">
                              <SegmentedStepBar steps={steps} />
                            </div>
                            <ul className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                              <li className="flex items-center gap-1">
                                <span className="h-2 w-4 rounded-sm bg-emerald-500" /> Done
                              </li>
                              <li className="flex items-center gap-1">
                                <span className="h-2 w-4 rounded-sm bg-amber-500" /> In progress
                              </li>
                              <li className="flex items-center gap-1">
                                <span className="h-2 w-4 rounded-sm bg-gray-200 dark:bg-gray-700" /> Waiting
                              </li>
                              <li className="flex items-center gap-1">
                                <span className="h-2 w-4 rounded-sm bg-gray-400" /> Cancelled
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  Step
                                </TableCell>
                                <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  Status
                                </TableCell>
                                <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  What this means
                                </TableCell>
                                <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  Notes
                                </TableCell>
                                <TableCell isHeader className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  Open in app
                                </TableCell>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {steps.map((s) => (
                                <TableRow key={s.key}>
                                  <TableCell className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {s.label}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <span
                                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stateBadgeClasses(
                                        s.state
                                      )}`}
                                    >
                                      {stateLabel(s.state)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="max-w-[200px] text-xs text-gray-700 dark:text-gray-300">
                                    {statePlainSentence(s.state)}
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                                    {s.detail ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {s.href ? (
                                      <Link
                                        href={s.href}
                                        className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                                      >
                                        Open
                                      </Link>
                                    ) : (
                                      "—"
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Care files</h2>
            {data.careFiles.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No care files for this client.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Opened</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.careFiles.map((f) => (
                      <tr key={f.id} className="bg-white dark:bg-white/3">
                        <td className="px-3 py-2 font-mono text-xs">{f.fileCode}</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{f.title ?? "—"}</td>
                        <td className="px-3 py-2 capitalize">{f.status}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{formatDateLabel(f.openedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
