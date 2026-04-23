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
  HorizontaLDots,
  ListIcon,
  LockIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  TaskIcon,
  UserCircleIcon,
} from "../icons/index";

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
  | "pharmacy"
  | "reports"
  | "outreachReports"
  | "appointments"
  | "visitCards"
  | "lab"
  | "prescriptions"
  | "financial"
  | "accounting"
  | "services"
  | "forms"
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

// Calendar (week schedule + new booking — visit cards are a separate menu)
const appointmentsItems: NavItem[] = [
  {
    icon: <CalenderIcon />,
    name: "Calendar",
    path: "/appointments",
    permission: "appointments.view",
    subItems: [
      { name: "Schedule", path: "/appointments", permission: "appointments.view", exact: true },
      { name: "New booking", path: "/appointments/new", permission: "appointments.view" },
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
      { name: "Categories", path: "/lab/categories", permission: "lab.view" },
      { name: "Tests", path: "/lab/tests", permission: "lab.view" },
      { name: "Orders & Results", path: "/lab/orders", permission: "lab.view" },
      { name: "Lab inventory", path: "/lab/inventory", permission: "lab.view", exact: true },
      {
        name: "New lab stock item",
        path: "/lab/inventory/new",
        permissionAny: ["lab.create", "lab.edit"],
      },
    ],
  },
];

// Prescriptions
const prescriptionsItems: NavItem[] = [
  {
    icon: <ListIcon />,
    name: "Prescriptions & meds",
    path: "/prescriptions",
    permission: "prescriptions.view",
  },
];

// Pharmacy — stock & catalog → retail & billing → outreach field ops
const pharmacyItems: NavItem[] = [
  {
    icon: <BoxCubeIcon />,
    name: "Pharmacy",
    path: "/pharmacy/inventory",
    permission: "pharmacy.view",
    subItems: [
      { name: "Inventory", path: "/pharmacy/inventory", permission: "pharmacy.view" },
      { name: "Unsellable stock", path: "/pharmacy/unsellable-stock", permission: "pharmacy.view" },
      { name: "Opening inventory", path: "/pharmacy/opening-inventory", permission: "pharmacy.create" },
      { name: "Categories", path: "/pharmacy/categories", permission: "pharmacy.view" },
      { name: "Purchases", path: "/pharmacy/purchases", permission: "pharmacy.view" },
      { name: "Suppliers", path: "/pharmacy/suppliers", permission: "pharmacy.view" },
      { name: "POS", path: "/pharmacy/pos", permission: "pharmacy.pos" },
      { name: "Client invoice", path: "/pharmacy/patient-invoice", permission: "prescriptions.view" },
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
  {
    icon: <DollarLineIcon />,
    name: "Payments",
    path: "/payments",
    permissionAny: ["accounts.deposit", "pharmacy.pos"],
    subItems: [
      {
        name: "Client balances",
        path: "/payments",
        permissionAny: ["accounts.deposit", "pharmacy.pos"],
        exact: true,
      },
      {
        name: "Record payment",
        path: "/payments/new",
        permissionAny: ["accounts.deposit", "pharmacy.pos"],
      },
    ],
  },
];

const reportsItems: NavItem[] = [
  {
    icon: <PieChartIcon />,
    name: "Pharmacy reports",
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
    name: "Client reports",
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
    name: "Outreach reports",
    path: "/reports/outreach",
    permission: "pharmacy.view",
  },
];

// Financial
const financialItems: NavItem[] = [
  {
    icon: <DollarLineIcon />,
    name: "Finance",
    path: "/expenses",
    permission: "expenses.view",
    subItems: [
      { name: "Expenses", path: "/expenses", permission: "expenses.view" },
      { name: "Financial Reports", path: "/financial-reports", permission: "financial.view" },
    ],
  },
];

// Accounting: ledger accounts, payment methods, deposits, statements (accounts.* permissions)
const accountingItems: NavItem[] = [
  {
    icon: <TableIcon />,
    name: "Accounting",
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

const formsItems: NavItem[] = [
  {
    icon: <DocsIcon />,
    name: "Forms",
    path: "/forms",
    permission: "forms.view",
    subItems: [
      { name: "All forms", path: "/forms", permission: "forms.view", exact: true },
      { name: "New form", path: "/forms/new", permission: "forms.create" },
    ],
  },
];

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
      { name: "Activity log", path: "/settings/activity", permission: "audit.view" },
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
  const reportsNav = useMemo(() => filterByPermission(reportsItems, hasPermission), [hasPermission]);
  const outreachReportsNav = useMemo(
    () => filterByPermission(outreachReportsItems, hasPermission),
    [hasPermission]
  );
  const appointmentsNav = useMemo(() => filterByPermission(appointmentsItems, hasPermission), [hasPermission]);
  const visitCardsNav = useMemo(() => filterByPermission(visitCardsItems, hasPermission), [hasPermission]);
  const labNav = useMemo(() => filterByPermission(labItems, hasPermission), [hasPermission]);
  const prescriptionsNav = useMemo(() => filterByPermission(prescriptionsItems, hasPermission), [hasPermission]);
  const financialNav = useMemo(() => filterByPermission(financialItems, hasPermission), [hasPermission]);
  const accountingNav = useMemo(() => filterByPermission(accountingItems, hasPermission), [hasPermission]);
  const servicesNav = useMemo(() => filterByPermission(servicesItems, hasPermission), [hasPermission]);
  const formsNav = useMemo(() => filterByPermission(formsItems, hasPermission), [hasPermission]);
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
      if (subItem.exact) return pathname === subItem.path;
      return isActive(subItem.path);
    },
    [pathname, isActive]
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
      "reports",
      "outreachReports",
      "financial",
      "accounting",
      "services",
      "forms",
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
              ? reportsNav
              : menuType === "outreachReports"
                ? outreachReportsNav
                : menuType === "appointments"
                  ? appointmentsNav
                  : menuType === "visitCards"
                    ? visitCardsNav
                    : menuType === "lab"
                      ? labNav
                      : menuType === "prescriptions"
                        ? prescriptionsNav
                        : menuType === "financial"
                          ? financialNav
                          : menuType === "accounting"
                            ? accountingNav
                            : menuType === "services"
                              ? servicesNav
                              : menuType === "forms"
                                ? formsNav
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
    reportsNav,
    outreachReportsNav,
    appointmentsNav,
    visitCardsNav,
    labNav,
    prescriptionsNav,
    financialNav,
    accountingNav,
    servicesNav,
    formsNav,
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
        <Link href="/" className={`flex items-center justify-center overflow-hidden ${!isExpanded && !isHovered && !isMobileOpen ? "w-16 h-12" : "w-full min-w-0"}`}>
          <Image
            src="/logo/call-a-doctor.png"
            alt="Call a Doctor"
            width={280}
            height={48}
            priority
            className={`object-contain h-12 ${!isExpanded && !isHovered && !isMobileOpen ? "w-16" : "w-full max-w-[280px]"}`}
          />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain duration-300 ease-linear custom-scrollbar pr-1">
        <nav className="mb-3">
          <div className="flex flex-col [&>div+div]:mt-3 [&>div+div]:border-t [&>div+div]:border-gray-100 [&>div+div]:pt-3 dark:[&>div+div]:border-gray-800/60">
            {mainNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Main" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(mainNav, "main")}
              </div>
            )}

            {appointmentsNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Calendar" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(appointmentsNav, "appointments")}
              </div>
            )}

            {visitCardsNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Visit cards" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(visitCardsNav, "visitCards")}
              </div>
            )}

            {labNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Laboratory" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(labNav, "lab")}
              </div>
            )}

            {prescriptionsNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Prescriptions & meds" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(prescriptionsNav, "prescriptions")}
              </div>
            )}

            {pharmacyNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Pharmacy" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(pharmacyNav, "pharmacy")}
              </div>
            )}

            {reportsNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Pharmacy reports" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(reportsNav, "reports")}
              </div>
            )}

            {outreachReportsNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Outreach" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(outreachReportsNav, "outreachReports")}
              </div>
            )}

            {financialNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Finance" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(financialNav, "financial")}
              </div>
            )}

            {accountingNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Accounting" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(accountingNav, "accounting")}
              </div>
            )}

            {servicesNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Services" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(servicesNav, "services")}
              </div>
            )}

            {formsNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Forms" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(formsNav, "forms")}
              </div>
            )}

            {settingsNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Settings" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(settingsNav, "settings")}
              </div>
            )}

            {activitiesNav.length > 0 && (
              <div>
                <h2
                  className={`mb-1.5 flex text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Administration" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(activitiesNav, "activities")}
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
