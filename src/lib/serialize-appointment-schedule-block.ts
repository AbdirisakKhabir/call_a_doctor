type WindowRow = {
  id: number;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

export function serializeAppointmentScheduleBlock(b: {
  id: number;
  branchId: number | null;
  branch: { id: number; name: string } | null;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  windows: WindowRow[];
}) {
  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  return {
    id: b.id,
    branchId: b.branchId,
    branch: b.branch,
    startDate: iso(b.startDate),
    endDate: iso(b.endDate),
    allDay: b.allDay,
    label: b.label,
    isActive: b.isActive,
    windows: (b.windows ?? []).map((w) => ({
      id: w.id,
      startTime: w.startTime,
      endTime: w.endTime,
      sortOrder: w.sortOrder,
    })),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
