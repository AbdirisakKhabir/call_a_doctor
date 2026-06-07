import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { calculateAgeFromDate } from "@/lib/age-from-dob";

const DETAIL_LIMIT = 5000;

function parseDayStart(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

function parseDayEnd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function effectiveAgeYears(age: number | null, dob: Date | null): number | null {
  let a = age;
  if (a == null && dob) a = calculateAgeFromDate(dob);
  return a == null ? null : a;
}

function ageBucket(age: number | null, dob: Date | null): string {
  const a = effectiveAgeYears(age, dob);
  if (a == null) return "Unknown";
  if (a < 18) return "0–17";
  if (a < 36) return "18–35";
  if (a < 56) return "36–55";
  return "56+";
}

const AGE_ORDER = ["0–17", "18–35", "36–55", "56+", "Unknown"];

const AGE_ABS_MAX = 130;

function parseAgeBound(param: string | null): number | null {
  if (param == null || param.trim() === "") return null;
  const n = Number(param);
  if (!Number.isInteger(n) || n < 0 || n > AGE_ABS_MAX) return null;
  return n;
}

function parseOptionalPositiveInt(param: string | null): number | null {
  if (param == null || param.trim() === "") return null;
  const n = Number(param);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "patients.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const branchId = Number(req.nextUrl.searchParams.get("branchId"));
    const from = req.nextUrl.searchParams.get("from") || "";
    const to = req.nextUrl.searchParams.get("to") || "";
    const sp = req.nextUrl.searchParams;
    const ageMin = parseAgeBound(sp.get("ageMin"));
    const ageMax = parseAgeBound(sp.get("ageMax"));
    const cityIdRaw = parseOptionalPositiveInt(sp.get("cityId"));
    const villageIdRaw = parseOptionalPositiveInt(sp.get("villageId"));

    if (ageMin != null && ageMax != null && ageMin > ageMax) {
      return NextResponse.json({ error: "ageMin must be less than or equal to ageMax" }, { status: 400 });
    }

    if (!Number.isInteger(branchId)) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }

    const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) {
      return NextResponse.json({ error: "Invalid or inactive branch" }, { status: 400 });
    }

    const fromD = parseDayStart(from);
    const toD = parseDayEnd(to);
    if (!fromD || !toD) {
      return NextResponse.json({ error: "from and to dates (YYYY-MM-DD) are required" }, { status: 400 });
    }
    if (fromD > toD) {
      return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
    }

    let locationCityId: number | null = cityIdRaw;
    let locationCityName: string | null = null;
    let locationVillageId: number | null = villageIdRaw;
    let locationVillageName: string | null = null;

    if (cityIdRaw != null) {
      const cityRow = await prisma.city.findFirst({
        where: { id: cityIdRaw, isActive: true },
        select: { id: true, name: true },
      });
      if (!cityRow) {
        return NextResponse.json({ error: "Invalid or inactive city" }, { status: 400 });
      }
      locationCityName = cityRow.name;
    }

    if (villageIdRaw != null) {
      const villageRow = await prisma.village.findFirst({
        where: { id: villageIdRaw, isActive: true },
        select: { id: true, name: true, cityId: true, city: { select: { name: true } } },
      });
      if (!villageRow) {
        return NextResponse.json({ error: "Invalid or inactive village" }, { status: 400 });
      }
      locationVillageName = villageRow.name;
      if (locationCityId != null && villageRow.cityId !== locationCityId) {
        return NextResponse.json(
          { error: "Selected village does not belong to the selected city" },
          { status: 400 }
        );
      }
      if (locationCityId == null) {
        locationCityId = villageRow.cityId;
        locationCityName = villageRow.city.name;
      }
    }

    const baseWhere: Prisma.PatientWhereInput = {
      registeredBranchId: branchId,
      createdAt: { gte: fromD, lte: toD },
    };
    if (locationCityId != null) baseWhere.cityId = locationCityId;
    if (locationVillageId != null) baseWhere.villageId = locationVillageId;

    let where: Prisma.PatientWhereInput = baseWhere;
    let monthlyFilterIds: number[] | null = null;

    if (ageMin != null || ageMax != null) {
      const candidates = await prisma.patient.findMany({
        where: baseWhere,
        select: { id: true, age: true, dateOfBirth: true },
      });
      const lo = ageMin ?? 0;
      const hi = ageMax ?? AGE_ABS_MAX;
      const allowedIds = candidates
        .filter((p) => {
          const a = effectiveAgeYears(p.age, p.dateOfBirth);
          if (a == null) return false;
          return a >= lo && a <= hi;
        })
        .map((p) => p.id);
      if (allowedIds.length === 0) {
        return NextResponse.json({
          branch: { id: branch.id, name: branch.name },
          from: from.trim(),
          to: to.trim(),
          ageFilter: { min: ageMin, max: ageMax },
          locationFilter: {
            cityId: locationCityId,
            cityName: locationCityName,
            villageId: locationVillageId,
            villageName: locationVillageName,
          },
          totalNewMembers: 0,
          summary: {
            total: 0,
            withPhone: 0,
            withEmail: 0,
            withCityAndVillage: 0,
            withPhonePercent: 0,
            withEmailPercent: 0,
            withCityAndVillagePercent: 0,
          },
          byCity: [],
          byVillage: [],
          byGender: [],
          byReferralSource: [],
          byAgeGroup: [],
          byMonth: [],
          detail: [],
          detailTruncated: false,
          detailTotal: 0,
        });
      }
      where = { ...baseWhere, id: { in: allowedIds } };
      monthlyFilterIds = allowedIds;
    }

    const monthlyRowsQuery =
      monthlyFilterIds !== null
        ? prisma.$queryRaw<Array<{ ym: string; c: bigint }>>(
            Prisma.sql`
              SELECT DATE_FORMAT(createdAt, '%Y-%m') AS ym, COUNT(*) AS c
              FROM patients
              WHERE registeredBranchId = ${branchId}
                AND createdAt >= ${fromD}
                AND createdAt <= ${toD}
                AND id IN (${Prisma.join(monthlyFilterIds)})
              GROUP BY ym
              ORDER BY ym ASC
            `
          )
        : prisma.$queryRaw<Array<{ ym: string; c: bigint }>>(
            Prisma.sql`
              SELECT DATE_FORMAT(createdAt, '%Y-%m') AS ym, COUNT(*) AS c
              FROM patients
              WHERE registeredBranchId = ${branchId}
                AND createdAt >= ${fromD}
                AND createdAt <= ${toD}
                ${locationCityId != null ? Prisma.sql`AND cityId = ${locationCityId}` : Prisma.empty}
                ${locationVillageId != null ? Prisma.sql`AND villageId = ${locationVillageId}` : Prisma.empty}
              GROUP BY ym
              ORDER BY ym ASC
            `
          );

    const [
      total,
      byCityAgg,
      byVillageAgg,
      byGenderAgg,
      byReferralAgg,
      withPhone,
      withEmail,
      withCityAndVillage,
      monthlyRows,
      ageRows,
      detailList,
      detailTotal,
    ] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.groupBy({
        by: ["cityId"],
        where: { ...where, cityId: { not: null } },
        _count: { _all: true },
      }),
      prisma.patient.groupBy({
        by: ["villageId"],
        where: { ...where, villageId: { not: null } },
        _count: { _all: true },
      }),
      prisma.patient.groupBy({
        by: ["gender"],
        where,
        _count: { _all: true },
      }),
      prisma.patient.groupBy({
        by: ["referralSourceId"],
        where,
        _count: { _all: true },
      }),
      prisma.patient.count({
        where: {
          ...where,
          phone: { not: null },
          NOT: { phone: "" },
        },
      }),
      prisma.patient.count({
        where: {
          ...where,
          email: { not: null },
          NOT: { email: "" },
        },
      }),
      prisma.patient.count({
        where: {
          ...where,
          cityId: { not: null },
          villageId: { not: null },
        },
      }),
      monthlyRowsQuery,
      prisma.patient.findMany({
        where,
        select: { age: true, dateOfBirth: true },
      }),
      prisma.patient.findMany({
        where,
        take: DETAIL_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          patientCode: true,
          firstName: true,
          lastName: true,
          gender: true,
          phone: true,
          mobile: true,
          email: true,
          age: true,
          dateOfBirth: true,
          address: true,
          createdAt: true,
          city: { select: { name: true } },
          village: { select: { name: true } },
          referralSource: { select: { name: true } },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    const cityIds = byCityAgg.map((r) => r.cityId).filter((id): id is number => id != null);
    const villageIds = byVillageAgg.map((r) => r.villageId).filter((id): id is number => id != null);
    const referralIds = byReferralAgg
      .map((r) => r.referralSourceId)
      .filter((id): id is number => id != null);

    const [cities, villages, referrals] = await Promise.all([
      cityIds.length
        ? prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
        : [],
      villageIds.length
        ? prisma.village.findMany({
            where: { id: { in: villageIds } },
            select: { id: true, name: true, cityId: true, city: { select: { id: true, name: true } } },
          })
        : [],
      referralIds.length
        ? prisma.referralSource.findMany({ where: { id: { in: referralIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const cityName = new Map(cities.map((c) => [c.id, c.name]));
    const byCity = byCityAgg
      .filter((r) => r.cityId != null)
      .map((r) => {
        const c = r.cityId as number;
        const count = r._count._all;
        return {
          cityId: c,
          cityName: cityName.get(c) ?? "—",
          count,
          percent: pct(count, total),
        };
      })
      .sort((a, b) => a.cityName.localeCompare(b.cityName));

    const villageMeta = new Map(villages.map((v) => [v.id, v]));
    const byVillage = byVillageAgg
      .filter((r) => r.villageId != null)
      .map((r) => {
        const vid = r.villageId as number;
        const meta = villageMeta.get(vid);
        const count = r._count._all;
        return {
          villageId: vid,
          villageName: meta?.name ?? "—",
          cityId: meta?.cityId ?? null,
          cityName: meta?.city?.name ?? "—",
          count,
          percent: pct(count, total),
        };
      })
      .sort((a, b) => a.cityName.localeCompare(b.cityName) || a.villageName.localeCompare(b.villageName));

    const refName = new Map(referrals.map((x) => [x.id, x.name]));

    const genderLabel = (g: string | null) => {
      if (g == null || g.trim() === "") return "Not specified";
      return g;
    };

    const byGender = byGenderAgg
      .map((r) => {
        const label = genderLabel(r.gender);
        const count = r._count._all;
        return { label, count, percent: pct(count, total) };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    const byReferralSource = byReferralAgg
      .map((r) => {
        const id = r.referralSourceId;
        const count = r._count._all;
        const name =
          id == null ? "Not specified" : refName.get(id) ?? `Referral #${id}`;
        return {
          referralSourceId: id,
          name,
          count,
          percent: pct(count, total),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const ageCounts = new Map<string, number>();
    for (const row of ageRows) {
      const b = ageBucket(row.age, row.dateOfBirth);
      ageCounts.set(b, (ageCounts.get(b) ?? 0) + 1);
    }
    const ageLabels = [...ageCounts.keys()].sort((a, b) => {
      const ia = AGE_ORDER.indexOf(a);
      const ib = AGE_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    const byAgeGroup = ageLabels.map((label) => {
      const count = ageCounts.get(label) ?? 0;
      return { label, count, percent: pct(count, total) };
    });

    const byMonth = monthlyRows.map((row) => ({
      month: row.ym,
      label: row.ym,
      count: Number(row.c),
    }));

    const detail = detailList.map((p) => ({
      patientCode: p.patientCode,
      firstName: p.firstName,
      lastName: p.lastName,
      gender: p.gender ?? "",
      phone: p.phone ?? "",
      mobile: p.mobile ?? "",
      email: p.email ?? "",
      city: p.city?.name ?? "",
      village: p.village?.name ?? "",
      address: p.address ?? "",
      referralSource: p.referralSource?.name ?? "",
      ageYears: effectiveAgeYears(p.age, p.dateOfBirth),
      ageGroup: ageBucket(p.age, p.dateOfBirth),
      registeredAt: p.createdAt.toISOString(),
    }));

    return NextResponse.json({
      branch: { id: branch.id, name: branch.name },
      from: from.trim(),
      to: to.trim(),
      ageFilter: {
        min: ageMin,
        max: ageMax,
      },
      locationFilter: {
        cityId: locationCityId,
        cityName: locationCityName,
        villageId: locationVillageId,
        villageName: locationVillageName,
      },
      totalNewMembers: total,
      summary: {
        total,
        withPhone,
        withEmail,
        withCityAndVillage,
        withPhonePercent: pct(withPhone, total),
        withEmailPercent: pct(withEmail, total),
        withCityAndVillagePercent: pct(withCityAndVillage, total),
      },
      byCity,
      byVillage,
      byGender,
      byReferralSource,
      byAgeGroup,
      byMonth,
      detail,
      detailTruncated: detailTotal > DETAIL_LIMIT,
      detailTotal,
    });
  } catch (e) {
    console.error("Client registration report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
