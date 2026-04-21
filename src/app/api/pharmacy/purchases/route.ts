import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPharmacyReportListBranchScope,
  userCanTransactInventoryAtBranch,
} from "@/lib/branch-access";
import { getFinanceAccountBalance } from "@/lib/finance-balance";
import { lineQuantityToBaseUnits } from "@/lib/product-packaging";
import {
  getSaleUnitForProduct,
  normalizeSaleUnitKey,
  replaceProductSaleUnits,
  validateSaleUnitsPayload,
  type SaleUnitInput,
} from "@/lib/product-sale-units";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

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
      branchId?: number | { in: number[] } | null;
      purchaseDate?: { gte?: Date; lte?: Date };
    } = {
      ...(hasDate ? { purchaseDate: dateFilter } : {}),
    };

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

    const include = {
      branch: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      paymentMethod: {
        include: {
          account: { select: { id: true, name: true, type: true } },
        },
      },
      ledgerTransaction: {
        select: {
          id: true,
          amount: true,
          kind: true,
          transactionDate: true,
        },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, code: true } },
        },
      },
    };

    if (paginate) {
      const [purchases, total] = await Promise.all([
        prisma.purchase.findMany({
          where,
          include,
          orderBy: { purchaseDate: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.purchase.count({ where }),
      ]);
      return NextResponse.json({ data: purchases, total, page, pageSize });
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include,
      orderBy: { purchaseDate: "desc" },
    });
    return NextResponse.json(purchases);
  } catch (e) {
    console.error("Purchases list error:", e);
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
    const { supplierId, purchaseDate, notes, items, branchId, paymentMethodId } = body;

    const pmid = paymentMethodId != null && paymentMethodId !== "" ? Number(paymentMethodId) : NaN;
    if (!Number.isInteger(pmid) || pmid <= 0) {
      return NextResponse.json(
        { error: "Payment method is required. Add payment methods under Settings → Payment methods." },
        { status: 400 }
      );
    }

    const paymentMethod = await prisma.ledgerPaymentMethod.findFirst({
      where: { id: pmid, isActive: true },
      include: { account: true },
    });
    if (!paymentMethod || !paymentMethod.account.isActive) {
      return NextResponse.json({ error: "Invalid or inactive payment method" }, { status: 400 });
    }

    const bid = branchId != null && branchId !== "" ? Number(branchId) : NaN;
    if (!Number.isInteger(bid)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    const branchRow = await prisma.branch.findFirst({
      where: { id: bid, isActive: true },
    });
    if (!branchRow) {
      return NextResponse.json({ error: "Invalid or inactive branch" }, { status: 400 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
      return NextResponse.json(
        { error: "You are not allowed to record purchases for this branch" },
        { status: 403 }
      );
    }

    let supplierIdVal: number | null = null;
    if (supplierId != null && supplierId !== "") {
      const sid = Number(supplierId);
      if (!Number.isInteger(sid) || sid <= 0) {
        return NextResponse.json({ error: "Invalid supplier" }, { status: 400 });
      }
      const supplierRow = await prisma.supplier.findFirst({
        where: { id: sid, branchId: bid, isActive: true },
      });
      if (!supplierRow) {
        return NextResponse.json(
          { error: "Supplier not found for this branch or inactive. Pick a supplier linked to the selected branch." },
          { status: 400 }
        );
      }
      supplierIdVal = sid;
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    const purchaseDateVal = purchaseDate ? new Date(purchaseDate) : new Date();
    const allowedPurposes = ["laboratory", "cleaning", "general"] as const;

    const result = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const purchaseItems: {
        productId: number;
        quantity: number;
        purchaseUnit: string;
        unitPrice: number;
        totalAmount: number;
        baseUnits: number;
        /** Optional retail price for this line (weighted into product.sellingPrice when forSale). */
        sellingPriceLine?: number;
      }[] = [];

      for (const it of items) {
        const quantity = Math.max(1, Math.floor(Number(it.quantity) || 0));
        const purchaseUnitKey = normalizeSaleUnitKey(
          ((it as { purchaseUnit?: unknown; purchaseUnitKey?: unknown }).purchaseUnitKey ??
            (it as { purchaseUnit?: unknown }).purchaseUnit) as string | null | undefined
        );
        const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
        const lineTotal = quantity * unitPrice;

        const np = it.newProduct;
        const useNew =
          np != null &&
          typeof np === "object" &&
          String(np.name ?? "").trim().length > 0 &&
          String(np.code ?? "").trim().length > 0;

        let productId: number;

        if (useNew) {
          const name = String(np.name).trim();
          const code = String(np.code).trim().toUpperCase();
          const dup = await tx.product.findUnique({
            where: { branchId_code: { branchId: bid, code } },
          });
          if (dup) {
            throw new Error(`BAD_REQUEST:A product with code "${code}" already exists.`);
          }
          const forSale = np.forSale !== false;
          const purposeRaw =
            typeof np.internalPurpose === "string" ? np.internalPurpose.trim().toLowerCase() : "general";
          if (!forSale && !allowedPurposes.includes(purposeRaw as (typeof allowedPurposes)[number])) {
            throw new Error(
              "BAD_REQUEST:Internal products need a purpose: laboratory, cleaning, or general."
            );
          }
          const sellingPrice = Math.max(0, Number(np.sellingPrice) || 0);
          const unitStr =
            typeof np.unit === "string" && np.unit.trim() ? np.unit.trim() : "pcs";
          const catRaw = np.categoryId;
          const categoryId =
            catRaw != null && catRaw !== ""
              ? Number(catRaw)
              : null;
          const categoryIdVal =
            categoryId != null && Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null;

          if (categoryIdVal) {
            const catOk = await tx.category.findFirst({
              where: { id: categoryIdVal, branchId: bid },
            });
            if (!catOk) {
              throw new Error("BAD_REQUEST:Category does not belong to the selected branch.");
            }
          }

          const created = await tx.product.create({
            data: {
              branchId: bid,
              name,
              code,
              costPrice: unitPrice,
              sellingPrice: forSale ? sellingPrice : 0,
              quantity: 0,
              unit: unitStr,
              categoryId: categoryIdVal,
              forSale,
              internalPurpose: forSale ? null : purposeRaw,
            },
          });
          productId = created.id;
          const saleUnitsFromClient = (np as { saleUnits?: unknown }).saleUnits;
          if (Array.isArray(saleUnitsFromClient) && saleUnitsFromClient.length > 0) {
            const v = validateSaleUnitsPayload(saleUnitsFromClient as SaleUnitInput[]);
            if (!v.ok) {
              throw new Error(`BAD_REQUEST:${v.error}`);
            }
            await replaceProductSaleUnits(tx, created.id, v.rows);
          } else {
            const baseLabel =
              unitStr && unitStr !== "pcs" ? unitStr.slice(0, 191) : "Unit";
            await tx.productSaleUnit.create({
              data: {
                productId: created.id,
                unitKey: "base",
                label: baseLabel,
                baseUnitsEach: 1,
                sortOrder: 0,
              },
            });
          }
        } else {
          const pid = Number(it.productId);
          if (!Number.isInteger(pid) || pid <= 0) {
            throw new Error(
              "BAD_REQUEST:Each line needs an existing product or new product name and code."
            );
          }
          const exists = await tx.product.findFirst({ where: { id: pid } });
          if (!exists) {
            throw new Error(`BAD_REQUEST:Product not found (id ${pid}).`);
          }
          if (exists.branchId !== bid) {
            throw new Error(
              "BAD_REQUEST:An existing line item does not belong to the selected branch. Choose products from this branch’s inventory."
            );
          }
          productId = pid;
        }

        const existsProduct = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true },
        });
        if (!existsProduct) {
          throw new Error("BAD_REQUEST:Product not found.");
        }
        const su = await getSaleUnitForProduct(tx, productId, purchaseUnitKey);
        if (!su) {
          throw new Error(
            `BAD_REQUEST:Unknown purchase unit "${purchaseUnitKey}" for this product. Configure sale units on the product.`
          );
        }
        const baseUnits = lineQuantityToBaseUnits(quantity, su.baseUnitsEach);
        if (baseUnits <= 0) {
          throw new Error("BAD_REQUEST:Invalid quantity.");
        }

        let sellingPriceLine: number | undefined;
        if (!useNew) {
          const sp = (it as { sellingPrice?: unknown }).sellingPrice;
          if (sp != null && sp !== "") {
            const n = Number(sp);
            if (Number.isFinite(n) && n >= 0) sellingPriceLine = n;
          }
        }

        purchaseItems.push({
          productId,
          quantity,
          purchaseUnit: purchaseUnitKey,
          unitPrice,
          totalAmount: lineTotal,
          baseUnits,
          ...(sellingPriceLine !== undefined ? { sellingPriceLine } : {}),
        });
        totalAmount += lineTotal;
      }

      if (purchaseItems.length === 0) {
        throw new Error("BAD_REQUEST:No valid line items.");
      }

      const accountId = paymentMethod.accountId;
      const balance = await getFinanceAccountBalance(accountId);
      if (totalAmount > balance) {
        throw new Error(
          `BAD_REQUEST:Insufficient balance in ${paymentMethod.account.name}. Available: $${balance.toFixed(2)}; purchase total: $${totalAmount.toFixed(2)}`
        );
      }

      const purchase = await tx.purchase.create({
        data: {
          branchId: bid,
          supplierId: supplierIdVal,
          purchaseDate: purchaseDateVal,
          totalAmount,
          notes: notes ? String(notes).trim() : null,
          paymentMethodId: pmid,
          createdById: auth.userId,
          items: {
            create: purchaseItems.map((row) => ({
              productId: row.productId,
              quantity: row.quantity,
              purchaseUnit: row.purchaseUnit,
              unitPrice: row.unitPrice,
              totalAmount: row.totalAmount,
            })),
          },
        },
      });

      const ledgerNote =
        supplierIdVal != null
          ? `Pharmacy purchase #${purchase.id} (supplier)`
          : `Pharmacy purchase #${purchase.id} (no supplier)`;

      await tx.accountTransaction.create({
        data: {
          accountId,
          kind: "withdrawal",
          amount: totalAmount,
          description: ledgerNote,
          purchaseId: purchase.id,
          paymentMethodId: pmid,
          transactionDate: purchaseDateVal,
          createdById: auth.userId,
        },
      });

      for (const it of purchaseItems) {
        const prod = await tx.product.findUnique({
          where: { id: it.productId },
          select: { quantity: true, costPrice: true, sellingPrice: true, forSale: true },
        });
        if (!prod) {
          throw new Error("BAD_REQUEST:Product not found after purchase.");
        }
        const oldPcs = prod.quantity;
        const { baseUnits } = it;
        const lineCostTotal = it.quantity * it.unitPrice;
        const batchCostPerPcs = baseUnits > 0 ? lineCostTotal / baseUnits : 0;
        const denom = oldPcs + baseUnits;

        const newCost =
          denom > 0
            ? (oldPcs * prod.costPrice + baseUnits * batchCostPerPcs) / denom
            : batchCostPerPcs;

        let newSelling = prod.sellingPrice;
        if (prod.forSale && denom > 0) {
          const lineSell =
            it.sellingPriceLine !== undefined && it.sellingPriceLine !== null
              ? it.sellingPriceLine
              : prod.sellingPrice;
          newSelling = (oldPcs * prod.sellingPrice + baseUnits * lineSell) / denom;
        }

        await tx.product.update({
          where: { id: it.productId },
          data: {
            quantity: { increment: baseUnits },
            costPrice: roundMoney(newCost),
            sellingPrice: prod.forSale ? roundMoney(newSelling) : prod.sellingPrice,
          },
        });
      }

      return tx.purchase.findUniqueOrThrow({
        where: { id: purchase.id },
        include: {
          branch: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          paymentMethod: {
            include: {
              account: { select: { id: true, name: true, type: true } },
            },
          },
          ledgerTransaction: {
            select: {
              id: true,
              amount: true,
              kind: true,
              transactionDate: true,
            },
          },
          items: {
            include: {
              product: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "pharmacy.purchase.create",
      module: "pharmacy",
      resourceType: "Purchase",
      resourceId: result.id,
      metadata: { branchId: result.branchId },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "") }, { status: 400 });
    }
    console.error("Create purchase error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
