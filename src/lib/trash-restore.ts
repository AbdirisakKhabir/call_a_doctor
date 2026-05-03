import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

function d(v: unknown): Date | null | undefined {
  if (v == null || v === "") return v === "" ? null : (v as null | undefined);
  if (typeof v === "string") {
    const x = new Date(v);
    return Number.isNaN(x.getTime()) ? undefined : x;
  }
  return undefined;
}

export const RESTORABLE_ENTITY_TYPES = new Set([
  "Patient",
  "CustomForm",
  "StaffMember",
  "City",
  "Village",
  "ReferralSource",
  "Doctor",
  "Service",
  "Product",
  "Supplier",
  "Category",
  "Expense",
  "ExpenseCategory",
  "FinanceAccount",
  "LedgerPaymentMethod",
  "Role",
  "LabCategory",
  "User",
  "Branch",
]);

export function isTrashEntityRestorable(entityType: string): boolean {
  return RESTORABLE_ENTITY_TYPES.has(entityType);
}

/**
 * Recreate the main row from a trash snapshot. Call inside a transaction; caller deletes the TrashItem after success.
 */
export async function restoreFromTrashSnapshot(
  tx: Tx,
  entityType: string,
  snapshot: unknown
): Promise<{ id: number }> {
  const s = snapshot as Record<string, unknown>;

  switch (entityType) {
    case "Patient": {
      const row = await tx.patient.create({
        data: {
          patientCode: String(s.patientCode),
          firstName: String(s.firstName),
          lastName: String(s.lastName),
          phone: s.phone != null ? String(s.phone) : null,
          mobile: s.mobile != null ? String(s.mobile) : null,
          email: s.email != null ? String(s.email) : null,
          dateOfBirth: d(s.dateOfBirth) ?? null,
          age: typeof s.age === "number" ? s.age : null,
          gender: s.gender != null ? String(s.gender) : null,
          address: s.address != null ? String(s.address) : null,
          cityId: typeof s.cityId === "number" ? s.cityId : null,
          villageId: typeof s.villageId === "number" ? s.villageId : null,
          registeredBranchId: typeof s.registeredBranchId === "number" ? s.registeredBranchId : null,
          notes: s.notes != null ? String(s.notes) : null,
          referralSourceId: typeof s.referralSourceId === "number" ? s.referralSourceId : null,
          accountBalance: typeof s.accountBalance === "number" ? s.accountBalance : 0,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "CustomForm": {
      const fields = Array.isArray(s.fields) ? (s.fields as Record<string, unknown>[]) : [];
      const form = await tx.customForm.create({
        data: {
          title: String(s.title),
          description: s.description != null ? String(s.description) : null,
          isPublished: Boolean(s.isPublished ?? false),
          createdById: typeof s.createdById === "number" ? s.createdById : null,
        },
      });
      if (fields.length > 0) {
        await tx.customFormField.createMany({
          data: fields.map((f, i) => ({
            formId: form.id,
            sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : i,
            fieldType: String(f.fieldType),
            label: String(f.label),
            placeholder: f.placeholder != null ? String(f.placeholder) : null,
            helpText: f.helpText != null ? String(f.helpText) : null,
            required: Boolean(f.required),
            options: f.options ?? undefined,
          })),
        });
      }
      return { id: form.id };
    }

    case "StaffMember": {
      const row = await tx.staffMember.create({
        data: {
          name: String(s.name),
          phone: String(s.phone),
          address: String(s.address),
          title: String(s.title),
          cvUrl: s.cvUrl != null ? String(s.cvUrl) : null,
          cvPublicId: s.cvPublicId != null ? String(s.cvPublicId) : null,
          photoUrl: s.photoUrl != null ? String(s.photoUrl) : null,
          photoPublicId: s.photoPublicId != null ? String(s.photoPublicId) : null,
          hireDate: d(s.hireDate) ?? new Date(),
          workingDays: String(s.workingDays),
          workingHours: String(s.workingHours),
          salaryAmount: typeof s.salaryAmount === "number" ? s.salaryAmount : null,
          isActive: Boolean(s.isActive ?? true),
          createdById: typeof s.createdById === "number" ? s.createdById : null,
        },
      });
      return { id: row.id };
    }

    case "City": {
      const row = await tx.city.create({
        data: {
          name: String(s.name),
          sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : 0,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "Village": {
      const row = await tx.village.create({
        data: {
          cityId: Number(s.cityId),
          name: String(s.name),
          sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : 0,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "ReferralSource": {
      const row = await tx.referralSource.create({
        data: {
          name: String(s.name),
          sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : 0,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "Doctor": {
      const row = await tx.doctor.create({
        data: {
          name: String(s.name),
          email: s.email != null ? String(s.email) : null,
          phone: s.phone != null ? String(s.phone) : null,
          specialty: s.specialty != null ? String(s.specialty) : null,
          branchId: typeof s.branchId === "number" ? s.branchId : null,
          userId: typeof s.userId === "number" ? s.userId : null,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "Service": {
      const disposables = Array.isArray(s.disposables)
        ? (s.disposables as Record<string, unknown>[])
        : [];
      const row = await tx.service.create({
        data: {
          name: String(s.name),
          color: s.color != null ? String(s.color) : null,
          description: s.description != null ? String(s.description) : null,
          price: typeof s.price === "number" ? s.price : 0,
          durationMinutes: typeof s.durationMinutes === "number" ? s.durationMinutes : null,
          branchId: typeof s.branchId === "number" ? s.branchId : null,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      if (disposables.length > 0) {
        await tx.serviceDisposable.createMany({
          data: disposables.map((x) => ({
            serviceId: row.id,
            productCode: String(x.productCode),
            unitsPerService: typeof x.unitsPerService === "number" ? x.unitsPerService : 1,
            deductionUnitKey: String(x.deductionUnitKey ?? "base"),
          })),
        });
      }
      return { id: row.id };
    }

    case "Product": {
      const saleUnits = Array.isArray(s.saleUnits) ? (s.saleUnits as Record<string, unknown>[]) : [];
      const row = await tx.product.create({
        data: {
          branchId: Number(s.branchId),
          name: String(s.name),
          code: String(s.code),
          description: s.description != null ? String(s.description) : null,
          imageUrl: s.imageUrl != null ? String(s.imageUrl) : null,
          imagePublicId: s.imagePublicId != null ? String(s.imagePublicId) : null,
          costPrice: typeof s.costPrice === "number" ? s.costPrice : 0,
          sellingPrice: typeof s.sellingPrice === "number" ? s.sellingPrice : 0,
          quantity: typeof s.quantity === "number" ? s.quantity : 0,
          unsellableQuantity: typeof s.unsellableQuantity === "number" ? s.unsellableQuantity : 0,
          unit: String(s.unit ?? "pcs"),
          expiryDate: d(s.expiryDate) ?? null,
          forSale: Boolean(s.forSale ?? true),
          internalPurpose: s.internalPurpose != null ? String(s.internalPurpose) : null,
          categoryId: typeof s.categoryId === "number" ? s.categoryId : null,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      if (saleUnits.length > 0) {
        await tx.productSaleUnit.createMany({
          data: saleUnits.map((u, i) => ({
            productId: row.id,
            unitKey: String(u.unitKey),
            label: String(u.label),
            baseUnitsEach: Number(u.baseUnitsEach ?? 1),
            sortOrder: typeof u.sortOrder === "number" ? u.sortOrder : i,
          })),
        });
      }
      return { id: row.id };
    }

    case "Supplier": {
      const row = await tx.supplier.create({
        data: {
          branchId: Number(s.branchId),
          name: String(s.name),
          contactPerson: s.contactPerson != null ? String(s.contactPerson) : null,
          email: s.email != null ? String(s.email) : null,
          phone: s.phone != null ? String(s.phone) : null,
          address: s.address != null ? String(s.address) : null,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "Category": {
      const row = await tx.category.create({
        data: {
          branchId: Number(s.branchId),
          name: String(s.name),
          description: s.description != null ? String(s.description) : null,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "Expense": {
      const row = await tx.expense.create({
        data: {
          categoryId: Number(s.categoryId),
          amount: typeof s.amount === "number" ? s.amount : 0,
          expenseDate: d(s.expenseDate) ?? new Date(),
          description: s.description != null ? String(s.description) : null,
          createdById: typeof s.createdById === "number" ? s.createdById : null,
        },
      });
      return { id: row.id };
    }

    case "ExpenseCategory": {
      const row = await tx.expenseCategory.create({
        data: {
          name: String(s.name),
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "FinanceAccount": {
      const row = await tx.financeAccount.create({
        data: {
          name: String(s.name),
          code: s.code != null ? String(s.code) : null,
          type: String(s.type),
          openingBalance: typeof s.openingBalance === "number" ? s.openingBalance : 0,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "LedgerPaymentMethod": {
      const row = await tx.ledgerPaymentMethod.create({
        data: {
          name: String(s.name),
          accountId: Number(s.accountId),
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "Role": {
      const permIds = Array.isArray(s.permissionIds)
        ? (s.permissionIds as unknown[]).map((x) => Number(x)).filter((x) => Number.isInteger(x))
        : [];
      const role = await tx.role.create({
        data: {
          name: String(s.name),
          description: s.description != null ? String(s.description) : null,
        },
      });
      if (permIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
      return { id: role.id };
    }

    case "LabCategory": {
      const row = await tx.labCategory.create({
        data: {
          name: String(s.name),
          description: s.description != null ? String(s.description) : null,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "User": {
      const row = await tx.user.create({
        data: {
          email: String(s.email),
          password: String(s.password),
          name: s.name != null ? String(s.name) : null,
          roleId: Number(s.roleId),
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    case "Branch": {
      const row = await tx.branch.create({
        data: {
          name: String(s.name),
          address: s.address != null ? String(s.address) : null,
          phone: s.phone != null ? String(s.phone) : null,
          email: s.email != null ? String(s.email) : null,
          isActive: Boolean(s.isActive ?? true),
        },
      });
      return { id: row.id };
    }

    default:
      throw new Error(`unsupported_entity:${entityType}`);
  }
}
