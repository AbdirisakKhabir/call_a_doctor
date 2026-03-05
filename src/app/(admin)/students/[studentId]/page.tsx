"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import {
  ChevronLeftIcon,
  UserCircleIcon,
  MailIcon,
  CalenderIcon,
  DollarLineIcon,
  GroupIcon,
  UserIcon,
  CheckCircleIcon,
} from "@/icons";

type StudentProfile = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  motherName: string | null;
  parentPhone: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  imageUrl: string | null;
  department: { id: number; name: string; code: string; tuitionFee: number | null };
  class: { id: number; name: string; semester: string; year: number; department: { code: string; name: string } } | null;
  program: string | null;
  status: string;
  paymentStatus: string;
  balance: number;
  admissionDate: string;
  tuitionPayments: { id: number; semester: string; year: number; amount: number; paidAt: string }[];
};

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const idCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      setLoading(true);
      await authFetch(`/api/students/by-id/${encodeURIComponent(studentId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setStudent);
      setLoading(false);
    })();
  }, [studentId]);

  const handlePrintIdCard = () => {
    if (!idCardRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>ID Card - ${student?.studentId}</title>
        <style>
          body { font-family: system-ui; padding: 20px; margin: 0; }
          .id-card { width: 340px; border: 2px solid #333; border-radius: 12px; overflow: hidden; }
          .id-header { background: #465FFF; color: white; padding: 12px; text-align: center; font-weight: bold; }
          .id-body { padding: 16px; display: flex; gap: 16px; }
          .id-photo { width: 80px; height: 100px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; }
          .id-photo img { width: 80px; height: 100px; object-fit: cover; }
          .id-info { flex: 1; }
          .id-row { margin-bottom: 6px; font-size: 13px; }
          .id-id { font-size: 18px; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px; }
        </style>
        </head>
        <body>
          <div class="id-card">
            <div class="id-header">ATU Berbera</div>
            <div class="id-body">
              <div class="id-photo">
                ${student?.imageUrl ? `<img src="${student.imageUrl}" alt="Photo" />` : `<span style="font-size: 32px;">${student?.firstName?.[0] || ""}${student?.lastName?.[0] || ""}</span>`}
              </div>
              <div class="id-info">
                <div class="id-id">${student?.studentId || ""}</div>
                <div class="id-row"><strong>${student?.firstName || ""} ${student?.lastName || ""}</strong></div>
                <div class="id-row">${student?.department?.name || ""} (${student?.department?.code || ""})</div>
                <div class="id-row">${student?.program || "—"} | ${student?.class ? `${student.class.department.code} ${student.class.name}` : "—"}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  if (!student) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Student Not Found" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-white/5">
          <p className="text-gray-500 dark:text-gray-400">Student with ID {studentId} not found.</p>
          <Button className="mt-4" size="sm" onClick={() => router.push("/admission")}>
            Back to Admission
          </Button>
        </div>
      </div>
    );
  }

  const InfoRow = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: React.ReactNode;
  }) => (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-0.5 font-medium text-gray-800 dark:text-white/90">{value}</p>
      </div>
    </div>
  );

  return (
    <div>
      <PageBreadCrumb pageTitle={`${student.firstName} ${student.lastName}`} />

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => router.push("/admission")}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back to Admission
        </button>
        <Button size="sm" variant="outline" onClick={handlePrintIdCard}>
          Print ID Card
        </Button>
      </div>

      {/* Hero Profile Card */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="relative bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-6 py-8 sm:px-8 sm:py-10">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-white/30 shadow-xl ring-2 ring-white/20">
              {student.imageUrl ? (
                <Image src={student.imageUrl} alt="" width={96} height={96} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/20">
                  <span className="text-3xl font-bold text-white">
                    {student.firstName[0]}
                    {student.lastName[0]}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                {student.firstName} {student.lastName}
              </h1>
              <p className="mt-1 font-mono text-lg tracking-wider text-white/90">{student.studentId}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-theme-xs font-medium text-white ring-1 ring-white/30">
                  {student.status}
                </span>
                <span className="text-sm text-white/80">
                  {student.department.name} • {student.program || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* ID Card Preview */}
        <div className="lg:col-span-1">
          <div
            ref={idCardRef}
            className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-white/5 dark:shadow-none"
          >
            <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 text-center font-bold text-white shadow-inner">
              ATU Berbera
            </div>
            <div className="flex gap-4 p-5">
              <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                {student.imageUrl ? (
                  <Image src={student.imageUrl} alt="" width={96} height={112} className="h-28 w-24 object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-gray-400">
                    {student.firstName[0]}
                    {student.lastName[0]}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-lg font-bold tracking-wider text-gray-800 dark:text-white/90">
                  {student.studentId}
                </p>
                <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                  {student.firstName} {student.lastName}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {student.department.name} ({student.department.code})
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {student.program || "—"} {student.class && `| ${student.class.department?.code ?? "—"}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
              <UserCircleIcon className="h-5 w-5 text-brand-500" />
              Personal Information
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow
                icon={UserIcon}
                label="Full Name"
                value={`${student.firstName} ${student.lastName}`}
              />
              <InfoRow icon={UserIcon} label="Student ID" value={<span className="font-mono">{student.studentId}</span>} />
              <InfoRow
                icon={GroupIcon}
                label="Department"
                value={`${student.department.name} (${student.department.code})`}
              />
              <InfoRow
                icon={GroupIcon}
                label="Class"
                value={
                  student.class
                    ? `${student.class.department.code} - ${student.class.name} (${student.class.semester} ${student.class.year})`
                    : "—"
                }
              />
              <InfoRow icon={GroupIcon} label="Program" value={student.program || "—"} />
              <InfoRow
                icon={CalenderIcon}
                label="Date of Birth"
                value={student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
              />
              <InfoRow icon={UserIcon} label="Gender" value={student.gender || "—"} />
              <InfoRow
                icon={DollarLineIcon}
                label="Payment Status"
                value={student.paymentStatus || "Fully Paid"}
              />
              <InfoRow
                icon={DollarLineIcon}
                label="Balance"
                value={`$${(student.balance ?? 0).toLocaleString()}`}
              />
              <InfoRow
                icon={CalenderIcon}
                label="Admission Date"
                value={new Date(student.admissionDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
              <MailIcon className="h-5 w-5 text-brand-500" />
              Contact & Family
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow icon={MailIcon} label="Email" value={student.email || "—"} />
              <InfoRow icon={UserIcon} label="Phone" value={student.phone || "—"} />
              <InfoRow icon={UserIcon} label="Mother Name" value={student.motherName || "—"} />
              <InfoRow icon={UserIcon} label="Parent Phone" value={student.parentPhone || "—"} />
              <InfoRow icon={UserIcon} label="Address" value={student.address || "—"} />
            </div>
          </div>

          {/* Payment History */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
              <DollarLineIcon className="h-5 w-5 text-brand-500" />
              Tuition Payments
            </h3>
            {student.tuitionPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12 dark:border-gray-700">
                <DollarLineIcon className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No payments recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {student.tuitionPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3.5 dark:border-gray-800 dark:bg-white/[0.02]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
                      <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 dark:text-white/90">
                        {p.semester} {p.year}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Paid on {new Date(p.paidAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                      </p>
                    </div>
                    <span className="shrink-0 font-bold text-green-600 dark:text-green-400">
                      ${p.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
