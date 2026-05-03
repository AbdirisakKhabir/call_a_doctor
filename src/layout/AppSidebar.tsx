"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import {
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  DocsIcon,
  DollarLineIcon,
  GridIcon,
  GroupIcon,
  HorizontaLDots,
  ListIcon,
  LockIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  TaskIcon,
  UserCircleIcon,
} from "../icons/index";
import {
  FINANCE_FORMS_AND_LISTS_NAV,
  FINANCE_FORMS_PARENT_PERMISSION_ANY,
  FINANCIAL_REPORTS_NAV,
  FINANCIAL_REPORTS_PARENT_PERMISSION_ANY,
} from "@/lib/financial-hub-nav";

// --- Types ---

type SubItem = {
  name: string;
  path: string;
  pro?: boolean;
  new?: boolean;
  /** If true, only highlight when pathname equals `path` (not deeper routes). */
  exact?: boolean;
  permission?: string;
  /** If set, user needs at least one of these (overrides `permission`) */
  permissionAny?: string[];
};

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  /** If set, user must have this permission */
  permission?: string;
  /** If set, user must have at least one of these (takes precedence over `permission`) */
  permissionAny?: string[];
  subItems?: SubItem[];
};

type MenuCategory =
  | "main"
  | "appointments"
  | "visitCards"
  | "lab"
  | "prescriptions"
  | "pharmacy"
  | "financeAccounting"
  | "reports"
  | "clinicSetup"
  | "hr"
  | "settings"
  | "activities";

// --- Data Structures ---

// Main: Dashboard
const mainItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/",
    permission: "dashboard.view",
  },
];

// Calendar (week view — add bookings from the calendar UI)
const appointmentsItems: NavItem[] = [
  {
    icon: <CalenderIcon />,
    name: "Calendar",
    path: "/appointments",
    permission: "appointments.view",
    subItems: [
      {
        name: "Calendar",
        path: "/appointments",
        permission: "appointments.view",
        exact: true,
      },
      {
        name: "Cancelled bookings",
        path: "/appointments/cancelled",
        permission: "appointments.view",
        exact: true,
      },
    ],
  },
];

// Visit cards (reception queue — separate from appointment calendar)
const visitCardsItems: NavItem[] = [
  {
    icon: <TableIcon />,
    name: "Visit cards",
    path: "/visit-cards",
    permissionAny: ["visit_cards.view_all", "visit_cards.view_own", "visit_cards.create"],
    subItems: [
      {
        name: "All visit cards",
        path: "/visit-cards",
        permissionAny: ["visit_cards.view_all", "visit_cards.view_own", "visit_cards.create"],
      },
      { name: "New visit card", path: "/visit-cards/new", permission: "visit_cards.create" },
    ],
  },
];

// Lab
const labItems: NavItem[] = [
  {
    icon: <DocsIcon />,
    name: "Laboratory",
    path: "/lab/orders",
    permission: "lab.view",
    subItems: [
      { name: "Orders & results", path: "/lab/orders", permission: "lab.view" },
      { name: "Tests", path: "/lab/tests", permission: "lab.view" },
      { name: "Sub-tests", path: "/lab/tests/subtests", permission: "lab.view" },
      { name: "Categories", path: "/lab/categories", permission: "lab.view" },
      { name: "Lab inventory", path: "/lab/inventory", permission: "lab.view", exact: true },
      {
        name: "New lab stock item",
        path: "/lab/inventory/new",
        permissionAny: ["lab.create", "lab.edit"],
      },
      { name: "Lab consume report", path: "/reports/lab-consume", permission: "lab.view" },
    ],
  },
];

// Prescriptions
const prescriptionsItems: NavItem[] = [
  {
    icon: <ListIcon />,
    name: "Prescriptions",
    path: "/prescriptions",
    permission: "prescriptions.view",
  },
];

// Pharmacy — catalog & stock → retail → outreach
const pharmacyItems: NavItem[] = [
  {
    icon: <BoxCubeIcon />,
    name: "Pharmacy",
    path: "/pharmacy/inventory",
    permission: "pharmacy.view",
    subItems: [
      { name: "Inventory", path: "/pharmacy/inventory", permission: "pharmacy.view" },
      { name: "Categories", path: "/pharmacy/categories", permission: "pharmacy.view" },
      { name: "Purchases", path: "/pharmacy/purchases", permission: "pharmacy.view" },
      { name: "Suppliers", path: "/pharmacy/suppliers", permission: "pharmacy.view" },
      { name: "Opening inventory", path: "/pharmacy/opening-inventory", permission: "pharmacy.create" },
      { name: "Unsellable stock", path: "/pharmacy/unsellable-stock", permission: "pharmacy.view" },
      { name: "POS", path: "/pharmacy/pos", permission: "pharmacy.pos" },
      { name: "Sale returns", path: "/pharmacy/sale-returns", permission: "pharmacy.pos" },
      { name: "Sales list", path: "/pharmacy/sales", permission: "pharmacy.view" },
      { name: "Outreach teams", path: "/pharmacy/outreach/teams", permission: "pharmacy.view" },
      { name: "Outreach return", path: "/pharmacy/outreach/returns", permission: "pharmacy.pos" },
      { name: "Emergency medication", path: "/pharmacy/outreach/dispense", permission: "pharmacy.pos" },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Clients",
    path: "/patients",
    permission: "pharmacy.view",
  },
];

const reportsItems: NavItem[] = [
  {
    icon: <DollarLineIcon />,
    name: "Financial reports",
    path: "/financial-reports",
    permissionAny: [...FINANCIAL_REPORTS_PARENT_PERMISSION_ANY],
    subItems: FINANCIAL_REPORTS_NAV.map((e) => ({
      name: e.name,
      path: e.path,
      permission: e.permission,
      permissionAny: e.permissionAny,
      exact: e.exact,
    })),
  },
  {
    icon: <PieChartIcon />,
    name: "Pharmacy & stock",
    path: "/reports/sales",
    permission: "pharmacy.view",
    subItems: [
      { name: "Sales report", path: "/reports/sales", permission: "pharmacy.view" },
      { name: "Purchase report", path: "/reports/purchases", permission: "pharmacy.view" },
      { name: "Inventory report", path: "/reports/inventory", permission: "pharmacy.view" },
      { name: "Categories report", path: "/reports/categories", permission: "pharmacy.view" },
      { name: "Suppliers report", path: "/reports/suppliers", permission: "pharmacy.view" },
      { name: "Opening inventory report", path: "/reports/opening-inventory", permission: "pharmacy.view" },
      { name: "Lab activity", path: "/reports/lab-activity", permission: "lab.view" },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Clients & visits",
    path: "/reports/new-members",
    permissionAny: ["patients.view", "appointments.view"],
    subItems: [
      {
        name: "Client registration report",
        path: "/reports/new-members",
        permission: "patients.view",
      },
      {
        name: "Outstanding balances",
        path: "/reports/outstanding-balances",
        permissionAny: ["accounts.deposit", "pharmacy.pos", "patients.view"],
      },
      {
        name: "Calendar visits & services",
        path: "/reports/calendar-visits",
        permission: "appointments.view",
      },
      {
        name: "Service consume report",
        path: "/reports/service-consume",
        permission: "appointments.view",
      },
      {
        name: "Form responses",
        path: "/reports/form-submissions",
        permission: "forms.view",
      },
    ],
  },
];

const outreachReportsItems: NavItem[] = [
  {
    icon: <DocsIcon />,
    name: "Field outreach",
    path: "/reports/outreach",
    permission: "pharmacy.view",
  },
];

// Finance: invoices, payments, expense entry, transactional lists (not period reports)
const financialItems: NavItem[] = [
  {
    icon: <DollarLineIcon />,
    name: "Finance",
    path: "/expenses",
    permissionAny: [...FINANCE_FORMS_PARENT_PERMISSION_ANY],
    subItems: FINANCE_FORMS_AND_LISTS_NAV.map((e) => ({
      name: e.name,
      path: e.path,
      permission: e.permission,
      permissionAny: e.permissionAny,
      exact: e.exact,
    })),
  },
];

// Accounting: ledger accounts, payment methods, deposits, statements (accounts.* permissions)
const accountingItems: NavItem[] = [
  {
    icon: <TableIcon />,
    name: "Ledger & statements",
    path: "/accounting",
    subItems: [
      { name: "Overview", path: "/accounting", permission: "accounts.view" },
      { name: "Accounts", path: "/settings/accounts", permission: "accounts.view" },
      { name: "Payment methods", path: "/settings/payment-methods", permission: "accounts.view" },
      { name: "Deposits & withdrawals", path: "/settings/account-transactions", permission: "accounts.view" },
      { name: "Account statement", path: "/settings/account-statement", permission: "accounts.reports" },
    ],
  },
];

// Services: catalog (routes remain under /settings/services)
const servicesItems: NavItem[] = [
  {
    icon: <TaskIcon />,
    name: "Services",
    path: "/settings/services",
    permission: "appointments.view",
    subItems: [
      { name: "All services", path: "/settings/services", permission: "appointments.view" },
      { name: "New service", path: "/settings/services/new", permission: "appointments.view" },
    ],
  },
];

const hrItems: NavItem[] = [
  {
    icon: <GroupIcon />,
    name: "Human Resources",
    path: "/hr/staff",
    permission: "hr.view",
    subItems: [
      { name: "Staff list", path: "/hr/staff", permission: "hr.view", exact: true },
      { name: "Work schedule report", path: "/reports/work-schedule", permission: "hr.view", exact: true },
      { name: "Register staff", path: "/hr/staff/new", permission: "hr.create" },
    ],
  },
];

const formsItems: NavItem[] = [
  {
    icon: <PageIcon />,
    name: "Custom forms",
    path: "/forms",
    permission: "forms.view",
    subItems: [
      { name: "All forms", path: "/forms", permission: "forms.view", exact: true },
      { name: "New form", path: "/forms/new", permission: "forms.create" },
    ],
  },
];

/** Sidebar: finance operations + ledger & banking. */
const financeAndAccountingItems: NavItem[] = [...financialItems, ...accountingItems];

/** Sidebar: all analytics/reporting entries (one scroll group). */
const allReportsItems: NavItem[] = [...reportsItems, ...outreachReportsItems];

/** Sidebar: visit services + intake forms (one scroll group). */
const clinicSetupItems: NavItem[] = [...servicesItems, ...formsItems];

// Settings: branches, doctors, system preferences (settings.* + appointments.* for clinic setup)
const settingsItems: NavItem[] = [
  {
    icon: <PlugInIcon />,
    name: "Settings",
    path: "/settings",
    permissionAny: ["settings.view", "appointments.view", "audit.view", "audit.view_admins"],
    subItems: [
      { name: "Overview", path: "/settings", permission: "settings.view", exact: true },
      { name: "Branches & access", path: "/settings/branches", permission: "settings.manage" },
      { name: "Referred from", path: "/settings/referral-sources", permission: "settings.manage" },
      { name: "Cities & villages", path: "/settings/cities-villages", permission: "settings.manage" },
      { name: "Doctors", path: "/settings/doctors", permission: "appointments.view" },
      {
        name: "Calendar settings",
        path: "/settings/appointment-calendar",
        permissionAny: ["settings.manage", "appointments.view"],
      },
      {
        name: "Holidays & blocked times",
        path: "/settings/appointment-blocks",
        permission: "settings.manage",
      },
      { name: "Active users", path: "/settings/active-users", permissionAny: ["audit.view", "audit.view_admins"] },
      { name: "Activity log", path: "/settings/activity", permission: "audit.view" },
      { name: "Recycle bin", path: "/settings/trash", permission: "settings.manage" },
      {
        name: "Admin activity",
        path: "/settings/admin-activity",
        permissionAny: ["audit.view", "audit.view_admins"],
      },
    ],
  },
];

// Activities: Users, Roles, Permissions
const activitiesItems: NavItem[] = [
  {
    icon: <UserCircleIcon />,
    name: "Users",
    path: "/users",
    permission: "users.view",
  },
  {
    icon: <LockIcon />,
    name: "Roles",
    path: "/roles",
    permission: "roles.view",
  },
  {
    icon: <ListIcon />,
    name: "Permissions",
    path: "/permissions",
    permission: "permissions.view",
  },
];

// --- Helper Functions ---

function navItemAllowed<T extends { permission?: string; permissionAny?: string[] }>(
  item: T,
  hasPermission: (p: string) => boolean
): boolean {
  if (item.permissionAny?.length) {
    return item.permissionAny.some((p) => hasPermission(p));
  }
  return !item.permission || hasPermission(item.permission);
}

function filterByPermission<T extends { permission?: string; permissionAny?: string[]; subItems?: SubItem[] }>(
  items: T[],
  hasPermission: (p: string) => boolean
): T[] {
  return items
    .filter((item) => navItemAllowed(item, hasPermission))
    .map((item) => {
      if (!item.subItems) return item;
      const filteredSub = item.subItems.filter((s) => {
        if (s.permissionAny?.length) {
          return s.permissionAny.some((p) => hasPermission(p));
        }
        return !s.permission || hasPermission(s.permission);
      });
      return { ...item, subItems: filteredSub.length ? filteredSub : undefined };
    })
    .filter((item) => !item.subItems || (item.subItems && item.subItems.length > 0));
}

// --- Component ---

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { hasPermission } = useAuth();
  const pathname = usePathname();

  // Filtered menus (memoized to prevent useEffect infinite loop)
  const mainNav = useMemo(() => filterByPermission(mainItems, hasPermission), [hasPermission]);
  const pharmacyNav = useMemo(() => filterByPermission(pharmacyItems, hasPermission), [hasPermission]);
  const financeAccountingNav = useMemo(
    () => filterByPermission(financeAndAccountingItems, hasPermission),
    [hasPermission]
  );
  const allReportsNav = useMemo(() => filterByPermission(allReportsItems, hasPermission), [hasPermission]);
  const clinicSetupNav = useMemo(() => filterByPermission(clinicSetupItems, hasPermission), [hasPermission]);
  const appointmentsNav = useMemo(() => filterByPermission(appointmentsItems, hasPermission), [hasPermission]);
  const visitCardsNav = useMemo(() => filterByPermission(visitCardsItems, hasPermission), [hasPermission]);
  const labNav = useMemo(() => filterByPermission(labItems, hasPermission), [hasPermission]);
  const prescriptionsNav = useMemo(() => filterByPermission(prescriptionsItems, hasPermission), [hasPermission]);
  const hrNav = useMemo(() => filterByPermission(hrItems, hasPermission), [hasPermission]);
  const settingsNav = useMemo(() => filterByPermission(settingsItems, hasPermission), [hasPermission]);
  const activitiesNav = useMemo(() => filterByPermission(activitiesItems, hasPermission), [hasPermission]);

  // State
  const [openSubmenu, setOpenSubmenu] = useState<{
    type: MenuCategory;
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  }, [pathname]);

  const isSubItemActive = useCallback(
    (subItem: SubItem) => {
      const basePath = subItem.path.split("?")[0] ?? subItem.path;
      if (subItem.exact) return pathname === basePath;
      return pathname === basePath || pathname.startsWith(`${basePath}/`);
    },
    [pathname]
  );

  const handleSubmenuToggle = (index: number, menuType: MenuCategory) => {
    setOpenSubmenu((prev) => {
      if (prev?.type === menuType && prev?.index === index) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  // Effect: Auto-open submenu based on current path
  useEffect(() => {
    let submenuMatched = false;
    let matchedState: { type: MenuCategory; index: number } | null = null;
    const categories: MenuCategory[] = [
      "main",
      "appointments",
      "visitCards",
      "lab",
      "prescriptions",
      "pharmacy",
      "financeAccounting",
      "reports",
      "clinicSetup",
      "hr",
      "settings",
      "activities",
    ];

    categories.forEach((menuType) => {
      const items =
        menuType === "main"
          ? mainNav
          : menuType === "pharmacy"
            ? pharmacyNav
            : menuType === "reports"
              ? allReportsNav
              : menuType === "appointments"
                ? appointmentsNav
                : menuType === "visitCards"
                  ? visitCardsNav
                  : menuType === "lab"
                    ? labNav
                    : menuType === "prescriptions"
                      ? prescriptionsNav
                      : menuType === "financeAccounting"
                        ? financeAccountingNav
                        : menuType === "clinicSetup"
                          ? clinicSetupNav
                          : menuType === "hr"
                            ? hrNav
                            : menuType === "settings"
                              ? settingsNav
                              : activitiesNav;

      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isSubItemActive(subItem)) {
              matchedState = { type: menuType, index };
              submenuMatched = true;
            }
          });
        }
      });
    });

    setOpenSubmenu((prev) => {
      if (submenuMatched && matchedState) {
        if (prev?.type === matchedState.type && prev?.index === matchedState.index) return prev;
        return matchedState;
      }
      if (!submenuMatched && prev === null) return prev;
      return null;
    });
  }, [
    pathname,
    mainNav,
    pharmacyNav,
    financeAccountingNav,
    allReportsNav,
    clinicSetupNav,
    appointmentsNav,
    visitCardsNav,
    labNav,
    prescriptionsNav,
    hrNav,
    settingsNav,
    activitiesNav,
    isActive,
    isSubItemActive,
  ]);

  // Effect: Update height for transitions (measure after DOM update)
  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      const measure = () => {
        const el = subMenuRefs.current[key];
        if (el?.scrollHeight) {
          setSubMenuHeight((prev) => ({ ...prev, [key]: el.scrollHeight }));
        }
      };
      measure();
      requestAnimationFrame(measure);
    }
  }, [openSubmenu]);

  const renderMenuItems = (items: NavItem[], menuType: MenuCategory) => (
    <ul className="flex flex-col gap-1">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <>
              <button
                onClick={() => handleSubmenuToggle(index, menuType)}
                className={`menu-item group ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-active"
                    : "menu-item-inactive"
                } cursor-pointer ${
                  !isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"
                }`}
              >
                <span
                  className={`${
                    openSubmenu?.type === menuType && openSubmenu?.index === index
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <>
                    <span className="menu-item-text">{nav.name}</span>
                    <ChevronDownIcon
                      className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                        openSubmenu?.type === menuType && openSubmenu?.index === index
                          ? "rotate-180 text-brand-500"
                          : ""
                      }`}
                    />
                  </>
                )}
              </button>

              <div
                ref={(el) => {
                  subMenuRefs.current[`${menuType}-${index}`] = el;
                }}
                className="overflow-hidden transition-all duration-300"
                style={{
                  height:
                    openSubmenu?.type === menuType && openSubmenu?.index === index
                      ? (subMenuHeight[`${menuType}-${index}`] != null ? `${subMenuHeight[`${menuType}-${index}`]}px` : "auto")
                      : "0px",
                }}
              >
                <ul className="mt-1 space-y-0.5 ml-7">
                  {nav.subItems.map((subItem) => (
                    <li key={subItem.name}>
                      <Link
                        href={subItem.path}
                        className={`menu-dropdown-item ${
                          isSubItemActive(subItem)
                            ? "menu-dropdown-item-active"
                            : "menu-dropdown-item-inactive"
                        }`}
                      >
                        {subItem.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`no-print fixed mt-16 flex flex-col lg:mt-0 top-0 px-3 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${isExpanded || isMobileOpen || isHovered ? "w-[260px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`shrink-0 py-4 flex ${!isExpanded && !isHovered && !isMobileOpen ? "lg:justify-center" : ""}`}>
        <Link href="/" className={`flex items-center justify-center overflow-hidden ${!isExpanded && !isHovered && !isMobileOpen ? "h-16 w-16" : "w-full min-w-0"}`}>
          <Image
            src="/logo/call-a-doctor.png"
            alt="Call a Doctor"
            width={320}
            height={64}
            priority
            className={`object-contain h-16 ${!isExpanded && !isHovered && !isMobileOpen ? "w-16" : "w-full max-w-[300px]"}`}
          />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain duration-300 ease-linear custom-scrollbar pr-1">
        <nav className="mb-3">
          <div className="flex flex-col [&>section+section]:mt-5 [&>section+section]:border-t [&>section+section]:border-gray-100 [&>section+section]:pt-5 dark:[&>section+section]:border-gray-800/60">
            {mainNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Overview" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(mainNav, "main")}
              </section>
            )}

            {(appointmentsNav.length > 0 || visitCardsNav.length > 0) && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Scheduling & reception" : <HorizontaLDots />}
                </h2>
                {appointmentsNav.length > 0 && renderMenuItems(appointmentsNav, "appointments")}
                {visitCardsNav.length > 0 && (
                  <div className={appointmentsNav.length > 0 ? "mt-1" : ""}>
                    {renderMenuItems(visitCardsNav, "visitCards")}
                  </div>
                )}
              </section>
            )}

            {(labNav.length > 0 || prescriptionsNav.length > 0) && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Clinical" : <HorizontaLDots />}
                </h2>
                {labNav.length > 0 && renderMenuItems(labNav, "lab")}
                {prescriptionsNav.length > 0 && (
                  <div className={labNav.length > 0 ? "mt-1" : ""}>
                    {renderMenuItems(prescriptionsNav, "prescriptions")}
                  </div>
                )}
              </section>
            )}

            {pharmacyNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Pharmacy & clients" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(pharmacyNav, "pharmacy")}
              </section>
            )}

            {financeAccountingNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Finance & accounting" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(financeAccountingNav, "financeAccounting")}
              </section>
            )}

            {allReportsNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Reports" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(allReportsNav, "reports")}
              </section>
            )}

            {clinicSetupNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Clinic setup" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(clinicSetupNav, "clinicSetup")}
              </section>
            )}

            {hrNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Human resources" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(hrNav, "hr")}
              </section>
            )}

            {settingsNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "System" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(settingsNav, "settings")}
              </section>
            )}

            {activitiesNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Access control" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(activitiesNav, "activities")}
              </section>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
