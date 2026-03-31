import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveBranchAccess } from "@/lib/pharmacy-branch";

/** Exact lookup by barcode (`Product.code`) for POS scanners and deep links. */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const resolved = await requireActiveBranchAccess(auth.userId, searchParams.get("branchId"));
    if (resolved instanceof NextResponse) return resolved;
    const { branchId } = resolved;

    const raw = (searchParams.get("code") || "").trim();
    if (!raw) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    const codeVariants = Array.from(new Set([raw, raw.toUpperCase(), raw.toLowerCase()]));

    const product = await prisma.product.findFirst({
      where: {
        branchId,
        code: { in: codeVariants },
        isActive: true,
        forSale: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        imageUrl: true,
        sellingPrice: true,
        quantity: true,
        unit: true,
        boxesPerCarton: true,
        pcsPerBox: true,
        expiryDate: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (e) {
    console.error("Product by barcode error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
