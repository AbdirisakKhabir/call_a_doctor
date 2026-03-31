export type OutreachReportPayload = {
  dateFrom: string;
  dateTo: string;
  /** @deprecated API may omit when using from/to */
  month?: string;
  branchId: number;
  branch: {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
  include: string[];
  salesFromPharmacy: {
    id: number;
    saleDate: string;
    totalAmount: number;
    outreachOnCredit?: boolean;
    outreachTeam?: { id: number; name: string } | null;
    items: {
      quantity: number;
      totalAmount: number;
      product: { id: number; name: string; code: string };
    }[];
  }[];
  returnsToPharmacy: {
    id: number;
    returnDate: string;
    totalAmount: number;
    team: { id: number; name: string };
    items: {
      quantity: number;
      totalAmount: number;
      product: { id: number; name: string; code: string };
    }[];
  }[];
  dispensesToPatients: {
    id: number;
    createdAt: string;
    totalAmount: number;
    team: { id: number; name: string };
    patient: { id: number; patientCode: string; name: string };
    items: {
      quantity: number;
      totalAmount: number;
      product: { id: number; name: string; code: string };
    }[];
  }[];
  teamInventorySnapshot: {
    id: number;
    name: string;
    creditBalance: number;
    isActive: boolean;
    inventory: {
      productId: number;
      quantity: number;
      product: {
        id: number;
        name: string;
        code: string;
        sellingPrice: number;
        unit: string;
      };
    }[];
  }[];
};
