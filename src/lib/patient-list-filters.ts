import type { Prisma } from "@prisma/client";

/** Treat balances above this as owing (matches outstanding-balances report). */
export const PATIENT_BALANCE_GT = 0.009;

export function buildPatientListWhere(
  searchParams: URLSearchParams,
  branchFilter: number[] | null
): Prisma.PatientWhereInput {
  const search = searchParams.get("search")?.trim() ?? "";
  const balanceOnly =
    searchParams.get("balanceOnly") === "1" || searchParams.get("balanceOnly") === "true";
  const branchIdParam = searchParams.get("branchId");

  const and: Prisma.PatientWhereInput[] = [{ isActive: true }];

  if (balanceOnly) {
    and.push({ accountBalance: { gt: PATIENT_BALANCE_GT } });
  }

  if (branchIdParam != null && branchIdParam.trim() !== "") {
    const bid = Number(branchIdParam);
    if (Number.isInteger(bid) && bid > 0) {
      and.push({ registeredBranchId: bid });
    }
  } else if (balanceOnly && branchFilter && branchFilter.length > 0) {
    and.push(
      branchFilter.length === 1
        ? { registeredBranchId: branchFilter[0] }
        : { registeredBranchId: { in: branchFilter } }
    );
  }

  if (search.length >= 1) {
    and.push({
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { patientCode: { contains: search } },
        { phone: { contains: search } },
        { mobile: { contains: search } },
        { email: { contains: search } },
      ],
    });
  }

  return and.length === 1 ? and[0] : { AND: and };
}
