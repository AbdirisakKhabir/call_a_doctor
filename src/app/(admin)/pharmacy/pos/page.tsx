"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateOfBirthSplitFields from "@/components/form/DateOfBirthSplitFields";
import AgeReadonlyInput from "@/components/form/AgeReadonlyInput";
import ClientFormCard from "@/components/patients/ClientFormCard";
import ClientPhoneFields from "@/components/patients/ClientPhoneFields";
import { authFetch } from "@/lib/api";
import {
  DEFAULT_PHONE_COUNTRY_ISO2,
  formatInternationalPhoneForStorage,
  validateClientPhoneNational,
  validateOptionalClientPhoneNational,
} from "@/lib/phone-country";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { PlusIcon, TrashBinIcon } from "@/icons";
import Image from "next/image";
import ExpiryDateBadge from "@/components/pharmacy/ExpiryDateBadge";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-pagination";
import {
  PosBarcodeUrlHandler,
  PosBarcodeKeyboardCapture,
  type PosProductPayload,
} from "@/components/pharmacy/PosBarcodeBridge";
import SaleReceiptModal from "@/components/pharmacy/SaleReceiptModal";
import { printSaleReceipt, getReceiptLogoAbsoluteUrl } from "@/lib/print-sale-receipt";
type SaleUnitRow = { unitKey: string; label: string; baseUnitsEach: number };

type CartItem = {
  /** Stable key: `sale:<id>` when editing an existing line, else `product:<id>:<unitKey>`. */
  cartKey: string;
  productId: number;
  name: string;
  code: string;
  imageUrl: string | null;
  /** Price per selected sale unit (catalog base price × baseUnitsEach for that unit). */
  sellingPrice: number;
  quantity: number;
  totalAmount: number;
  saleUnitKey: string;
  saleUnitLabel: string;
  baseUnitsEach: number;
};

type Product = {
  id: number;
  name: string;
  code: string;
  imageUrl: string | null;
  sellingPrice: number;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  saleUnits?: SaleUnitRow[];
};

type Branch = { id: number; name: string };
type CityRow = { id: number; name: string };
type VillageRow = { id: number; name: string };

type LedgerPaymentMethod = {
  id: number;
  name: string;
  account: { id: number; name: string; type: string; code: string | null };
};

type SaleRow = {
  id: number;
  branchId: number | null;
  saleDate: string;
  totalAmount: number;
  discount: number;
  paymentMethod: string;
  customerType: string;
  kind?: string;
  outreachOnCredit?: boolean;
  notes: string | null;
  branch: { id: number; name: string } | null;
  patient: { id: number; patientCode: string; name: string } | null;
  outreachTeam?: { id: number; name: string; creditBalance: number } | null;
  depositTransaction?: { id: number } | null;
  createdBy?: { id: number; name: string | null } | null;
  /** Present on full sale fetch; omitted on paginated list API. */
  items?: {
    id: number;
    productId: number | null;
    quantity: number;
    saleUnit: string;
    unitPrice: number;
    totalAmount: number;
    product: {
      id: number;
      name: string;
      code: string;
      imageUrl: string | null;
      unit?: string;
      sellingPrice?: number;
      quantity?: number;
      saleUnits?: SaleUnitRow[];
    } | null;
    service?: { id: number; name: string } | null;
  }[];
};

function normalizePosUnitKey(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return "base";
  const s = String(raw).trim();
  if (s === "pcs") return "base";
  return s;
}

function defaultSaleUnit(p: Product): SaleUnitRow {
  const rows =
    p.saleUnits && p.saleUnits.length > 0
      ? p.saleUnits
      : [{ unitKey: "base", label: p.unit || "Unit", baseUnitsEach: 1 }];
  return rows.find((u) => u.unitKey === "base") ?? rows[0];
}

function getSaleUnitRow(p: Product, unitKey: string): SaleUnitRow {
  const k = normalizePosUnitKey(unitKey);
  const hit = p.saleUnits?.find((u) => u.unitKey === k);
  if (hit) return hit;
  return defaultSaleUnit(p);
}

/** Catalog `sellingPrice` is per base (smallest) unit; this is price per chosen sale unit. */
function unitSellingPrice(p: Product, unitKey: string): number {
  const u = getSaleUnitRow(p, unitKey);
  return p.sellingPrice * u.baseUnitsEach;
}

function POSPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handledPosQuery = useRef<string | null>(null);
  const { hasPermission } = useAuth();
  const { seesAllBranches, hasMultipleAssignedBranches } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<LedgerPaymentMethod[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [lastSale, setLastSale] = useState<{
    id: number;
    totalAmount: number;
    subtotal?: number;
    discount?: number;
    customerName?: string;
    items: { product: { name: string }; quantity: number; unitPrice: number; totalAmount: number }[];
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mainTab, setMainTab] = useState<"checkout" | "sales">("checkout");
  const [salesList, setSalesList] = useState<SaleRow[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesPage, setSalesPage] = useState(1);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState("");
  const [viewSaleId, setViewSaleId] = useState<number | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSaleId, setEditSaleId] = useState<number | null>(null);
  const [editCart, setEditCart] = useState<CartItem[]>([]);
  const [editReturnedQtyByProduct, setEditReturnedQtyByProduct] = useState<Record<number, number>>({});
  const [editDiscountValue, setEditDiscountValue] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editCustomerType, setEditCustomerType] = useState<"walking" | "patient">("walking");
  const [editSelectedPatient, setEditSelectedPatient] = useState<{ id: number; patientCode: string; name: string } | null>(null);
  const [editPatientSearch, setEditPatientSearch] = useState("");
  const [editPatientResults, setEditPatientResults] = useState<{ id: number; patientCode: string; name: string; phone: string | null }[]>([]);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editHasDeposit, setEditHasDeposit] = useState(false);
  const [editSearch, setEditSearch] = useState("");

  // Customer: walking | patient | outreach | lab (lab = transfer pharmacy stock into lab inventory; not a separate lab register)
  const [customerType, setCustomerType] = useState<"walking" | "patient" | "outreach" | "lab">("walking");
  const [selectedPatient, setSelectedPatient] = useState<{ id: number; patientCode: string; name: string } | null>(null);
  const [outreachTeams, setOutreachTeams] = useState<{ id: number; name: string; creditBalance: number }[]>([]);
  const [outreachTeamId, setOutreachTeamId] = useState("");
  const [outreachOnCredit, setOutreachOnCredit] = useState(true);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<{ id: number; patientCode: string; name: string; phone: string | null }[]>([]);
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [referralSourceOptions, setReferralSourceOptions] = useState<{ id: number; name: string }[]>([]);

  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [createPatientContext, setCreatePatientContext] = useState<"checkout" | "edit">("checkout");
  const [createPatientSubmitting, setCreatePatientSubmitting] = useState(false);
  const [createPatientError, setCreatePatientError] = useState("");
  const [cities, setCities] = useState<CityRow[]>([]);
  const [villages, setVillages] = useState<VillageRow[]>([]);
  const [createPatientForm, setCreatePatientForm] = useState({
    firstName: "",
    lastName: "",
    phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    phoneNational: "",
    mobileCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    mobileNational: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    referralSourceId: "",
    registeredBranchId: "",
    cityId: "",
    villageId: "",
  });

  function resetCreatePatientForm() {
    setCreatePatientForm({
      firstName: "",
      lastName: "",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneNational: "",
      mobileCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      mobileNational: "",
      email: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      referralSourceId: "",
      registeredBranchId: "",
      cityId: "",
      villageId: "",
    });
    setCreatePatientError("");
  }

  function openCreatePatientModal(ctx: "checkout" | "edit") {
    setCreatePatientContext(ctx);
    setCreatePatientError("");
    setCreatePatientForm({
      firstName: "",
      lastName: "",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneNational: "",
      mobileCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      mobileNational: "",
      email: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      referralSourceId: "",
      registeredBranchId: branchId || "",
      cityId: "",
      villageId: "",
    });
    setCreatePatientOpen(true);
  }

  function closeCreatePatientModal() {
    setCreatePatientOpen(false);
    resetCreatePatientForm();
  }

  async function handleCreatePatientSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreatePatientError("");
    if (!createPatientForm.firstName.trim() || !createPatientForm.lastName.trim()) {
      setCreatePatientError("First name and last name are required");
      return;
    }
    if (
      !createPatientForm.registeredBranchId ||
      !createPatientForm.cityId ||
      !createPatientForm.villageId
    ) {
      setCreatePatientError("Registration branch, city, and village are required");
      return;
    }
    const phoneErr = validateClientPhoneNational(
      createPatientForm.phoneCountryIso2,
      createPatientForm.phoneNational
    );
    if (phoneErr) {
      setCreatePatientError(phoneErr);
      return;
    }
    const mobileErr = validateOptionalClientPhoneNational(
      createPatientForm.mobileCountryIso2,
      createPatientForm.mobileNational
    );
    if (mobileErr) {
      setCreatePatientError(mobileErr);
      return;
    }
    setCreatePatientSubmitting(true);
    try {
      const res = await authFetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: createPatientForm.firstName.trim(),
          lastName: createPatientForm.lastName.trim(),
          phone: formatInternationalPhoneForStorage(
            createPatientForm.phoneCountryIso2,
            createPatientForm.phoneNational
          ),
          mobile: formatInternationalPhoneForStorage(
            createPatientForm.mobileCountryIso2,
            createPatientForm.mobileNational
          ),
          email: createPatientForm.email.trim() || null,
          dateOfBirth: createPatientForm.dateOfBirth.trim() || null,
          gender: createPatientForm.gender.trim() || null,
          address: createPatientForm.address.trim() || null,
          referralSourceId: createPatientForm.referralSourceId
            ? Number(createPatientForm.referralSourceId)
            : null,
          registeredBranchId: Number(createPatientForm.registeredBranchId),
          cityId: Number(createPatientForm.cityId),
          villageId: Number(createPatientForm.villageId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreatePatientError(data.error || "Failed to create client");
        return;
      }
      const next = {
        id: data.id as number,
        patientCode: data.patientCode as string,
        name: data.name as string,
      };
      if (createPatientContext === "edit") {
        setEditSelectedPatient(next);
        setEditPatientSearch("");
        setEditPatientOpen(false);
      } else {
        setSelectedPatient(next);
        setPatientSearch("");
        setPatientSearchOpen(false);
      }
      closeCreatePatientModal();
    } finally {
      setCreatePatientSubmitting(false);
    }
  }

  async function loadProducts() {
    if (!branchId) {
      setProducts([]);
      return;
    }
    const res = await authFetch(
      `/api/pharmacy/products/search?limit=100&branchId=${encodeURIComponent(branchId)}`
    );
    if (res.ok) setProducts(await res.json());
  }

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (res.ok) {
      const data: Branch[] = await res.json();
      setBranches(data);
      setBranchId((prev) => {
        if (prev && data.some((b) => String(b.id) === prev)) return prev;
        return data[0] ? String(data[0].id) : "";
      });
    }
  }

  async function loadPaymentMethods() {
    const res = await authFetch("/api/pharmacy/payment-methods");
    if (!res.ok) return;
    const data: LedgerPaymentMethod[] = await res.json();
    setPaymentMethods(data);
    setPaymentMethod((prev) => {
      if (prev && data.some((m) => m.name === prev)) return prev;
      return data[0]?.name ?? "";
    });
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadBranches(), loadPaymentMethods()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/referral-sources")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setReferralSourceOptions(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/cities")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setCities(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cid = createPatientForm.cityId ? Number(createPatientForm.cityId) : null;
    if (!cid || !Number.isInteger(cid)) {
      setVillages([]);
      return;
    }
    let cancelled = false;
    authFetch(`/api/villages?cityId=${cid}`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setVillages(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [createPatientForm.cityId]);

  useEffect(() => {
    if (branchId) loadProducts();
  }, [branchId]);

  async function loadOutreachTeams() {
    if (!branchId) {
      setOutreachTeams([]);
      return;
    }
    const res = await authFetch(
      `/api/outreach/teams?branchId=${encodeURIComponent(branchId)}&activeOnly=true`
    );
    if (res.ok) {
      const data = await res.json();
      setOutreachTeams(
        Array.isArray(data)
          ? data.map((t: { id: number; name: string; creditBalance: number }) => ({
              id: t.id,
              name: t.name,
              creditBalance: t.creditBalance,
            }))
          : []
      );
    }
  }

  useEffect(() => {
    loadOutreachTeams();
  }, [branchId]);

  // Client search debounce
  useEffect(() => {
    if (customerType !== "patient" || !patientSearch.trim()) {
      setPatientSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      authFetch(`/api/patients/search?q=${encodeURIComponent(patientSearch)}&limit=10`)
        .then((r) => r.ok && r.json())
        .then((data) => setPatientSearchResults(data || []))
        .catch(() => setPatientSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch, customerType]);

  useEffect(() => {
    if (!editOpen || editCustomerType !== "patient" || !editPatientSearch.trim()) {
      setEditPatientResults([]);
      return;
    }
    const t = setTimeout(() => {
      authFetch(`/api/patients/search?q=${encodeURIComponent(editPatientSearch)}&limit=10`)
        .then((r) => r.ok && r.json())
        .then((data) => setEditPatientResults(data || []))
        .catch(() => setEditPatientResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [editPatientSearch, editCustomerType, editOpen]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    setSalesError("");
    try {
      if (!branchId) {
        setSalesList([]);
        setSalesTotal(0);
        return;
      }
      setSalesList([]);
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const to = new Date();
      const params = new URLSearchParams({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        branchId,
        page: String(salesPage),
        pageSize: String(DEFAULT_LIST_PAGE_SIZE),
      });
      const res = await authFetch(`/api/pharmacy/sales?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setSalesError(data.error || "Failed to load sales");
        setSalesList([]);
        setSalesTotal(0);
        return;
      }
      if (data && typeof data === "object" && Array.isArray(data.data)) {
        setSalesList(data.data as SaleRow[]);
        setSalesTotal(typeof data.total === "number" ? data.total : data.data.length);
      } else if (Array.isArray(data)) {
        setSalesList(data);
        setSalesTotal(data.length);
      } else {
        setSalesList([]);
        setSalesTotal(0);
      }
    } finally {
      setSalesLoading(false);
    }
  }, [branchId, salesPage]);

  useEffect(() => {
    setSalesPage(1);
  }, [branchId]);

  useEffect(() => {
    if (mainTab !== "sales" || salesLoading || salesTotal <= 0) return;
    const maxPage = Math.max(1, Math.ceil(salesTotal / DEFAULT_LIST_PAGE_SIZE));
    if (salesPage > maxPage) {
      setSalesPage(maxPage);
    }
  }, [mainTab, salesLoading, salesTotal, salesPage]);

  useEffect(() => {
    if (mainTab === "sales") loadSales();
  }, [mainTab, loadSales]);

  async function openViewSale(saleId: number) {
    setViewSaleId(saleId);
  }

  function closeViewSale() {
    setViewSaleId(null);
  }

  const getEditMaxQty = useCallback(
    (productId: number, baseUnitsEach: number) => {
      const p = products.find((x) => x.id === productId);
      const base = (p?.quantity ?? 0) + (editReturnedQtyByProduct[productId] ?? 0);
      const each = Math.max(1, Math.floor(baseUnitsEach || 1));
      return Math.floor(base / each);
    },
    [products, editReturnedQtyByProduct]
  );

  const addToEditCart = useCallback(
    (p: Product) => {
      const su = defaultSaleUnit(p);
      const cartKey = `product:${p.id}:${su.unitKey}`;
      const max = getEditMaxQty(p.id, su.baseUnitsEach);
      if (max <= 0) return;
      setEditCart((prev) => {
        const existing = prev.find((c) => c.cartKey === cartKey);
        const price = unitSellingPrice(p, su.unitKey);
        const qty = (existing?.quantity || 0) + 1;
        if (qty > max) return prev;
        const totalAmount = qty * price;
        if (existing) {
          return prev.map((c) =>
            c.cartKey === cartKey ? { ...c, quantity: qty, sellingPrice: price, totalAmount } : c
          );
        }
        return [
          ...prev,
          {
            cartKey,
            productId: p.id,
            name: p.name,
            code: p.code,
            imageUrl: p.imageUrl,
            sellingPrice: price,
            quantity: 1,
            totalAmount: price,
            saleUnitKey: su.unitKey,
            saleUnitLabel: su.label,
            baseUnitsEach: su.baseUnitsEach,
          },
        ];
      });
    },
    [getEditMaxQty]
  );

  const updateEditCartQty = (cartKey: string, delta: number) => {
    setEditCart((prev) => {
      const item = prev.find((c) => c.cartKey === cartKey);
      if (!item) return prev;
      const max = getEditMaxQty(item.productId, item.baseUnitsEach);
      const newQty = Math.max(0, Math.min(max, item.quantity + delta));
      if (newQty === 0) return prev.filter((c) => c.cartKey !== cartKey);
      const totalAmount = newQty * item.sellingPrice;
      return prev.map((c) =>
        c.cartKey === cartKey ? { ...c, quantity: newQty, totalAmount } : c
      );
    });
  };

  const removeFromEditCart = (cartKey: string) => {
    setEditCart((prev) => prev.filter((c) => c.cartKey !== cartKey));
  };

  function closeEditModal() {
    setEditOpen(false);
    setEditSaleId(null);
    setEditCart([]);
    setEditReturnedQtyByProduct({});
    setEditDiscountValue("");
    setEditPaymentMethod("");
    setEditCustomerType("walking");
    setEditSelectedPatient(null);
    setEditPatientSearch("");
    setEditPatientOpen(false);
    setEditNotes("");
    setEditError("");
    setEditHasDeposit(false);
    setEditSearch("");
  }

  const canEditSale = hasPermission("pharmacy.edit") || hasPermission("pharmacy.pos");

  async function openEditSale(saleId: number) {
    setEditError("");
    setEditLoading(true);
    setEditHasDeposit(false);
    try {
      const res = await authFetch(`/api/pharmacy/sales/${saleId}`);
      const data = (await res.json()) as SaleRow & { error?: string; depositTransaction?: { id: number } | null };
      if (!res.ok) {
        setSalesError(data.error || "Could not load sale");
        return;
      }
      if (
        data.customerType === "outreach" ||
        (data as { outreachTeamId?: number | null }).outreachTeamId
      ) {
        setSalesError("Outreach sales cannot be edited here. Use outreach return if stock comes back to the pharmacy.");
        return;
      }
      if (data.kind === "appointment") {
        setSalesError(
          "Visit billing sales are managed from the appointment. They cannot be edited in POS."
        );
        return;
      }
      if (data.branchId != null) {
        setBranchId(String(data.branchId));
      }
      setEditOpen(true);
      if (data.depositTransaction) {
        setEditHasDeposit(true);
        setEditSaleId(data.id);
        setEditCart([]);
        return;
      }
      setEditSaleId(data.id);
      const saleItems = (data.items ?? []).filter(
        (
          it
        ): it is (NonNullable<SaleRow["items"]>[number] & {
          productId: number;
          product: NonNullable<NonNullable<SaleRow["items"]>[number]["product"]>;
        }) => it.product != null && it.productId != null
      );

      const returnedBase: Record<number, number> = {};
      for (const it of saleItems) {
        const fromList = products.find((pr) => pr.id === it.productId);
        const prProduct: Product = fromList ?? {
          id: it.product.id,
          name: it.product.name,
          code: it.product.code,
          imageUrl: it.product.imageUrl,
          sellingPrice: it.product.sellingPrice ?? 0,
          quantity: it.product.quantity ?? 0,
          unit: it.product.unit ?? "Unit",
          expiryDate: null,
          saleUnits: it.product.saleUnits,
        };
        const uk = normalizePosUnitKey(it.saleUnit);
        const each = getSaleUnitRow(prProduct, uk).baseUnitsEach;
        returnedBase[it.productId] = (returnedBase[it.productId] ?? 0) + it.quantity * each;
      }
      setEditReturnedQtyByProduct(returnedBase);

      const lines: CartItem[] = saleItems.map((it) => {
        const fromList = products.find((pr) => pr.id === it.productId);
        const prProduct: Product = fromList ?? {
          id: it.product.id,
          name: it.product.name,
          code: it.product.code,
          imageUrl: it.product.imageUrl,
          sellingPrice: it.product.sellingPrice ?? 0,
          quantity: it.product.quantity ?? 0,
          unit: it.product.unit ?? "Unit",
          expiryDate: null,
          saleUnits: it.product.saleUnits,
        };
        const uk = normalizePosUnitKey(it.saleUnit);
        const su = getSaleUnitRow(prProduct, uk);
        return {
          cartKey: `sale:${it.id}`,
          productId: it.productId,
          name: it.product.name,
          code: it.product.code,
          imageUrl: it.product.imageUrl,
          sellingPrice: it.unitPrice,
          quantity: it.quantity,
          totalAmount: it.totalAmount,
          saleUnitKey: su.unitKey,
          saleUnitLabel: su.label,
          baseUnitsEach: su.baseUnitsEach,
        };
      });
      setEditCart(lines);
      setEditDiscountValue(String(data.discount ?? 0));
      setEditPaymentMethod(data.paymentMethod || "cash");
      setEditCustomerType(data.customerType === "patient" && data.patient ? "patient" : "walking");
      setEditSelectedPatient(data.patient);
      setEditNotes(data.notes || "");
    } finally {
      setEditLoading(false);
    }
  }

  useEffect(() => {
    const v = searchParams.get("viewSale")?.trim();
    const e = searchParams.get("editSale")?.trim();
    const key = `${v ?? ""}|${e ?? ""}`;
    if (!v && !e) {
      handledPosQuery.current = null;
      return;
    }
    if (handledPosQuery.current === key) return;
    handledPosQuery.current = key;

    const sid = Number(v || e);
    if (!Number.isInteger(sid) || sid <= 0) return;

    const q = new URLSearchParams(searchParams.toString());
    q.delete("viewSale");
    q.delete("editSale");
    const nextPath = q.toString() ? `/pharmacy/pos?${q}` : "/pharmacy/pos";

    if (v) {
      void openViewSale(sid);
    } else if (e && (hasPermission("pharmacy.edit") || hasPermission("pharmacy.pos"))) {
      void openEditSale(sid);
    }
    router.replace(nextPath, { scroll: false });
  }, [searchParams, router, hasPermission]);

  const editSubtotal = editCart.reduce((s, c) => s + c.totalAmount, 0);
  const editDiscountAmount = Math.min(editSubtotal, Math.max(0, Number(editDiscountValue) || 0));
  const editTotal = Math.max(0, editSubtotal - editDiscountAmount);

  async function handleSaveEdit() {
    if (!editSaleId || editHasDeposit) return;
    if (editCart.length === 0) {
      setEditError("Add at least one line item");
      return;
    }
    if (!editPaymentMethod.trim()) {
      setEditError("Select a payment method.");
      return;
    }
    if (editCustomerType === "patient" && !editSelectedPatient) {
      setEditError("Select a client");
      return;
    }
    setEditError("");
    setEditSubmitting(true);
    try {
      const res = await authFetch(`/api/pharmacy/sales/${editSaleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: editCart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            unitPrice: c.sellingPrice,
            saleUnit: c.saleUnitKey,
          })),
          discount: editDiscountAmount,
          paymentMethod: editPaymentMethod,
          notes: editNotes.trim() || null,
          patientId: editCustomerType === "patient" && editSelectedPatient ? editSelectedPatient.id : null,
          customerType: editCustomerType === "patient" && editSelectedPatient ? "patient" : "walking",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Update failed");
        return;
      }
      closeEditModal();
      await loadProducts();
      if (mainTab === "sales") await loadSales();
    } finally {
      setEditSubmitting(false);
    }
  }

  const editFilteredProducts = editSearch.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(editSearch.toLowerCase()) ||
          p.code.toLowerCase().includes(editSearch.toLowerCase())
      )
    : products;

  const filteredProducts = search.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  const addToCart = useCallback((p: Product) => {
    const su = defaultSaleUnit(p);
    const cartKey = `product:${p.id}:${su.unitKey}`;
    const maxInUnit = Math.floor(p.quantity / su.baseUnitsEach);
    if (maxInUnit <= 0) return;
    const price = unitSellingPrice(p, su.unitKey);
    setCart((prev) => {
      const existing = prev.find((c) => c.cartKey === cartKey);
      const qty = (existing?.quantity || 0) + 1;
      if (qty > maxInUnit) return prev;
      const totalAmount = qty * price;
      if (existing) {
        return prev.map((c) =>
          c.cartKey === cartKey ? { ...c, quantity: qty, sellingPrice: price, totalAmount } : c
        );
      }
      return [
        ...prev,
        {
          cartKey,
          productId: p.id,
          name: p.name,
          code: p.code,
          imageUrl: p.imageUrl,
          sellingPrice: price,
          quantity: 1,
          totalAmount: price,
          saleUnitKey: su.unitKey,
          saleUnitLabel: su.label,
          baseUnitsEach: su.baseUnitsEach,
        },
      ];
    });
  }, []);

  const setCartSaleUnit = useCallback(
    (cartKey: string, newUnitKey: string) => {
      setCart((prev) => {
        const line = prev.find((c) => c.cartKey === cartKey);
        if (!line) return prev;
        const p = products.find((x) => x.id === line.productId);
        if (!p) return prev;
        const su = getSaleUnitRow(p, newUnitKey);
        const newKey = `product:${line.productId}:${su.unitKey}`;
        const price = unitSellingPrice(p, newUnitKey);
        const maxInUnit = Math.floor(p.quantity / su.baseUnitsEach);
        if (maxInUnit < 1) return prev.filter((c) => c.cartKey !== cartKey);
        const qty = Math.min(line.quantity, maxInUnit);
        const without = prev.filter((c) => c.cartKey !== cartKey);
        const dup = without.find((c) => c.cartKey === newKey);
        if (dup) {
          const sum = Math.min(dup.quantity + qty, maxInUnit);
          return without
            .filter((c) => c.cartKey !== newKey)
            .concat({
              ...dup,
              quantity: sum,
              sellingPrice: price,
              saleUnitKey: su.unitKey,
              saleUnitLabel: su.label,
              baseUnitsEach: su.baseUnitsEach,
              totalAmount: sum * price,
            });
        }
        return prev.map((c) =>
          c.cartKey === cartKey
            ? {
                ...c,
                cartKey: newKey,
                saleUnitKey: su.unitKey,
                saleUnitLabel: su.label,
                baseUnitsEach: su.baseUnitsEach,
                sellingPrice: price,
                quantity: qty,
                totalAmount: qty * price,
              }
            : c
        );
      });
    },
    [products]
  );

  const setEditCartSaleUnit = useCallback(
    (cartKey: string, newUnitKey: string) => {
      setEditCart((prev) => {
        const line = prev.find((c) => c.cartKey === cartKey);
        if (!line) return prev;
        const p = products.find((x) => x.id === line.productId);
        if (!p) return prev;
        const su = getSaleUnitRow(p, newUnitKey);
        const price = unitSellingPrice(p, newUnitKey);
        const maxQty = Math.floor(
          ((p.quantity ?? 0) + (editReturnedQtyByProduct[line.productId] ?? 0)) / su.baseUnitsEach
        );
        const qty = Math.min(line.quantity, Math.max(1, maxQty));
        if (maxQty < 1) return prev.filter((c) => c.cartKey !== cartKey);
        return prev.map((c) =>
          c.cartKey === cartKey
            ? {
                ...c,
                saleUnitKey: su.unitKey,
                saleUnitLabel: su.label,
                baseUnitsEach: su.baseUnitsEach,
                sellingPrice: price,
                quantity: qty,
                totalAmount: qty * price,
              }
            : c
        );
      });
    },
    [products, editReturnedQtyByProduct]
  );

  const applyBarcodeProduct = useCallback(
    (p: Product) => {
      setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
      const su = defaultSaleUnit(p);
      const maxInUnit = Math.floor(p.quantity / su.baseUnitsEach);
      if (maxInUnit <= 0) {
        setScanMessage("Out of stock for this barcode.");
        window.setTimeout(() => setScanMessage(""), 4000);
        return;
      }
      addToCart(p);
      setSearch("");
      setScanMessage(`Added: ${p.name}`);
      window.setTimeout(() => setScanMessage(""), 2500);
    },
    [addToCart]
  );

  const fetchAndApplyBarcode = useCallback(
    async (code: string) => {
      if (!branchId || !code.trim()) return;
      const res = await authFetch(
        `/api/pharmacy/products/by-barcode?branchId=${encodeURIComponent(branchId)}&code=${encodeURIComponent(code.trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        setScanMessage(data.error || "No product for this barcode.");
        window.setTimeout(() => setScanMessage(""), 4000);
        return;
      }
      applyBarcodeProduct(data as Product);
    },
    [branchId, applyBarcodeProduct]
  );

  const handleUrlBarcodeProduct = useCallback(
    (p: PosProductPayload) => {
      applyBarcodeProduct(p as Product);
    },
    [applyBarcodeProduct]
  );

  const handleProductSearchKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      const q = search.trim();
      if (!q || !branchId) return;
      const local = products.find((p) => p.code.trim().toLowerCase() === q.toLowerCase());
      if (local) {
        e.preventDefault();
        applyBarcodeProduct(local);
        return;
      }
      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.code.toLowerCase().includes(q.toLowerCase())
      );
      if (filtered.length === 1) {
        e.preventDefault();
        applyBarcodeProduct(filtered[0]);
        return;
      }
      e.preventDefault();
      await fetchAndApplyBarcode(q);
    },
    [search, branchId, products, applyBarcodeProduct, fetchAndApplyBarcode]
  );

  const updateCartQty = (cartKey: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((c) => c.cartKey === cartKey);
      if (!item) return prev;
      const product = products.find((p) => p.id === item.productId);
      if (!product) return prev;
      const maxInUnit = Math.floor(product.quantity / item.baseUnitsEach);
      const newQty = Math.max(0, Math.min(maxInUnit, item.quantity + delta));
      if (newQty === 0) return prev.filter((c) => c.cartKey !== cartKey);
      const totalAmount = newQty * item.sellingPrice;
      return prev.map((c) =>
        c.cartKey === cartKey ? { ...c, quantity: newQty, totalAmount } : c
      );
    });
  };

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => prev.filter((c) => c.cartKey !== cartKey));
  };

  const subtotal = cart.reduce((s, c) => s + c.totalAmount, 0);
  const rawVal = Number(discountValue);
  const discountAmount =
    discountType === "percent"
      ? Math.min(
          subtotal,
          Math.max(0, subtotal * (Math.min(100, Math.max(0, Number.isFinite(rawVal) ? rawVal : 0)) / 100))
        )
      : Math.min(subtotal, Math.max(0, Number.isFinite(rawVal) ? rawVal : 0));
  const total = Math.max(0, subtotal - discountAmount);

  const checkoutNeedsTillPayment =
    (customerType !== "outreach" || !outreachOnCredit) && !(customerType === "lab" && total <= 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setError("Cart is empty");
      return;
    }
    if (!branchId) {
      setError("Select a branch for this sale.");
      return;
    }
    if (customerType === "outreach") {
      const tid = Number(outreachTeamId);
      if (!Number.isInteger(tid) || tid <= 0) {
        setError("Select an outreach team.");
        return;
      }
    }
    if (customerType === "lab" && total > 0 && !paymentMethod.trim()) {
      setError("Select a payment method for this lab transfer, or use $0 lines / full discount for a no-charge transfer.");
      return;
    }
    if (checkoutNeedsTillPayment && !paymentMethod.trim()) {
      setError("Select a payment method. Add one under Settings → Payment methods if none are listed.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const selectedPm = paymentMethods.find((m) => m.name === paymentMethod);
      const baseBody: Record<string, unknown> = {
        branchId: Number(branchId),
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPrice: c.sellingPrice,
          saleUnit: c.saleUnitKey,
        })),
        discount: discountAmount,
      };
      if (customerType === "outreach") {
        baseBody.customerType = "outreach";
        baseBody.outreachTeamId = Number(outreachTeamId);
        baseBody.outreachOnCredit = outreachOnCredit;
        if (!outreachOnCredit && selectedPm) {
          baseBody.paymentMethod = paymentMethod;
          baseBody.paymentMethodId = selectedPm.id;
        }
      } else if (customerType === "lab") {
        baseBody.customerType = "lab";
        if (total > 0 && selectedPm) {
          baseBody.paymentMethod = paymentMethod;
          baseBody.paymentMethodId = selectedPm.id;
        }
      } else {
        baseBody.paymentMethod = paymentMethod;
        if (selectedPm) baseBody.paymentMethodId = selectedPm.id;
        baseBody.patientId = customerType === "patient" && selectedPatient ? selectedPatient.id : null;
        baseBody.customerType =
          customerType === "patient" && selectedPatient ? "patient" : "walking";
      }

      const res = await authFetch("/api/pharmacy/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sale failed");
        return;
      }
      const disc = Number(data.discount) || 0;
      let customerLabel = "Walking Customer";
      if (customerType === "patient" && selectedPatient) customerLabel = selectedPatient.name;
      else if (customerType === "lab") customerLabel = "Lab (stock to lab inventory)";
      else if (customerType === "outreach") {
        const team = outreachTeams.find((t) => t.id === Number(outreachTeamId));
        customerLabel = team ? `Outreach — ${team.name}` : "Outreach";
        if (outreachOnCredit) customerLabel += " (credit)";
      }
      setLastSale({
        id: data.id,
        totalAmount: data.totalAmount,
        subtotal: data.totalAmount + disc,
        discount: disc,
        customerName: customerLabel,
        items: data.items || cart.map((c) => ({ product: { name: c.name }, quantity: c.quantity, unitPrice: c.sellingPrice, totalAmount: c.totalAmount })),
      });
      setCart([]);
      setDiscountValue("");
      setDiscountType("amount");
      setCheckoutModal(false);
      setSelectedPatient(null);
      setCustomerType("walking");
      setOutreachTeamId("");
      setOutreachOnCredit(true);
      await loadProducts();
      await loadOutreachTeams();
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintReceipt = () => {
    if (!lastSale) return;
    const lines = lastSale.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalAmount: i.totalAmount,
    }));
    void printSaleReceipt({
      id: lastSale.id,
      saleDate: new Date().toISOString(),
      customerLabel: lastSale.customerName || "Walking Customer",
      lines,
      discount: lastSale.discount ?? 0,
      totalAmount: lastSale.totalAmount,
    });
  };

  if (!hasPermission("pharmacy.view") && !hasPermission("pharmacy.pos")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="POS" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (!loading && branches.length === 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Point of Sale" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No branch is available for your account. Ask an administrator to create a branch in Settings and assign you to it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col max-lg:overflow-y-auto lg:min-h-0 lg:h-[calc(100dvh-5.5rem)] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-hidden">
      <Suspense fallback={null}>
        <PosBarcodeUrlHandler
          branchId={branchId}
          mainTab={mainTab}
          checkoutModalOpen={checkoutModal}
          editOpen={editOpen}
          viewSaleOpen={viewSaleId != null}
          onProduct={handleUrlBarcodeProduct}
          onNotFound={() => {
            setScanMessage("Barcode not found for this branch.");
            window.setTimeout(() => setScanMessage(""), 4000);
          }}
        />
      </Suspense>
      <PosBarcodeKeyboardCapture
        enabled={mainTab === "checkout" && !checkoutModal && !editOpen && viewSaleId == null}
        onScan={fetchAndApplyBarcode}
      />
      <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Point of Sale" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Branch</span>
            {branches.length <= 1 ? (
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {branches[0]?.name ?? "—"}
              </span>
            ) : (
              <select
                id="pos-branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-10 min-w-[160px] rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                aria-label="Branch for this register"
              >
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            {branches.length > 1 && seesAllBranches ? (
              <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">
                Full access — pick register branch
              </span>
            ) : null}
            {branches.length > 1 && !seesAllBranches ? (
              <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">
                {hasMultipleAssignedBranches ? "Your assigned branches" : "Your branch"}
              </span>
            ) : null}
          </div>
          {mainTab === "checkout" && (
            <Button variant="outline" size="sm" onClick={() => (searchInputRef.current?.focus(), setSearch(""))}>
              Clear Search
            </Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMainTab("checkout")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mainTab === "checkout"
              ? "bg-brand-500 text-white dark:bg-brand-600"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          New sale
        </button>
        <button
          type="button"
          onClick={() => setMainTab("sales")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mainTab === "sales"
              ? "bg-brand-500 text-white dark:bg-brand-600"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          Sales list
        </button>
      </div>

      {mainTab === "checkout" ? (
      <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border border-gray-200 bg-white max-lg:overflow-visible lg:flex-row lg:gap-0 lg:min-h-0 lg:overflow-hidden dark:border-gray-800 dark:bg-white/3">
        {/* Products Grid — ring-inset on selected tiles so focus stays inside rounded panel */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden max-lg:min-h-[min(45dvh,420px)] lg:min-h-0">
          <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <input
              id="pos-product-search"
              ref={searchInputRef}
              type="text"
              placeholder="Search or scan barcode (USB scanner types here)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleProductSearchKeyDown}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-base outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              autoFocus
              autoComplete="off"
              aria-label="Product search and barcode scan"
            />
            {scanMessage ? (
              <p className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400" role="status">
                {scanMessage}
              </p>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex min-h-[min(50dvh,400px)] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex min-h-[min(50dvh,400px)] flex-col items-center justify-center text-gray-500">
                <p>No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pb-1 pt-1 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5 2xl:grid-cols-6">
                {filteredProducts.map((p) => {
                  const cartLines = cart.filter((c) => c.productId === p.id);
                  const baseInCart = cartLines.reduce((s, c) => s + c.quantity * c.baseUnitsEach, 0);
                  const inCart = cartLines.length > 0;
                  return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    disabled={p.quantity <= 0}
                    aria-pressed={inCart}
                    className={`relative flex flex-col items-stretch rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 ${
                      inCart
                        ? "border-2 border-brand-500 bg-brand-50 shadow-md ring-2 ring-inset ring-brand-400/40 dark:bg-brand-500/15 dark:ring-brand-400/30"
                        : "border-gray-200 hover:border-brand-400 dark:border-gray-700 dark:hover:border-brand-500"
                    }`}
                  >
                    {inCart && (
                      <span
                        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-md ring-2 ring-white dark:ring-gray-800"
                        title={`In cart (${baseInCart} base units)`}
                        aria-hidden
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                    <div className="mb-2 flex h-16 w-16 shrink-0 items-center justify-center self-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
                      {p.imageUrl ? (
                        <Image src={p.imageUrl} alt={p.name} width={64} height={64} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-gray-400">{p.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="line-clamp-2 break-words text-center text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
                        {p.name}
                      </p>
                      <span className="mt-0.5 block text-center text-xs text-gray-500">{p.code}</span>
                      <span className="mt-1 block text-center text-sm font-semibold text-brand-600">
                        ${p.sellingPrice.toFixed(2)}
                        <span className="block text-[10px] font-normal text-gray-500 dark:text-gray-400">
                          / {defaultSaleUnit(p).label}
                        </span>
                      </span>
                      <span className="mt-1 block text-center text-xs text-gray-400">
                        Stock: {p.quantity} base
                        {inCart ? (
                          <span className="ml-1 font-medium text-brand-600 dark:text-brand-400">
                            · In cart: {baseInCart} base
                          </span>
                        ) : null}
                      </span>
                      {p.expiryDate ? (
                        <span className="mt-1 flex w-full justify-center">
                          <ExpiryDateBadge expiryDate={p.expiryDate} />
                        </span>
                      ) : null}
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart — one scroll area (mobile + desktop) so you can scroll to totals & Checkout */}
        <div className="flex min-h-0 w-full min-w-0 flex-col border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50 max-lg:min-h-0 max-lg:flex-1 lg:h-full lg:w-72 lg:min-w-[18rem] lg:max-w-80 lg:shrink-0 lg:overflow-hidden lg:self-stretch lg:border-l lg:border-t-0 xl:w-80">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain max-lg:max-h-[min(72dvh,640px)] lg:min-h-0 lg:max-h-none">
          <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h3 className="font-semibold">Cart ({cart.length})</h3>
          </div>
          {/* Customer Selection */}
          <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Customer</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustomerType("walking");
                  setSelectedPatient(null);
                  setPatientSearch("");
                  setPatientSearchOpen(false);
                  setOutreachTeamId("");
                }}
                className={`min-w-[5rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  customerType === "walking"
                    ? "bg-brand-500 text-white dark:bg-brand-600"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Walking
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomerType("patient");
                  setPatientSearchOpen(true);
                  setOutreachTeamId("");
                }}
                className={`min-w-[5rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  customerType === "patient"
                    ? "bg-brand-500 text-white dark:bg-brand-600"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Client
              </button>
              <button
                type="button"
                title="Issue stock to outreach bag (credit or pay at counter)"
                onClick={() => {
                  setCustomerType("outreach");
                  setSelectedPatient(null);
                  setPatientSearch("");
                  setPatientSearchOpen(false);
                }}
                className={`min-w-[5rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  customerType === "outreach"
                    ? "bg-brand-500 text-white dark:bg-brand-600"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Outreach
              </button>
              <button
                type="button"
                title="Move pharmacy stock into lab inventory (for test consumables)"
                onClick={() => {
                  setCustomerType("lab");
                  setSelectedPatient(null);
                  setPatientSearch("");
                  setPatientSearchOpen(false);
                  setOutreachTeamId("");
                }}
                className={`min-w-[5rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  customerType === "lab"
                    ? "bg-brand-500 text-white dark:bg-brand-600"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Lab
              </button>
            </div>
            {customerType === "outreach" && (
              <div className="mt-2 space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Outreach team</label>
                <select
                  value={outreachTeamId}
                  onChange={(e) => setOutreachTeamId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">Select team…</option>
                  {outreachTeams.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name} — AR ${t.creditBalance.toFixed(2)}
                    </option>
                  ))}
                </select>
                {outreachTeams.length === 0 && branchId ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No active teams for this branch. Add teams under Pharmacy → Outreach teams.
                  </p>
                ) : null}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={outreachOnCredit}
                    onChange={(e) => setOutreachOnCredit(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span>Credit to team (no till deposit; increases team AR)</span>
                </label>
              </div>
            )}
            {customerType === "patient" && (
              <div className="mt-2 relative">
                {selectedPatient ? (
                  <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-brand-800 dark:bg-brand-500/10">
                    <span className="text-sm font-medium">{selectedPatient.name}</span>
                    <span className="text-xs text-gray-500">{selectedPatient.patientCode}</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedPatient(null); setPatientSearch(""); setPatientSearchOpen(true); }}
                      className="text-gray-400 hover:text-error-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Search client by name or code..."
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          setPatientSearchOpen(true);
                        }}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                      {hasPermission("patients.create") && (
                        <button
                          type="button"
                          onClick={() => openCreatePatientModal("checkout")}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
                        >
                          <PlusIcon className="h-3.5 w-3.5" aria-hidden />
                          New client
                        </button>
                      )}
                    </div>
                    {patientSearchOpen && (
                      <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        {patientSearchResults.length === 0 ? (
                          <div className="px-3 py-3 text-center text-sm text-gray-500">
                            <p>No clients found</p>
                            {hasPermission("patients.create") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPatientSearchOpen(false);
                                  openCreatePatientModal("checkout");
                                }}
                                className="mt-2 text-brand-600 font-medium hover:underline dark:text-brand-400"
                              >
                                Create new client
                              </button>
                            )}
                          </div>
                        ) : (
                          patientSearchResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedPatient(p);
                                setPatientSearch("");
                                setPatientSearchOpen(false);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <span>{p.name}</span>
                              <span className="text-xs text-gray-500">{p.patientCode}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Discount: above line items so the scroll area is only products */}
          <div className="shrink-0 border-b border-gray-200 bg-white/80 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Discount
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setDiscountType("amount")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    discountType === "amount"
                      ? "bg-brand-500 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  $
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("percent")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    discountType === "percent"
                      ? "bg-brand-500 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  %
                </button>
              </div>
              <input
                type="number"
                step={discountType === "percent" ? "0.1" : "0.01"}
                min="0"
                max={discountType === "percent" ? "100" : undefined}
                placeholder={discountType === "percent" ? "0" : "0.00"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </div>
            {discountType === "percent" && discountValue && Number(discountValue) > 100 && (
              <p className="mt-1 text-[11px] leading-tight text-amber-600 dark:text-amber-400">Capped at 100%</p>
            )}
          </div>

          <div className="min-w-0 shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
            {cart.length > 0 && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Items
              </p>
            )}
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">Cart is empty. Tap products to add.</p>
            ) : (
              <div className="space-y-2.5">
                {cart.map((c) => {
                  const p = products.find((x) => x.id === c.productId);
                  const unitOptions =
                    p?.saleUnits && p.saleUnits.length > 0
                      ? p.saleUnits
                      : [{ unitKey: c.saleUnitKey, label: c.saleUnitLabel, baseUnitsEach: c.baseUnitsEach }];
                  return (
                  <div
                    key={c.cartKey}
                    className="w-full min-w-0 rounded-lg border border-brand-200/80 bg-white p-2.5 shadow-sm dark:border-brand-500/25 dark:bg-gray-800"
                  >
                    <div className="flex min-w-0 gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
                        {c.imageUrl ? (
                          <Image src={c.imageUrl} alt={c.name} width={40} height={40} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-gray-400">{c.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">{c.name}</p>
                        {p && unitOptions.length > 1 ? (
                          <select
                            value={c.saleUnitKey}
                            onChange={(e) => setCartSaleUnit(c.cartKey, e.target.value)}
                            className="mt-1 max-w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                            aria-label="Sale unit"
                          >
                            {unitOptions.map((u) => (
                              <option key={u.unitKey} value={u.unitKey}>
                                {u.label} (×{u.baseUnitsEach} base)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{c.saleUnitLabel}</p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          ${c.sellingPrice.toFixed(2)} / {c.saleUnitLabel} × {c.quantity}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-gray-700">
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCartQty(c.cartKey, -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                        >
                          −
                        </button>
                        <span className="min-w-6 text-center text-sm font-medium">{c.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(c.cartKey, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold">${c.totalAmount.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(c.cartKey)}
                          className="rounded-lg p-1 text-gray-400 hover:bg-error-50 hover:text-error-500"
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );})}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-gray-200 bg-gray-50 p-4 pb-6 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.06)] dark:border-gray-800 dark:bg-gray-900/95 dark:shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.25)]">
            <div className="mb-2 flex justify-between text-sm">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>
                Discount applied
                {discountType === "percent" && discountValue
                  ? ` (${Math.min(100, Math.max(0, Number(discountValue) || 0)).toFixed(1)}%)`
                  : null}
              </span>
              <span>-${discountAmount.toFixed(2)}</span>
            </div>
            <div className="mb-4 flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <Button
              className="w-full"
              size="sm"
              disabled={
                cart.length === 0 ||
                (customerType === "outreach" &&
                  (!outreachTeamId || outreachTeams.length === 0)) ||
                (checkoutNeedsTillPayment && (paymentMethods.length === 0 || !paymentMethod.trim()))
              }
              onClick={() => setCheckoutModal(true)}
            >
              Checkout
            </Button>
          </div>
          </div>
        </div>
      </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sales for selected branch (last 90 days)
            </p>
            <Button variant="outline" size="sm" onClick={() => loadSales()} disabled={salesLoading}>
              {salesLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {salesError && (
              <div className="mb-3 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {salesError}
              </div>
            )}
            {salesLoading && salesList.length === 0 ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
              </div>
            ) : !salesLoading && salesTotal === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">No sales for this branch in the selected period.</p>
            ) : salesList.length === 0 ? (
              <>
                <p className="py-12 text-center text-sm text-gray-500">No rows on this page.</p>
                <ListPaginationFooter
                  loading={false}
                  total={salesTotal}
                  page={salesPage}
                  pageSize={DEFAULT_LIST_PAGE_SIZE}
                  noun="sales"
                  onPageChange={setSalesPage}
                />
              </>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="pb-2 pr-3 font-semibold text-gray-700 dark:text-gray-300">Date</th>
                        <th className="pb-2 pr-3 font-semibold text-gray-700 dark:text-gray-300">#</th>
                        <th className="pb-2 pr-3 font-semibold text-gray-700 dark:text-gray-300">Customer</th>
                        <th className="pb-2 pr-3 font-semibold text-gray-700 dark:text-gray-300">Total</th>
                        <th className="pb-2 pr-3 font-semibold text-gray-700 dark:text-gray-300">Payment</th>
                        <th className="pb-2 pr-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                        <th className="pb-2 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesList.map((s) => {
                        const hasDep = Boolean(s.depositTransaction?.id);
                        const cust =
                          s.customerType === "lab"
                            ? "Lab (to inventory)"
                            : s.customerType === "outreach" && s.outreachTeam
                              ? `Outreach: ${s.outreachTeam.name}`
                              : s.customerType === "patient" && s.patient
                                ? s.patient.name
                                : "Walking";
                        return (
                          <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-400">
                              {new Date(s.saleDate).toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-3 font-mono text-xs">{s.id}</td>
                            <td className="py-2.5 pr-3">{cust}</td>
                            <td className="py-2.5 pr-3 font-medium">${s.totalAmount.toFixed(2)}</td>
                            <td className="py-2.5 pr-3">{s.paymentMethod}</td>
                            <td className="py-2.5 pr-3">
                              {hasDep ? (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                                  Deposited
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500">—</span>
                              )}
                            </td>
                            <td className="py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => openViewSale(s.id)}>
                                  View
                                </Button>
                                {canEditSale ? (
                                  <Button size="sm" variant="outline" onClick={() => openEditSale(s.id)}>
                                    Edit
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ListPaginationFooter
                  loading={false}
                  total={salesTotal}
                  page={salesPage}
                  pageSize={DEFAULT_LIST_PAGE_SIZE}
                  noun="sales"
                  onPageChange={setSalesPage}
                />
              </>
            )}
          </div>
        </div>
      )}

      <SaleReceiptModal saleId={viewSaleId} open={viewSaleId != null} onClose={closeViewSale} />

      {/* Checkout Modal */}
      {checkoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Complete Sale</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
              <div className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">Customer</p>
                <p className="font-medium">
                  {customerType === "outreach"
                    ? outreachTeams.find((t) => t.id === Number(outreachTeamId))?.name
                      ? `Outreach — ${outreachTeams.find((t) => t.id === Number(outreachTeamId))!.name}`
                      : "Outreach"
                    : customerType === "lab"
                      ? "Lab — stock to lab inventory"
                      : customerType === "patient" && selectedPatient
                        ? selectedPatient.name
                        : "Walking Customer"}
                </p>
                {customerType === "outreach" && outreachOnCredit ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">On credit (no till deposit)</p>
                ) : null}
                {customerType === "lab" ? (
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    Pharmacy shelf ↓ · Lab inventory ↑ (same product codes)
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex justify-between text-gray-600 dark:text-gray-400">
                  <span>
                    Discount
                    {discountType === "percent" && discountValue
                      ? ` (${Math.min(100, Math.max(0, Number(discountValue) || 0)).toFixed(1)}%)`
                      : discountType === "amount" && discountValue
                        ? " ($)"
                        : null}
                  </span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              </div>
              {checkoutNeedsTillPayment ? (
                <div>
                  <label className="mb-1 block text-sm font-medium">Payment method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  >
                    {paymentMethods.length === 0 ? (
                      <option value="">No methods — add in Settings → Payment methods</option>
                    ) : null}
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} — {m.account.name}
                      </option>
                    ))}
                    {paymentMethod && !paymentMethods.some((m) => m.name === paymentMethod) ? (
                      <option value={paymentMethod}>{paymentMethod} (saved)</option>
                    ) : null}
                  </select>
                </div>
              ) : customerType === "outreach" ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Pharmacy shelf stock is reduced and added to the outreach team bag. Team accounts receivable increases; no cash register deposit for this sale.
                </p>
              ) : customerType === "lab" ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total is $0 — no till deposit. Pharmacy stock is reduced and lab inventory is increased for the same lines.
                </p>
              ) : null}
              <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
                <p className="text-2xl font-bold">Total: ${total.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <Button variant="outline" className="flex-1" onClick={() => setCheckoutModal(false)} size="sm">Cancel</Button>
              <Button
                className="flex-1"
                onClick={handleCheckout}
                disabled={
                  submitting ||
                  (checkoutNeedsTillPayment && (!paymentMethod.trim() || paymentMethods.length === 0))
                }
                size="sm"
              >
                {submitting ? "Processing..." : "Complete Sale"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {lastSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-green-600">Sale Complete!</h2>
            </div>
            <div className="space-y-3 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-white dark:border-gray-600 dark:bg-gray-800">
                  <img
                    src={getReceiptLogoAbsoluteUrl()}
                    alt="Call a Doctor"
                    width={48}
                    height={48}
                    className="h-full w-full object-contain p-0.5"
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.src.includes("/images/logo/logo.svg")) {
                        el.src = `${typeof window !== "undefined" ? window.location.origin : ""}/images/logo/logo.svg`;
                      }
                    }}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Call a Doctor</p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Pharmacy</p>
                </div>
              </div>
              <p className="text-sm">Receipt #{lastSale.id}</p>
              <p className="text-2xl font-bold">${lastSale.totalAmount.toFixed(2)}</p>
              <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
                {lastSale.items.map((i: { product: { name: string }; quantity: number; unitPrice: number; totalAmount: number }, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>{i.product.name} x{i.quantity}</span>
                    <span>${i.totalAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <Button variant="outline" className="flex-1" onClick={() => setLastSale(null)} size="sm">Close</Button>
              <Button className="flex-1" onClick={handlePrintReceipt} size="sm">Print Receipt</Button>
            </div>
          </div>
        </div>
      )}

      {createPatientOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-h-[min(90vh,720px)] max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-lg font-semibold">New client</h2>
              <button
                type="button"
                onClick={closeCreatePatientModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreatePatientSubmit} className="space-y-4 px-6 py-5">
              {createPatientError ? (
                <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {createPatientError}
                </div>
              ) : null}

              <ClientFormCard
                title="Registration branch"
                description="Defaults to this POS branch; change if the client registered elsewhere."
              >
                <div>
                  <Label>Branch *</Label>
                  <select
                    required
                    autoFocus
                    value={createPatientForm.registeredBranchId}
                    onChange={(e) =>
                      setCreatePatientForm((f) => ({ ...f, registeredBranchId: e.target.value }))
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </ClientFormCard>

              <ClientFormCard title="Personal information" description="Legal name, demographics, and date of birth.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>First name *</Label>
                    <input
                      required
                      value={createPatientForm.firstName}
                      onChange={(e) => setCreatePatientForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                      placeholder="First name"
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <Label>Last name *</Label>
                    <input
                      required
                      value={createPatientForm.lastName}
                      onChange={(e) => setCreatePatientForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                      placeholder="Last name"
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="space-y-5">
                  <DateOfBirthSplitFields
                    idPrefix="pos-new-patient-dob"
                    label="Date of birth"
                    value={createPatientForm.dateOfBirth}
                    onChange={(v) => setCreatePatientForm((f) => ({ ...f, dateOfBirth: v }))}
                  />
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-end sm:gap-x-8">
                    <AgeReadonlyInput dateOfBirth={createPatientForm.dateOfBirth} idSuffix="pos" />
                    <div>
                      <Label>Gender</Label>
                      <select
                        value={createPatientForm.gender}
                        onChange={(e) => setCreatePatientForm((f) => ({ ...f, gender: e.target.value }))}
                        className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                      >
                        <option value="">—</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>
                </div>
              </ClientFormCard>

              <ClientFormCard title="Address" description="City and village define locality; add street detail if needed.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>City *</Label>
                    <select
                      required
                      value={createPatientForm.cityId}
                      onChange={(e) =>
                        setCreatePatientForm((f) => ({
                          ...f,
                          cityId: e.target.value,
                          villageId: "",
                        }))
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                    >
                      <option value="">Select city</option>
                      {cities.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Village *</Label>
                    <select
                      required
                      value={createPatientForm.villageId}
                      onChange={(e) =>
                        setCreatePatientForm((f) => ({ ...f, villageId: e.target.value }))
                      }
                      disabled={!createPatientForm.cityId}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-50 dark:border-gray-700 dark:text-white"
                    >
                      <option value="">
                        {createPatientForm.cityId ? "Select village" : "Select city first"}
                      </option>
                      {villages.map((v) => (
                        <option key={v.id} value={String(v.id)}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Street / additional detail</Label>
                  <textarea
                    value={createPatientForm.address}
                    onChange={(e) => setCreatePatientForm((f) => ({ ...f, address: e.target.value }))}
                    rows={2}
                    className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                    placeholder="Optional"
                  />
                </div>
              </ClientFormCard>

              <ClientFormCard title="Contact details" description="How we reach the client.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ClientPhoneFields
                    label="Phone"
                    countryIso2={createPatientForm.phoneCountryIso2}
                    national={createPatientForm.phoneNational}
                    onCountryIso2Change={(phoneCountryIso2) =>
                      setCreatePatientForm((f) => ({ ...f, phoneCountryIso2 }))
                    }
                    onNationalChange={(phoneNational) =>
                      setCreatePatientForm((f) => ({ ...f, phoneNational }))
                    }
                    nationalInputId="pos-create-client-phone-national"
                  />
                  <div>
                    <Label>Email</Label>
                    <input
                      type="email"
                      value={createPatientForm.email}
                      onChange={(e) => setCreatePatientForm((f) => ({ ...f, email: e.target.value }))}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <ClientPhoneFields
                      label="Mobile (optional)"
                      optionalMobile
                      countryIso2={createPatientForm.mobileCountryIso2}
                      national={createPatientForm.mobileNational}
                      onCountryIso2Change={(mobileCountryIso2) =>
                        setCreatePatientForm((f) => ({ ...f, mobileCountryIso2 }))
                      }
                      onNationalChange={(mobileNational) =>
                        setCreatePatientForm((f) => ({ ...f, mobileNational }))
                      }
                      nationalInputId="pos-create-client-mobile-national"
                    />
                  </div>
                </div>
              </ClientFormCard>

              <ClientFormCard title="Referral" description="Optional — where the client heard about you.">
                <div>
                  <Label>Referred from</Label>
                  <select
                    value={createPatientForm.referralSourceId}
                    onChange={(e) => setCreatePatientForm((f) => ({ ...f, referralSourceId: e.target.value }))}
                    className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  >
                    <option value="">— Not specified —</option>
                    {referralSourceOptions.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </ClientFormCard>

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" size="sm" onClick={closeCreatePatientModal}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={createPatientSubmitting}>
                  {createPatientSubmitting ? "Saving…" : "Create & select"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h2 className="text-lg font-semibold">
                {editSaleId != null ? `Edit sale #${editSaleId}` : "Edit sale"}
              </h2>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {editLoading ? (
              <div className="flex flex-1 items-center justify-center py-24">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
              </div>
            ) : editHasDeposit ? (
              <div className="space-y-4 px-6 py-8">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  This sale has a finance deposit recorded. It cannot be edited from the POS. Contact an administrator if a correction is needed.
                </p>
                <Button variant="outline" onClick={closeEditModal} size="sm">
                  Close
                </Button>
              </div>
            ) : (
              <>
                {editError && (
                  <div className="mx-4 mt-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                    {editError}
                  </div>
                )}
                <div className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-gray-200 dark:border-gray-700 md:border-b-0 md:border-r">
                    <div className="shrink-0 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                      <input
                        type="text"
                        placeholder="Search products…"
                        value={editSearch}
                        onChange={(e) => setEditSearch(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="min-h-[200px] flex-1 overflow-y-auto p-3 md:min-h-[320px]">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {editFilteredProducts.map((p) => {
                          const defU = defaultSaleUnit(p);
                          const maxQ = getEditMaxQty(p.id, defU.baseUnitsEach);
                          const editBaseInCart = editCart
                            .filter((c) => c.productId === p.id)
                            .reduce((s, c) => s + c.quantity * c.baseUnitsEach, 0);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => addToEditCart(p)}
                              disabled={maxQ <= 0}
                              className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white p-2 text-left text-xs transition hover:shadow disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                            >
                              <span className="line-clamp-2 min-w-0 break-words font-medium">{p.name}</span>
                              <span className="text-[10px] text-gray-500">
                                ${p.sellingPrice.toFixed(2)}/{defU.label} · max {maxQ} {defU.label}
                              </span>
                              {editBaseInCart > 0 ? (
                                <span className="mt-1 text-[10px] font-medium text-brand-600">
                                  In cart: {editBaseInCart} base
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full min-h-0 flex-col md:w-88 md:shrink-0">
                    <div className="shrink-0 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Customer</p>
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditCustomerType("walking");
                            setEditSelectedPatient(null);
                            setEditPatientSearch("");
                            setEditPatientOpen(false);
                          }}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${
                            editCustomerType === "walking"
                              ? "bg-brand-500 text-white"
                              : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                          }`}
                        >
                          Walking
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditCustomerType("patient");
                            setEditPatientOpen(true);
                          }}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${
                            editCustomerType === "patient"
                              ? "bg-brand-500 text-white"
                              : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                          }`}
                        >
                          Client
                        </button>
                      </div>
                      {editCustomerType === "patient" && (
                        <div className="relative mt-2">
                          {editSelectedPatient ? (
                            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs dark:border-brand-800 dark:bg-brand-500/10">
                              <span className="font-medium">{editSelectedPatient.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditSelectedPatient(null);
                                  setEditPatientSearch("");
                                  setEditPatientOpen(true);
                                }}
                                className="text-gray-400 hover:text-error-500"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  placeholder="Search client…"
                                  value={editPatientSearch}
                                  onChange={(e) => {
                                    setEditPatientSearch(e.target.value);
                                    setEditPatientOpen(true);
                                  }}
                                  className="h-8 min-w-0 flex-1 rounded border border-gray-200 px-2 text-xs dark:border-gray-700 dark:bg-gray-800"
                                />
                                {hasPermission("patients.create") && (
                                  <button
                                    type="button"
                                    onClick={() => openCreatePatientModal("edit")}
                                    className="inline-flex shrink-0 items-center gap-0.5 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-500/15 dark:text-brand-300"
                                  >
                                    <PlusIcon className="h-3 w-3" aria-hidden />
                                    New
                                  </button>
                                )}
                              </div>
                              {editPatientOpen && (
                                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-32 overflow-y-auto rounded border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
                                  {editPatientResults.length === 0 ? (
                                    <div className="px-2 py-2 text-center text-xs text-gray-500">
                                      <p>No results</p>
                                      {hasPermission("patients.create") && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditPatientOpen(false);
                                            openCreatePatientModal("edit");
                                          }}
                                          className="mt-1 text-brand-600 font-medium hover:underline dark:text-brand-400"
                                        >
                                          Create client
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    editPatientResults.map((p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                          setEditSelectedPatient(p);
                                          setEditPatientSearch("");
                                          setEditPatientOpen(false);
                                        }}
                                        className="flex w-full justify-between px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                                      >
                                        <span>{p.name}</span>
                                        <span className="text-gray-500">{p.patientCode}</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Items</p>
                      {editCart.length === 0 ? (
                        <p className="text-sm text-gray-500">Add products from the left.</p>
                      ) : (
                        <div className="space-y-2">
                          {editCart.map((c) => {
                            const p = products.find((x) => x.id === c.productId);
                            const unitOptions =
                              p?.saleUnits && p.saleUnits.length > 0
                                ? p.saleUnits
                                : [{ unitKey: c.saleUnitKey, label: c.saleUnitLabel, baseUnitsEach: c.baseUnitsEach }];
                            return (
                            <div
                              key={c.cartKey}
                              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 gap-y-1 rounded-lg border border-gray-200 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-800"
                            >
                              <div className="min-w-0">
                                <p className="wrap-break-word font-medium leading-snug">{c.name}</p>
                                {p && unitOptions.length > 1 ? (
                                  <select
                                    value={c.saleUnitKey}
                                    onChange={(e) => setEditCartSaleUnit(c.cartKey, e.target.value)}
                                    className="mt-0.5 max-w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                                    aria-label="Sale unit"
                                  >
                                    {unitOptions.map((u) => (
                                      <option key={u.unitKey} value={u.unitKey}>
                                        {u.label} (×{u.baseUnitsEach} base)
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <p className="text-gray-500">{c.saleUnitLabel}</p>
                                )}
                                <p className="text-gray-500">
                                  ${c.sellingPrice.toFixed(2)} × {c.quantity}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateEditCartQty(c.cartKey, -1)}
                                  className="flex h-7 w-7 items-center justify-center rounded bg-gray-200 dark:bg-gray-700"
                                >
                                  −
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateEditCartQty(c.cartKey, 1)}
                                  className="flex h-7 w-7 items-center justify-center rounded bg-gray-200 dark:bg-gray-700"
                                >
                                  +
                                </button>
                              </div>
                              <span className="shrink-0 text-right font-semibold w-14">${c.totalAmount.toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => removeFromEditCart(c.cartKey)}
                                className="shrink-0 text-gray-400 hover:text-error-500"
                              >
                                <TrashBinIcon className="h-4 w-4" />
                              </button>
                            </div>
                          );})}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 space-y-2 border-t border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/50">
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Discount ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editDiscountValue}
                          onChange={(e) => setEditDiscountValue(e.target.value)}
                          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Payment
                        </label>
                        <select
                          value={editPaymentMethod}
                          onChange={(e) => setEditPaymentMethod(e.target.value)}
                          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        >
                          {paymentMethods.length === 0 ? (
                            <option value="">No methods — add in Settings</option>
                          ) : null}
                          {paymentMethods.map((m) => (
                            <option key={m.id} value={m.name}>
                              {m.name} — {m.account.name}
                            </option>
                          ))}
                          {editPaymentMethod &&
                          !paymentMethods.some((m) => m.name === editPaymentMethod) ? (
                            <option value={editPaymentMethod}>{editPaymentMethod} (saved)</option>
                          ) : null}
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Notes
                        </label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span>${editSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                        <span>Discount</span>
                        <span>-${editDiscountAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold">
                        <span>Total</span>
                        <span>${editTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" className="flex-1" size="sm" onClick={closeEditModal}>
                          Cancel
                        </Button>
                        <Button className="flex-1" size="sm" onClick={handleSaveEdit} disabled={editSubmitting}>
                          {editSubmitting ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      }
    >
      <POSPageInner />
    </Suspense>
  );
}
