import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanAccessBranch } from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";
import { parseSaleUnit, quantityInUnitToPcs, type SaleUnit } from "@/lib/product-packaging";

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
      return NextResponse.json({ error: "Invalid sale id" }, { status: 400 });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: parsedId },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        patient: { select: { id: true, patientCode: true, name: true } },
        outreachTeam: { select: { id: true, name: true, creditBalance: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                imageUrl: true,
                boxesPerCarton: true,
                pcsPerBox: true,
              },
            },
          },
        },
        depositTransaction: { select: { id: true } },
      },
    });

    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    if (sale.branchId != null && !(await userCanAccessBranch(auth.userId, sale.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(sale);
  } catch (e) {
    console.error("Get sale error:", e);
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

    const canEdit =
      (await userHasPermission(auth.userId, "pharmacy.edit")) ||
      (await userHasPermission(auth.userId, "pharmacy.pos"));
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid sale id" }, { status: 400 });
    }

    const body = await req.json();
    const { discount, paymentMethod, notes, patientId, customerType, items } = body;

    const existing = await prisma.sale.findUnique({
      where: { id: parsedId },
      include: {
        items: {
          include: {
            product: { select: { boxesPerCarton: true, pcsPerBox: true } },
          },
        },
        depositTransaction: { select: { id: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    if (existing.branchId != null && !(await userCanAccessBranch(auth.userId, existing.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing.outreachTeamId != null || existing.customerType === "outreach") {
      return NextResponse.json(
        {
          error:
            "Outreach sales cannot be edited here. Adjust stock via outreach return or contact an administrator.",
        },
        { status: 400 }
      );
    }

    if (existing.depositTransaction) {
      return NextResponse.json(
        {
          error:
            "This sale has a finance deposit recorded. It cannot be edited here. Ask an administrator if a correction is needed.",
        },
        { status: 400 }
      );
    }

    const salePatientId =
      patientId !== undefined
        ? patientId && Number.isInteger(Number(patientId))
          ? Number(patientId)
          : null
        : existing.patientId;
    const saleCustomerType =
      customerType !== undefined
        ? customerType === "patient" && salePatientId
          ? "patient"
          : "walking"
        : existing.customerType;

    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
      }

      const newLines: {
        productId: number;
        quantity: number;
        saleUnit: SaleUnit;
        unitPrice: number;
        totalAmount: number;
        pcs: number;
      }[] = [];
      let subtotal = 0;
      for (const it of items) {
        const productId = Number(it.productId);
        const quantity = Math.max(1, Math.floor(Number(it.quantity) || 0));
        const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
        const saleUnit = parseSaleUnit((it as { saleUnit?: unknown }).saleUnit);
        const lineTotal = quantity * unitPrice;
        if (!Number.isInteger(productId) || productId <= 0) continue;

        const prodRow = await prisma.product.findUnique({
          where: { id: productId },
          select: {
            boxesPerCarton: true,
            pcsPerBox: true,
            forSale: true,
            branchId: true,
          },
        });
        if (!prodRow) {
          throw new Error(`NOT_FOR_SALE:${productId}`);
        }
        if (prodRow.branchId !== existing.branchId) {
          throw new Error("Product branch mismatch for this sale.");
        }
        const pack = { boxesPerCarton: prodRow.boxesPerCarton, pcsPerBox: prodRow.pcsPerBox };
        const conv = quantityInUnitToPcs(pack, quantity, saleUnit);
        if ("error" in conv) {
          throw new Error(conv.error);
        }
        const pcs = conv.pcs;
        if (pcs <= 0) throw new Error("Invalid quantity for this unit.");
        if (!prodRow.forSale) {
          throw new Error(`NOT_FOR_SALE:${productId}`);
        }

        newLines.push({ productId, quantity, saleUnit, unitPrice, totalAmount: lineTotal, pcs });
        subtotal += lineTotal;
      }
      if (newLines.length === 0) {
        return NextResponse.json({ error: "Valid line items required" }, { status: 400 });
      }

      const discountAmount =
        discount !== undefined
          ? Math.min(subtotal, Math.max(0, Number(discount) || 0))
          : existing.discount;
      const finalTotal = Math.max(0, subtotal - discountAmount);

      const updated = await prisma.$transaction(async (tx) => {
        for (const old of existing.items) {
          const pack = {
            boxesPerCarton: old.product.boxesPerCarton,
            pcsPerBox: old.product.pcsPerBox,
          };
          const su = parseSaleUnit(old.saleUnit);
          const conv = quantityInUnitToPcs(pack, old.quantity, su);
          if ("error" in conv) {
            throw new Error(conv.error);
          }
          await tx.product.update({
            where: { id: old.productId },
            data: { quantity: { increment: conv.pcs } },
          });
        }

        await tx.saleItem.deleteMany({ where: { saleId: parsedId } });

        for (const line of newLines) {
          const product = await tx.product.findUnique({
            where: { id: line.productId },
            select: { quantity: true, forSale: true },
          });
          if (!product || !product.forSale) {
            throw new Error(`NOT_FOR_SALE:${line.productId}`);
          }
          if (product.quantity < line.pcs) {
            throw new Error(`INSUFFICIENT:${line.productId}`);
          }
        }

        for (const line of newLines) {
          await tx.saleItem.create({
            data: {
              saleId: parsedId,
              productId: line.productId,
              quantity: line.quantity,
              saleUnit: line.saleUnit,
              unitPrice: line.unitPrice,
              totalAmount: line.totalAmount,
            },
          });
          await tx.product.update({
            where: { id: line.productId },
            data: { quantity: { decrement: line.pcs } },
          });
        }

        return tx.sale.update({
          where: { id: parsedId },
          data: {
            totalAmount: finalTotal,
            discount: discountAmount,
            paymentMethod:
              paymentMethod !== undefined ? String(paymentMethod).trim() || "cash" : existing.paymentMethod,
            notes: notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
            patientId: salePatientId,
            customerType: saleCustomerType,
          },
          include: {
            branch: { select: { id: true, name: true } },
            patient: { select: { id: true, patientCode: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, name: true, code: true } },
              },
            },
          },
        });
      });

      return NextResponse.json(updated);
    }

    const subtotal = existing.items.reduce((s, i) => s + i.totalAmount, 0);
    const discountAmount =
      discount !== undefined
        ? Math.min(subtotal, Math.max(0, Number(discount) || 0))
        : existing.discount;
    const finalTotal = Math.max(0, subtotal - discountAmount);

    const updated = await prisma.sale.update({
      where: { id: parsedId },
      data: {
        totalAmount: finalTotal,
        discount: discountAmount,
        paymentMethod:
          paymentMethod !== undefined ? String(paymentMethod).trim() || "cash" : existing.paymentMethod,
        notes: notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
        patientId: patientId !== undefined ? salePatientId : existing.patientId,
        customerType: customerType !== undefined ? saleCustomerType : existing.customerType,
      },
      include: {
        branch: { select: { id: true, name: true } },
        patient: { select: { id: true, patientCode: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (msg.startsWith("NOT_FOR_SALE:")) {
      const id = msg.split(":")[1];
      return NextResponse.json(
        {
          error:
            `Product ${id} is internal stock (not for sale). Use internal usage to adjust stock.`,
        },
        { status: 400 }
      );
    }
    if (msg.startsWith("INSUFFICIENT:")) {
      const id = msg.split(":")[1];
      return NextResponse.json({ error: `Insufficient stock for product ID ${id}` }, { status: 400 });
    }
    if (msg.includes("Insufficient") || msg.includes("not available")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.startsWith("This product")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("Patch sale error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
