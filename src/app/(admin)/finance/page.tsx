"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DownloadIcon, DollarLineIcon, UserCircleIcon } from "@/icons";

type Bank = { id: number; name: string; code: string; balance: number; accountNumber?: string | null };
type SemesterOption = { id: number; name: string; sortOrder: number; isActive: boolean };
type ClassOption = { id: number; name: string; semester: string; year: number; course: { code: string; name: string } };
type UnpaidStudent = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: { name: string; code: string; tuitionFee: number | null };
  tuitionFee: number | null;
  paymentStatus?: string;
};
type SearchStudent = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  balance: number;
  paymentStatus: string;
  department: { name: string; code: string; tuitionFee: number | null };
  class: { name: string; semester: string; year: number; course: { code: string } } | null;
  tuitionPayments: { semester: string; year: number; amount: number }[];
};

const CURRENT_YEAR = new Date().getFullYear();

export default function FinancePage() {
  const { hasPermission } = useAuth();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  // Record Payment Form
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<SearchStudent | null>(null);
  const [payBankId, setPayBankId] = useState("");
  const [paySemester, setPaySemester] = useState("");
  const [payYear, setPayYear] = useState(String(CURRENT_YEAR));
  const [payAmountType, setPayAmountType] = useState<"half" | "full" | "custom">("full");
  const [payAmount, setPayAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bank_receipt" | "electronic">("bank_receipt");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unpaid students
  const [unpaidSemester, setUnpaidSemester] = useState("");
  const [unpaidYear, setUnpaidYear] = useState(String(CURRENT_YEAR));
  const [unpaidClassId, setUnpaidClassId] = useState("");
  const [unpaidStudents, setUnpaidStudents] = useState<UnpaidStudent[]>([]);
  const [unpaidClassInfo, setUnpaidClassInfo] = useState<{ name: string; semester: string; year: number; course: { code: string; name: string } } | null>(null);
  const [unpaidLoading, setUnpaidLoading] = useState(false);

  const canRecordPayment = hasPermission("finance.create") || hasPermission("finance.view");

  useEffect(() => {
    authFetch("/api/banks").then((r) => {
      if (r.ok) r.json().then((d: Bank[]) => {
        setBanks(d);
        if (d.length > 0 && !payBankId) setPayBankId(String(d[0].id));
      });
    });
    authFetch("/api/semesters?active=true").then((r) => {
      if (r.ok) r.json().then((d: SemesterOption[]) => {
        setSemesters(d);
        if (d.length > 0 && !paySemester) setPaySemester(d[0].name);
        if (d.length > 0 && !unpaidSemester) setUnpaidSemester(d[0].name);
      });
    });
    authFetch("/api/classes").then((r) => {
      if (r.ok) r.json().then((d: ClassOption[]) => setClasses(d));
    });
  }, []);

  useEffect(() => {
    if (banks.length > 0 && !payBankId) setPayBankId(String(banks[0].id));
  }, [banks, payBankId]);

  useEffect(() => {
    if (semesters.length > 0 && !paySemester) setPaySemester(semesters[0].name);
  }, [semesters, paySemester]);

  useEffect(() => {
    if (semesters.length > 0 && !unpaidSemester) setUnpaidSemester(semesters[0].name);
  }, [semesters, unpaidSemester]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await authFetch(`/api/students/search?q=${encodeURIComponent(q)}&limit=15`);
        if (res.ok) setSearchResults(await res.json());
        else setSearchResults([]);
      } catch {
        setSearchResults([]);
      }
      setSearchLoading(false);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  const filteredClasses = classes.filter(
    (c) => c.semester === unpaidSemester && c.year === Number(unpaidYear)
  );

  useEffect(() => {
    if (unpaidClassId && !filteredClasses.some((c) => c.id === Number(unpaidClassId))) {
      setUnpaidClassId("");
    }
  }, [filteredClasses, unpaidClassId]);

  const tuitionFee = selectedStudent?.department?.tuitionFee ?? 0;
  const expectedFull = selectedStudent?.paymentStatus === "Full Scholarship" ? 0
    : selectedStudent?.paymentStatus === "Half Scholar" ? tuitionFee * 0.5
    : tuitionFee;
  const computedAmount = payAmountType === "half" ? expectedFull * 0.5
    : payAmountType === "full" ? expectedFull
    : payAmount ? Number(payAmount) : expectedFull;

  useEffect(() => {
    if (selectedStudent) {
      if (payAmountType === "full") setPayAmount(String(expectedFull));
      else if (payAmountType === "half") setPayAmount(String(expectedFull * 0.5));
    }
  }, [selectedStudent, payAmountType, expectedFull]);

  const handleSelectStudent = (s: SearchStudent) => {
    setSelectedStudent(s);
    setSearchResults([]);
    setSearchQuery(`${s.firstName} ${s.lastName} (${s.studentId})`);
  };

  const handleClearStudent = () => {
    setSelectedStudent(null);
    setSearchQuery("");
  };

  const handleGenerateUnpaid = async () => {
    if (!unpaidSemester || !unpaidYear || !unpaidClassId) return;
    setUnpaidLoading(true);
    setUnpaidClassInfo(null);
    setUnpaidStudents([]);
    try {
      const params = new URLSearchParams({
        semester: unpaidSemester,
        year: unpaidYear,
        classId: unpaidClassId,
      });
      const res = await authFetch(`/api/finance/unpaid-students?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to load unpaid students");
        return;
      }
      setUnpaidClassInfo(data.class);
      setUnpaidStudents(data.unpaidStudents || []);
    } catch {
      alert("Network error");
    } finally {
      setUnpaidLoading(false);
    }
  };

  const handleExportUnpaidCSV = () => {
    if (unpaidStudents.length === 0) return;
    const headers = ["Student ID", "First Name", "Last Name", "Email", "Phone", "Department", "Tuition Fee"];
    const rows = unpaidStudents.map((s) => [
      s.studentId,
      s.firstName,
      s.lastName,
      s.email || "",
      s.phone || "",
      `${s.department.code} - ${s.department.name}`,
      s.tuitionFee != null ? String(s.tuitionFee) : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Unpaid_Students_${unpaidClassInfo?.course?.code || "class"}_${unpaidSemester}_${unpaidYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError("");
    setPaySuccess(false);
    if (!selectedStudent || !payBankId) {
      setPayError("Please select a student and bank");
      return;
    }
    if (paymentMethod === "bank_receipt" && !receiptNumber.trim()) {
      setPayError("Receipt number is required for bank deposit");
      return;
    }
    if (paymentMethod === "electronic" && !transactionId.trim()) {
      setPayError("Transaction ID is required for electronic payment");
      return;
    }
    setPaySubmitting(true);
    try {
      const res = await authFetch("/api/tuition-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent.studentId,
          semester: paySemester,
          year: Number(payYear),
          amount: computedAmount,
          bankId: Number(payBankId),
          paymentMethod,
          receiptNumber: paymentMethod === "bank_receipt" ? receiptNumber.trim() : undefined,
          transactionId: paymentMethod === "electronic" ? transactionId.trim() : undefined,
          paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
          note: payNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error || "Payment failed");
        return;
      }
      setPaySuccess(true);
      handleClearStudent();
      setPayAmount("");
      setReceiptNumber("");
      setTransactionId("");
      setPayNote("");
      authFetch("/api/banks").then((r) => { if (r.ok) r.json().then(setBanks); });
    } catch {
      setPayError("Network error");
    } finally {
      setPaySubmitting(false);
    }
  };

  if (!hasPermission("finance.view") && !hasPermission("admission.view") && !hasPermission("dashboard.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Finance" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-white/5">
          <p className="text-gray-500 dark:text-gray-400">You do not have permission to view Finance.</p>
        </div>
      </div>
    );
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15 dark:border-gray-600 dark:bg-gray-800/50 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500 dark:focus:bg-gray-800 dark:focus:ring-brand-500/20";
  const selectClass =
    "h-11 w-full appearance-none rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-800 outline-none transition-all focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15 dark:border-gray-600 dark:bg-gray-800/50 dark:text-white dark:focus:border-brand-500 dark:focus:bg-gray-800 dark:focus:ring-brand-500/20";

  return (
    <div>
      <PageBreadCrumb pageTitle="Finance" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Record bank deposits and tuition payments.{" "}
          <Link href="/finance/banks" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Manage Banks
          </Link>
          {" · "}
          <Link href="/reports/payment" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Finance Reports
          </Link>
        </p>
      </div>

      {/* Record Bank Deposit / Tuition Payment */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <DollarLineIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                Record Tuition Payment
              </h3>
              <p className="text-sm text-white/90">
                Search by name, phone, or ID · Select bank & amount · Record deposit
              </p>
            </div>
          </div>
        </div>
        <form onSubmit={handleRecordPayment} className="p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            {payError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-400">
                {payError}
              </div>
            )}
            {paySuccess && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-500/10 dark:text-green-400">
                Payment recorded. Student balance updated. Bank balance increased.
              </div>
            )}

            {/* Student Search */}
            <div className="relative">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <UserCircleIcon className="h-4 w-4 text-brand-500" />
                Student <span className="text-error-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) setSelectedStudent(null);
                  }}
                  placeholder="Search by name, phone, or Student ID"
                  className={`${inputClass} pr-12`}
                />
                {searchLoading && (
                  <div className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectStudent(s)}
                      className="flex w-full flex-col gap-0.5 border-b border-gray-100 px-4 py-3.5 text-left transition-colors hover:bg-brand-50 dark:border-gray-800 dark:hover:bg-brand-500/10 last:border-0"
                    >
                      <span className="font-medium text-gray-800 dark:text-white/90">
                        {s.firstName} {s.lastName}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {s.studentId} · {s.department?.code} · Balance: ${(s.balance ?? 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedStudent && (
              <div className="rounded-xl border-2 border-brand-200 bg-brand-50/50 p-5 dark:border-brand-500/30 dark:bg-brand-500/10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-white/90">
                      {selectedStudent.firstName} {selectedStudent.lastName}
                    </p>
                    <p className="font-mono text-sm text-brand-600 dark:text-brand-400">{selectedStudent.studentId}</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {selectedStudent.department?.name} · Balance: <span className="font-semibold text-gray-700 dark:text-gray-300">${(selectedStudent.balance ?? 0).toLocaleString()}</span>
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleClearStudent}>
                    Change
                  </Button>
                </div>
              </div>
            )}

            {/* Bank, Semester, Year, Date */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Bank <span className="text-error-500">*</span></label>
                <select value={payBankId} onChange={(e) => setPayBankId(e.target.value)} required className={selectClass}>
                  <option value="">Select bank</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Semester</label>
                <select value={paySemester} onChange={(e) => setPaySemester(e.target.value)} className={selectClass}>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
                <input type="number" value={payYear} onChange={(e) => setPayYear(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Date</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { value: "full" as const, label: "Full Semester", amount: `$${expectedFull.toLocaleString()}` },
                  { value: "half" as const, label: "Half", amount: `$${(expectedFull * 0.5).toLocaleString()}` },
                  { value: "custom" as const, label: "Custom", amount: "" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all ${
                      payAmountType === opt.value
                        ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="amountType"
                      checked={payAmountType === opt.value}
                      onChange={() => setPayAmountType(opt.value)}
                      className="sr-only"
                    />
                    <span className="font-medium text-gray-800 dark:text-white/90">{opt.label}</span>
                    {opt.amount && <span className="text-sm text-gray-500 dark:text-gray-400">{opt.amount}</span>}
                  </label>
                ))}
                {payAmountType === "custom" && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Amount"
                    className="h-11 w-28 rounded-xl border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Method</label>
              <div className="flex gap-3">
                {[
                  { value: "bank_receipt" as const, label: "Bank Receipt", desc: "Physical receipt from bank" },
                  { value: "electronic" as const, label: "Electronic", desc: "Mobile / online transfer" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex flex-1 cursor-pointer flex-col gap-0.5 rounded-xl border-2 px-4 py-3 transition-all ${
                      paymentMethod === opt.value
                        ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === opt.value}
                      onChange={() => setPaymentMethod(opt.value)}
                      className="sr-only"
                    />
                    <span className="font-medium text-gray-800 dark:text-white/90">{opt.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {paymentMethod === "bank_receipt" ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Receipt Number <span className="text-error-500">*</span>
                </label>
                <input
                  type="text"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder="Bank receipt number"
                  className={inputClass}
                />
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Transaction ID <span className="text-error-500">*</span>
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="Electronic transaction ID"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Note</label>
              <input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Optional note"
                className={inputClass}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                disabled={!selectedStudent || !payBankId || paySubmitting || !canRecordPayment}
                size="sm"
              >
                {paySubmitting ? "Processing..." : "Record Payment"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Bank Balances Summary */}
      {banks.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
              <DollarLineIcon className="h-5 w-5 text-brand-500" />
              Bank Balances
            </h3>
          </div>
          <div className="flex flex-wrap gap-4 p-6">
            {banks.map((b) => (
              <div
                key={b.id}
                className="flex flex-1 min-w-[200px] items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white px-5 py-4 dark:border-gray-700 dark:from-gray-800/50 dark:to-gray-900/50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{b.code}</p>
                  <p className="font-semibold text-gray-800 dark:text-white/90">{b.name}</p>
                  <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
                    ${(b.balance ?? 0).toLocaleString()}
                  </p>
                </div>
                <Link href="/finance/banks">
                  <Button variant="outline" size="sm">Manage</Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unpaid Students */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
            <UserCircleIcon className="h-5 w-5 text-brand-500" />
            Unpaid Students by Semester & Class
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select semester, year, and class to generate a list of students who have not paid tuition.
          </p>
        </div>
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Semester</label>
              <select
                value={unpaidSemester}
                onChange={(e) => setUnpaidSemester(e.target.value)}
                className="h-10 min-w-[120px] rounded-xl border border-gray-200 bg-gray-50/50 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-600 dark:bg-gray-800/50 dark:text-white"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Year</label>
              <input
                type="number"
                value={unpaidYear}
                onChange={(e) => setUnpaidYear(e.target.value)}
                className="h-10 min-w-[100px] rounded-xl border border-gray-200 bg-gray-50/50 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-600 dark:bg-gray-800/50 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Class</label>
              <select
                value={unpaidClassId}
                onChange={(e) => setUnpaidClassId(e.target.value)}
                className="h-10 min-w-[200px] rounded-xl border border-gray-200 bg-gray-50/50 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15 dark:border-gray-600 dark:bg-gray-800/50 dark:text-white"
              >
                <option value="">Select class</option>
                {filteredClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.course.code} - {c.name} ({c.semester} {c.year})
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              onClick={handleGenerateUnpaid}
              disabled={!unpaidClassId || unpaidLoading}
            >
              {unpaidLoading ? "Loading..." : "Generate List"}
            </Button>
          </div>
        </div>

        {unpaidClassInfo && (
          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-800 dark:text-white/90">
                  {unpaidClassInfo.course.code} - {unpaidClassInfo.name} ({unpaidClassInfo.semester} {unpaidClassInfo.year})
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {unpaidStudents.length} unpaid student{unpaidStudents.length !== 1 ? "s" : ""}
                </p>
              </div>
              {unpaidStudents.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportUnpaidCSV}
                >
                  Export CSV
                </Button>
              )}
            </div>

            {unpaidStudents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800/30">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  All students in this class have paid for {unpaidClassInfo.semester} {unpaidClassInfo.year}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-transparent! hover:bg-transparent!">
                      <TableCell isHeader>Student ID</TableCell>
                      <TableCell isHeader>Name</TableCell>
                      <TableCell isHeader>Email</TableCell>
                      <TableCell isHeader>Phone</TableCell>
                      <TableCell isHeader>Department</TableCell>
                      <TableCell isHeader>Payment</TableCell>
                      <TableCell isHeader className="text-right">Amount Due</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unpaidStudents.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Link
                            href={`/students/${encodeURIComponent(s.studentId)}`}
                            className="font-mono font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            {s.studentId}
                          </Link>
                        </TableCell>
                        <TableCell>{s.firstName} {s.lastName}</TableCell>
                        <TableCell>{s.email || "—"}</TableCell>
                        <TableCell>{s.phone || "—"}</TableCell>
                        <TableCell>{s.department.code} - {s.department.name}</TableCell>
                        <TableCell>{s.paymentStatus || "Fully Paid"}</TableCell>
                        <TableCell className="text-right">
                          {s.tuitionFee != null ? `$${Number(s.tuitionFee).toLocaleString()}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
