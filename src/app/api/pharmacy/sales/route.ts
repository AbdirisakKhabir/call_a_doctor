import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPharmacyReportListBranchScope,
  userCanTransactInventoryAtBranch,
} from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";
import { lineQuantityToBaseUnits, parseSaleUnit } from "@/lib/product-packaging";
import { getSaleUnitForProduct } from "@/lib/product-sale-units";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const listScope = await getPharmacyReportListBranchScope(auth.userId);
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const branchIdParam = searchParams.get("branchId");
    const appointmentIdParam = searchParams.get("appointmentId");
    const kindParam = searchParams.get("kind")?.trim() || null;
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDate = Object.keys(dateFilter).length > 0;

    const where: {
      branchId?: number | { in: number[] };
      saleDate?: { gte?: Date; lte?: Date };
      appointmentId?: number;
      kind?: string;
    } = {
      ...(hasDate ? { saleDate: dateFilter } : {}),
    };

    if (kindParam) {
      if (kindParam !== "appointment") {
        return NextResponse.json({ error: "Invalid kind filter" }, { status: 400 });
      }
      const canSeeKind =
        (await userHasPermission(auth.userId, "pharmacy.view")) ||
        (await userHasPermission(auth.userId, "pharmacy.pos")) ||
        (await userHasPermission(auth.userId, "appointments.view")) ||
        (await userHasPermission(auth.userId, "accounts.view")) ||
        (await userHasPermission(auth.userId, "accounts.reports"));
      if (!canSeeKind) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where.kind = "appointment";
    }

    if (appointmentIdParam) {
      const aid = Number(appointmentIdParam);
      if (!Number.isInteger(aid) || aid <= 0) {
        return NextResponse.json({ error: "Invalid appointment id" }, { status: 400 });
      }
      const canSee =
        (await userHasPermission(auth.userId, "pharmacy.view")) ||
        (await userHasPermission(auth.userId, "pharmacy.pos")) ||
        (await userHasPermission(auth.userId, "appointments.view"));
      if (!canSee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where.appointmentId = aid;
    }

    if (listScope !== "all") {
      where.branchId = { in: listScope };
    }

    if (branchIdParam) {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid)) {
        return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });
      }
      if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where.branchId = bid;
    }

    if (paginate) {
      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          where,
          include: {
            branch: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
            outreachTeam: { select: { id: true, name: true, creditBalance: true } },
            depositTransaction: { select: { id: true } },
            _count: { select: { items: true } },
          },
          orderBy: { saleDate: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.sale.count({ where }),
      ]);

      return NextResponse.json({
        data: sales.map((s) => ({
          ...s,
          patient: s.patient ? serializePatient(s.patient) : null,
        })),
        total,
        page,
        pageSize,
      });
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        depositTransaction: { select: { id: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { saleDate: "desc" },
    });
    return NextResponse.json(
      sales.map((s) => ({
        ...s,
        patient: s.patient ? serializePatient(s.patient) : null,
      }))
    );
  } catch (e) {
    console.error("Sales list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      discount,
      paymentMethod,
      paymentMethodId: paymentMethodIdBody,
      notes,
      items,
      patientId,
      customerType: customerTypeRaw,
      branchId,
      outreachTeamId: outreachTeamIdBody,
      outreachOnCredit: outreachOnCreditBody,
    } = body;

    const customerType = typeof customerTypeRaw === "string" ? customerTypeRaw : "walking";
    const isLab = customerType === "lab";

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    const bid = branchId != null && branchId !== "" ? Number(branchId) : NaN;
    if (!Number.isInteger(bid)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    const branch = await prisma.branch.findFirst({
      where: { id: bid, isActive: true },
    });
    if (!branch) {
      return NextResponse.json({ error: "Invalid or inactive branch" }, { status: 400 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
      return NextResponse.json(
        { error: "You are not allowed to record sales for this branch" },
        { status: 403 }
      );
    }

    let totalAmount = 0;
    const saleItems: {
      productId: number;
      quantity: number;
      saleUnit: string;
      unitPrice: number;
      totalAmount: number;
      baseUnits: number;
    }[] = [];

    for (const it of items) {
      const productId = Number(it.productId);
      const quantity = Math.max(1, Math.floor(Number(it.quantity) || 0));
      const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
      const saleUnitKey = parseSaleUnit((it as { saleUnit?: unknown }).saleUnit);
      const lineTotal = quantity * unitPrice;

      if (!Number.isInteger(productId) || productId <= 0) continue;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          quantity: true,
          forSale: true,
          branchId: true,
        },
      });
      if (!product) {
        return NextResponse.json(
          { error: `Insufficient stock for product ID ${productId}` },
          { status: 400 }
        );
      }
      const su = await getSaleUnitForProduct(prisma, productId, saleUnitKey);
      if (!su) {
        return NextResponse.json(
          {
            error: `Unknown sale unit for this product (key: "${saleUnitKey}"). Configure units on the inventory product.`,
          },
          { status: 400 }
        );
      }
      const baseUnits = lineQuantityToBaseUnits(quantity, su.baseUnitsEach);
      if (baseUnits <= 0) {
        return NextResponse.json({ error: "Invalid quantity for this unit." }, { status: 400 });
      }
      if (product.quantity < baseUnits) {
        return NextResponse.json(
          { error: `Insufficient stock for product ID ${productId}` },
          { status: 400 }
        );
      }
      if (product.branchId !== bid) {
        return NextResponse.json(
          {
            error:
              "A product on this sale does not belong to the selected branch. Choose the branch that holds this stock or pick matching products.",
          },
          { status: 400 }
        );
      }
      if (!product.forSale && !isLab) {
        return NextResponse.json(
          {
            error:
              "This product is internal stock (not for sale). Use POS with customer Lab to move stock into lab inventory, or stock is reduced when linked services are completed.",
          },
          { status: 400 }
        );
      }

      saleItems.push({ productId, quantity, saleUnit: saleUnitKey, unitPrice, totalAmount: lineTotal, baseUnits });
      totalAmount += lineTotal;
    }

    if (saleItems.length === 0) {
      return NextResponse.json({ error: "Valid items required" }, { status: 400 });
    }

    const discountAmount = Math.max(0, Number(discount) || 0);
    const finalTotal = Math.max(0, totalAmount - discountAmount);

    const salePatientId = patientId && Number.isInteger(Number(patientId)) ? Number(patientId) : null;
    const isOutreach = customerType === "outreach" && !isLab;
    const outreachTeamIdNum =
      outreachTeamIdBody != null && outreachTeamIdBody !== "" ? Number(outreachTeamIdBody) : NaN;
    const outreachOnCredit =
      outreachOnCreditBody === undefined ? true : Boolean(outreachOnCreditBody);

    let saleCustomerType: string;
    let outreachTeamId: number | null = null;

    if (isLab) {
      saleCustomerType = "lab";
    } else if (isOutreach) {
      if (!Number.isInteger(outreachTeamIdNum) || outreachTeamIdNum <= 0) {
        return NextResponse.json(
          { error: "Select an outreach team for this sale." },
          { status: 400 }
        );
      }
      const team = await prisma.outreachTeam.findFirst({
        where: { id: outreachTeamIdNum, branchId: bid, isActive: true },
      });
      if (!team) {
        return NextResponse.json(
          { error: "Invalid outreach team for this branch." },
          { status: 400 }
        );
      }
      outreachTeamId = outreachTeamIdNum;
      saleCustomerType = "outreach";
    } else {
      saleCustomerType = customerType === "patient" && salePatientId ? "patient" : "walking";
    }

    const pmIdNum =
      paymentMethodIdBody != null && paymentMethodIdBody !== ""
        ? Number(paymentMethodIdBody)
        : NaN;
    const pmName = paymentMethod ? String(paymentMethod).trim() : "";

    let ledgerPm: {
      id: number;
      name: string;
      accountId: number;
      account: { id: number; name: string; isActive: boolean };
    } | null = null;

    const skipLedgerPayment =
      (isOutreach && outreachOnCredit) || (isLab && finalTotal <= 0);

    if (!skipLedgerPayment) {
      ledgerPm =
        Number.isInteger(pmIdNum) && pmIdNum > 0
          ? await prisma.ledgerPaymentMethod.findFirst({
              where: { id: pmIdNum, isActive: true, account: { isActive: true } },
              include: { account: { select: { id: true, name: true, isActive: true } } },
            })
          : null;
      if (!ledgerPm && pmName) {
        ledgerPm = await prisma.ledgerPaymentMethod.findFirst({
          where: { name: pmName, isActive: true, account: { isActive: true } },
          include: { account: { select: { id: true, name: true, isActive: true } } },
        });
      }
      if (!ledgerPm) {
        return NextResponse.json(
          {
            error:
              "Invalid payment method. Choose an active method linked to a finance account (Settings → Payment methods).",
          },
          { status: 400 }
        );
      }
    }

    const paymentLabel =
      isOutreach && outreachOnCredit
        ? "Outreach credit (AR)"
        : isLab && finalTotal <= 0
          ? "Lab transfer (no charge)"
          : (ledgerPm?.name ?? "—");

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          branchId: bid,
          totalAmount: finalTotal,
          discount: discountAmount,
          paymentMethod: paymentLabel,
          notes: notes ? String(notes).trim() : null,
          patientId: isOutreach || isLab ? null : salePatientId,
          customerType: saleCustomerType,
          outreachTeamId,
          outreachOnCredit: isOutreach ? outreachOnCredit : false,
          createdById: auth.userId,
          items: {
            create: saleItems.map((row) => ({
              productId: row.productId,
              quantity: row.quantity,
              saleUnit: row.saleUnit,
              unitPrice: row.unitPrice,
              totalAmount: row.totalAmount,
            })),
          },
        },
      });

      for (const it of saleItems) {
        await tx.product.update({
          where: { id: it.productId },
          data: { quantity: { decrement: it.baseUnits } },
        });
      }

      if (isLab) {
        for (const it of saleItems) {
          const prod = await tx.product.findUnique({
            where: { id: it.productId },
            select: { id: true, code: true, name: true, unit: true },
          });
          if (!prod) {
            throw new Error("LAB_PRODUCT_MISSING");
          }
          const code = prod.code.trim().toUpperCase();
          let labRow = await tx.labInventoryItem.findFirst({
            where: { branchId: bid, code },
          });
          if (!labRow) {
            labRow = await tx.labInventoryItem.create({
              data: {
                branchId: bid,
                code,
                name: prod.name,
                unit: prod.unit || "pcs",
                quantity: 0,
                sellingPrice: 0,
              },
            });
            await tx.labInventoryUnit.create({
              data: {
                labInventoryItemId: labRow.id,
                unitKey: "base",
                label: (prod.unit || "pcs").slice(0, 191),
                baseUnitsEach: 1,
                sortOrder: 0,
              },
            });
          }
          await tx.labInventoryItem.update({
            where: { id: labRow.id },
            data: { quantity: { increment: it.baseUnits } },
          });
          await tx.labStockMovement.create({
            data: {
              labInventoryItemId: labRow.id,
              branchId: bid,
              signedQuantity: it.baseUnits,
              reason: "receive",
              notes: `POS to lab · Pharmacy sale #${created.id} · product #${prod.id} (+${it.baseUnits} base)`,
              createdById: auth.userId,
            },
          });
        }
      }

      if (isOutreach && outreachTeamId) {
        if (outreachOnCredit) {
          await tx.outreachTeam.update({
            where: { id: outreachTeamId },
            data: { creditBalance: { increment: finalTotal } },
          });
        }
        for (const it of saleItems) {
          await tx.outreachInventoryItem.upsert({
            where: {
              teamId_productId: { teamId: outreachTeamId, productId: it.productId },
            },
            create: {
              teamId: outreachTeamId,
              productId: it.productId,
              quantity: it.baseUnits,
            },
            update: { quantity: { increment: it.baseUnits } },
          });
        }
      }

      if (ledgerPm && finalTotal > 0) {
        await tx.accountTransaction.create({
          data: {
            accountId: ledgerPm.accountId,
            kind: "deposit",
            amount: finalTotal,
            description: `Pharmacy POS sale #${created.id}`,
            saleId: created.id,
            paymentMethodId: ledgerPm.id,
            transactionDate: new Date(),
            createdById: auth.userId,
          },
        });
      }

      return tx.sale.findUnique({
        where: { id: created.id },
        include: {
          patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
          outreachTeam: { select: { id: true, name: true, creditBalance: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, code: true } },
            },
          },
          depositTransaction: {
            select: { id: true, amount: true, kind: true, accountId: true },
          },
        },
      });
    });

    if (!sale) {
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "pharmacy.sale.create",
      module: "pharmacy",
      resourceType: "Sale",
      resourceId: sale.id,
      metadata: {
        branchId: bid,
        totalAmount: sale.totalAmount,
        customerType: saleCustomerType,
      },
    });
    return NextResponse.json({
      ...sale,
      patient: sale.patient ? serializePatient(sale.patient) : null,
    });
  } catch (e) {
    console.error("Create sale error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
