import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: parsedId },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, product.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(product);
  } catch (e) {
    console.error("Get product error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    const existingProduct = await prisma.product.findUnique({
      where: { id: parsedId },
      select: { branchId: true, forSale: true },
    });
    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, existingProduct.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      code,
      description,
      imageUrl,
      imagePublicId,
      costPrice,
      sellingPrice,
      quantity,
      unit,
      categoryId,
      isActive,
      forSale,
      internalPurpose,
      expiryDate,
    } = body;

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof code === "string" && code.trim()) {
      const codeNorm = code.trim().toUpperCase();
      const dup = await prisma.product.findFirst({
        where: {
          branchId: existingProduct.branchId,
          code: codeNorm,
          NOT: { id: parsedId },
        },
      });
      if (dup) {
        return NextResponse.json({ error: "Another product at this branch already uses this code" }, { status: 400 });
      }
      data.code = codeNorm;
    }
    if (typeof description !== "undefined") data.description = description ? String(description).trim() : null;
    if (typeof imageUrl !== "undefined") data.imageUrl = imageUrl || null;
    if (typeof imagePublicId !== "undefined") data.imagePublicId = imagePublicId || null;
    if (typeof costPrice === "number" || (typeof costPrice === "string" && costPrice !== "")) data.costPrice = Number(costPrice) || 0;
    if (typeof sellingPrice === "number" || (typeof sellingPrice === "string" && sellingPrice !== "")) data.sellingPrice = Number(sellingPrice) || 0;
    if (typeof quantity === "number" || (typeof quantity === "string" && quantity !== "")) data.quantity = Math.max(0, Math.floor(Number(quantity) || 0));
    if (typeof unit === "string" && unit.trim()) data.unit = unit.trim();
    if (typeof categoryId !== "undefined") {
      if (categoryId === null || categoryId === "") {
        data.categoryId = null;
      } else {
        const cid = Number(categoryId);
        if (!Number.isInteger(cid) || cid <= 0) {
          data.categoryId = null;
        } else {
          const cat = await prisma.category.findFirst({
            where: { id: cid, branchId: existingProduct.branchId },
          });
          if (!cat) {
            return NextResponse.json({ error: "Category does not belong to this branch" }, { status: 400 });
          }
          data.categoryId = cid;
        }
      }
    }
    if (typeof isActive === "boolean") data.isActive = isActive;

    const purposeAllowed = ["laboratory", "cleaning", "general"];
    if (typeof forSale === "boolean") {
      data.forSale = forSale;
      if (forSale) {
        data.internalPurpose = null;
      } else {
        const p = typeof internalPurpose === "string" ? internalPurpose.trim().toLowerCase() : "";
        if (!purposeAllowed.includes(p)) {
          return NextResponse.json(
            { error: "Internal (non-sale) items need purpose: laboratory, cleaning, or general" },
            { status: 400 }
          );
        }
        data.internalPurpose = p;
      }
    } else if (typeof internalPurpose === "string" && internalPurpose.trim()) {
      if (!existingProduct.forSale) {
        const p = internalPurpose.trim().toLowerCase();
        if (!purposeAllowed.includes(p)) {
          return NextResponse.json(
            { error: "Internal purpose must be laboratory, cleaning, or general" },
            { status: 400 }
          );
        }
        data.internalPurpose = p;
      }
    }

    if (typeof expiryDate !== "undefined") {
      if (expiryDate === null || expiryDate === "") {
        data.expiryDate = null;
      } else {
        const d = new Date(String(expiryDate));
        data.expiryDate = Number.isNaN(d.getTime()) ? null : d;
      }
    }
    const product = await prisma.product.update({
      where: { id: parsedId },
      data,
      include: {
        category: { select: { id: true, name: true } },
      },
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "pharmacy.product.update",
      module: "pharmacy",
      resourceType: "Product",
      resourceId: parsedId,
      metadata: { keys: Object.keys(data) },
    });
    return NextResponse.json(product);
  } catch (e) {
    console.error("Update product error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({
      where: { id: parsedId },
      select: { branchId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, existing.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.product.delete({ where: { id: parsedId } });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "pharmacy.product.delete",
      module: "pharmacy",
      resourceType: "Product",
      resourceId: parsedId,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete product error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
