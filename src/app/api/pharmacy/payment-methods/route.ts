import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

/** Active ledger payment methods (linked finance accounts) for pharmacy POS & purchases — requires pharmacy.view, pharmacy.pos, or accounts.view */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canPharmacy = await userHasPermission(auth.userId, "pharmacy.view");
    const canPos = await userHasPermission(auth.userId, "pharmacy.pos");
    const canAccounts = await userHasPermission(auth.userId, "accounts.view");
    if (!canPharmacy && !canPos && !canAccounts) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const methods = await prisma.ledgerPaymentMethod.findMany({
      where: { isActive: true, account: { isActive: true } },
      include: {
        account: { select: { id: true, name: true, type: true, code: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(methods);
  } catch (e) {
    console.error("Pharmacy payment methods error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
