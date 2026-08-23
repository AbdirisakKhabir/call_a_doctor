"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import {
  BoltIcon,
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
import { SIDEBAR_LOGO_PATH } from "@/lib/brand-logos";
import { PP } from "@/lib/page-permissions";
import {
  ANALYTICS_OVERVIEW_PERMISSION,
  ANALYTICS_PARENT_PERMISSION_ANY,
  ANALYTICS_SECTIONS,
} from "@/lib/analytics/sections";

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
    permission: PP.dashboard,
  },
];

// Calendar (week view — add bookings from the calendar UI)
const appointmentsItems: NavItem[] = [
  {
    icon: <CalenderIcon />,
    name: "Calendar",
    path: "/appointments",
    permission: PP.appointments_calendar,
    subItems: [
      {
        name: "Calendar",
        path: "/appointments",
        permission: PP.appointments_calendar,
        exact: true,
      },
      {
        name: "Cancelled bookings",
        path: "/appointments/cancelled",
        permission: PP.appointments_cancelled,
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
    permissionAny: [PP.visit_cards_list, PP.visit_cards_new],
    subItems: [
      {
        name: "All visit cards",
        path: "/visit-cards",
        permission: PP.visit_cards_list,
      },
      { name: "New visit card", path: "/visit-cards/new", permission: PP.visit_cards_new },
    ],
  },
];

// Lab
const labItems: NavItem[] = [
  {
    icon: <DocsIcon />,
    name: "Laboratory",
    path: "/lab/orders",
    permissionAny: [
      PP.lab_orders,
      PP.lab_tests,
      PP.lab_subtests,
      PP.lab_categories,
      PP.lab_inventory,
      PP.lab_inventory_new,
      PP.reports_lab_consume,
    ],
    subItems: [
      { name: "Orders & results", path: "/lab/orders", permission: PP.lab_orders },
      { name: "Tests", path: "/lab/tests", permission: PP.lab_tests },
      { name: "Sub-tests", path: "/lab/tests/subtests", permission: PP.lab_subtests },
      { name: "Categories", path: "/lab/categories", permission: PP.lab_categories },
      { name: "Lab inventory", path: "/lab/inventory", permission: PP.lab_inventory, exact: true },
      {
        name: "New lab stock item",
        path: "/lab/inventory/new",
        permission: PP.lab_inventory_new,
      },
      { name: "Lab consume report", path: "/reports/lab-consume", permission: PP.reports_lab_consume },
    ],
  },
];

// Prescriptions
const prescriptionsItems: NavItem[] = [
  {
    icon: <ListIcon />,
    name: "Prescriptions",
    path: "/prescriptions",
    permission: PP.prescriptions,
  },
];

// Pharmacy — catalog & stock → retail → outreach
const pharmacyItems: NavItem[] = [
  {
    icon: <BoxCubeIcon />,
    name: "Pharmacy",
    path: "/pharmacy/inventory",
    permissionAny: [
      PP.pharmacy_inventory,
      PP.pharmacy_categories,
      PP.pharmacy_purchases,
      PP.pharmacy_suppliers,
      PP.pharmacy_opening_inventory,
      PP.pharmacy_unsellable_stock,
      PP.pharmacy_pos,
      PP.pharmacy_sale_returns,
      PP.pharmacy_sales,
      PP.pharmacy_outreach_teams,
      PP.pharmacy_outreach_returns,
      PP.pharmacy_outreach_dispense,
    ],
    subItems: [
      { name: "Inventory", path: "/pharmacy/inventory", permission: PP.pharmacy_inventory },
      { name: "Categories", path: "/pharmacy/categories", permission: PP.pharmacy_categories },
      { name: "Purchases", path: "/pharmacy/purchases", permission: PP.pharmacy_purchases },
      { name: "Suppliers", path: "/pharmacy/suppliers", permission: PP.pharmacy_suppliers },
      { name: "Opening inventory", path: "/pharmacy/opening-inventory", permission: PP.pharmacy_opening_inventory },
      { name: "Unsellable stock", path: "/pharmacy/unsellable-stock", permission: PP.pharmacy_unsellable_stock },
      { name: "POS", path: "/pharmacy/pos", permission: PP.pharmacy_pos },
      { name: "Sale returns", path: "/pharmacy/sale-returns", permission: PP.pharmacy_sale_returns },
      { name: "Sales list", path: "/pharmacy/sales", permission: PP.pharmacy_sales },
      { name: "Outreach teams", path: "/pharmacy/outreach/teams", permission: PP.pharmacy_outreach_teams },
      { name: "Outreach return", path: "/pharmacy/outreach/returns", permission: PP.pharmacy_outreach_returns },
      { name: "Emergency medication", path: "/pharmacy/outreach/dispense", permission: PP.pharmacy_outreach_dispense },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Clients",
    path: "/patients",
    permission: PP.patients,
  },
];

/** Reports → Analytics: chart-led reports with an AI written analysis. */
const analyticsItems: NavItem[] = [
  {
    icon: <BoltIcon />,
    name: "Analytics",
    path: "/analytics",
    permissionAny: [...ANALYTICS_PARENT_PERMISSION_ANY],
    subItems: [
      {
        name: "Overview",
        path: "/analytics",
        exact: true,
        permission: ANALYTICS_OVERVIEW_PERMISSION,
      },
      ...ANALYTICS_SECTIONS.map((section) => ({
        name: section.name,
        path: section.path,
        permission: section.permission,
      })),
    ],
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
      exact: e.exact,
    })),
  },
  {
    icon: <PieChartIcon />,
    name: "Pharmacy & stock",
    path: "/reports/sales",
    permissionAny: [
      PP.reports_sales,
      PP.reports_purchases,
      PP.reports_inventory,
      PP.reports_categories,
      PP.reports_suppliers,
      PP.reports_opening_inventory,
      PP.reports_lab_activity,
    ],
    subItems: [
      { name: "Sales report", path: "/reports/sales", permission: PP.reports_sales },
      { name: "Purchase report", path: "/reports/purchases", permission: PP.reports_purchases },
      { name: "Inventory report", path: "/reports/inventory", permission: PP.reports_inventory },
      { name: "Categories report", path: "/reports/categories", permission: PP.reports_categories },
      { name: "Suppliers report", path: "/reports/suppliers", permission: PP.reports_suppliers },
      { name: "Opening inventory report", path: "/reports/opening-inventory", permission: PP.reports_opening_inventory },
      { name: "Lab activity", path: "/reports/lab-activity", permission: PP.reports_lab_activity },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Clients & visits",
    path: "/reports/new-members",
    permissionAny: [
      PP.reports_new_members,
      PP.reports_outstanding_balances,
      PP.reports_calendar_visits,
      PP.reports_appointment_status,
      PP.reports_service_consume,
      PP.reports_form_submissions,
    ],
    subItems: [
      {
        name: "Client registration report",
        path: "/reports/new-members",
        permission: PP.reports_new_members,
      },
      {
        name: "Outstanding balances",
        path: "/reports/outstanding-balances",
        permission: PP.reports_outstanding_balances,
      },
      {
        name: "Calendar visits & services",
        path: "/reports/calendar-visits",
        permission: PP.reports_calendar_visits,
      },
      {
        name: "Appointment status",
        path: "/reports/appointment-status",
        permission: PP.reports_appointment_status,
      },
      {
        name: "Service consume report",
        path: "/reports/service-consume",
        permission: PP.reports_service_consume,
      },
      {
        name: "Form responses",
        path: "/reports/form-submissions",
        permission: PP.reports_form_submissions,
      },
    ],
  },
  {
    icon: <ListIcon />,
    name: "Activity log",
    path: "/reports/activity-log",
    permission: PP.reports_activity_log,
  },
];

const outreachReportsItems: NavItem[] = [
  {
    icon: <DocsIcon />,
    name: "Field outreach",
    path: "/reports/outreach",
    permission: PP.reports_outreach,
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
    permissionAny: [
      PP.accounting_overview,
      PP.accounting_accounts,
      PP.accounting_payment_methods,
      PP.accounting_transactions,
      PP.accounting_statement,
    ],
    subItems: [
      { name: "Overview", path: "/accounting", permission: PP.accounting_overview },
      { name: "Accounts", path: "/settings/accounts", permission: PP.accounting_accounts },
      { name: "Payment methods", path: "/settings/payment-methods", permission: PP.accounting_payment_methods },
      { name: "Deposits & withdrawals", path: "/settings/account-transactions", permission: PP.accounting_transactions },
      { name: "Account statement", path: "/settings/account-statement", permission: PP.accounting_statement },
    ],
  },
];

// Services: catalog (routes remain under /settings/services)
const servicesItems: NavItem[] = [
  {
    icon: <TaskIcon />,
    name: "Services",
    path: "/settings/services",
    permissionAny: [PP.services_list, PP.services_new, PP.services_categories],
    subItems: [
      { name: "All services", path: "/settings/services", permission: PP.services_list },
      { name: "Category list", path: "/settings/services/categories", permission: PP.services_categories },
      { name: "New service", path: "/settings/services/new", permission: PP.services_new },
    ],
  },
];

const hrItems: NavItem[] = [
  {
    icon: <GroupIcon />,
    name: "Human Resources",
    path: "/hr/staff",
    permissionAny: [PP.hr_staff, PP.hr_work_schedule, PP.hr_staff_new],
    subItems: [
      { name: "Staff list", path: "/hr/staff", permission: PP.hr_staff, exact: true },
      { name: "Work schedule report", path: "/reports/work-schedule", permission: PP.hr_work_schedule, exact: true },
      { name: "Register staff", path: "/hr/staff/new", permission: PP.hr_staff_new },
    ],
  },
];

const formsItems: NavItem[] = [
  {
    icon: <PageIcon />,
    name: "Custom forms",
    path: "/forms",
    permissionAny: [PP.forms_list, PP.forms_new],
    subItems: [
      { name: "All forms", path: "/forms", permission: PP.forms_list, exact: true },
      { name: "New form", path: "/forms/new", permission: PP.forms_new },
    ],
  },
];

/** Sidebar: finance operations + ledger & banking. */
const financeAndAccountingItems: NavItem[] = [...financialItems, ...accountingItems];

/** Sidebar: all analytics/reporting entries (one scroll group). */
const allReportsItems: NavItem[] = [...analyticsItems, ...reportsItems, ...outreachReportsItems];

/** Sidebar: visit services + intake forms (one scroll group). */
const clinicSetupItems: NavItem[] = [...servicesItems, ...formsItems];

// Settings: branches, doctors, system preferences (settings.* + appointments.* for clinic setup)
const settingsItems: NavItem[] = [
  {
    icon: <PlugInIcon />,
    name: "Settings",
    path: "/settings",
    permissionAny: [
      PP.settings_overview,
      PP.settings_branches,
      PP.settings_referral_sources,
      PP.settings_cities_villages,
      PP.settings_doctors,
      PP.settings_appointment_calendar,
      PP.settings_appointment_blocks,
      PP.settings_active_users,
      PP.settings_activity,
      PP.settings_trash,
      PP.settings_admin_activity,
    ],
    subItems: [
      { name: "Overview", path: "/settings", permission: PP.settings_overview, exact: true },
      { name: "Branches & access", path: "/settings/branches", permission: PP.settings_branches },
      { name: "Referred from", path: "/settings/referral-sources", permission: PP.settings_referral_sources },
      { name: "Cities & villages", path: "/settings/cities-villages", permission: PP.settings_cities_villages },
      { name: "Doctors", path: "/settings/doctors", permission: PP.settings_doctors },
      {
        name: "Calendar settings",
        path: "/settings/appointment-calendar",
        permission: PP.settings_appointment_calendar,
      },
      {
        name: "Holidays & blocked times",
        path: "/settings/appointment-blocks",
        permission: PP.settings_appointment_blocks,
      },
      { name: "Active users", path: "/settings/active-users", permission: PP.settings_active_users },
      { name: "Activity log", path: "/settings/activity", permission: PP.settings_activity },
      { name: "Recycle bin", path: "/settings/trash", permission: PP.settings_trash },
      {
        name: "Admin activity",
        path: "/settings/admin-activity",
        permission: PP.settings_admin_activity,
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
    permission: PP.users,
  },
  {
    icon: <LockIcon />,
    name: "Roles",
    path: "/roles",
    permission: PP.roles,
  },
  {
    icon: <ListIcon />,
    name: "Permissions",
    path: "/permissions",
    permission: PP.permissions,
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
                          ? "rotate-180 text-white"
                          : "text-brand-100"
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
      className={`no-print fixed mt-16 flex flex-col lg:mt-0 top-0 px-3 left-0 bg-brand-700 dark:bg-brand-800 text-white h-screen transition-all duration-300 ease-in-out z-50 border-r border-brand-800 dark:border-brand-900 
        ${isExpanded || isMobileOpen || isHovered ? "w-[260px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`shrink-0 py-4 flex ${!isExpanded && !isHovered && !isMobileOpen ? "lg:justify-center" : ""}`}>
        <Link href="/" className={`flex items-center justify-center overflow-hidden ${!isExpanded && !isHovered && !isMobileOpen ? "h-16 w-16" : "w-full min-w-0"}`}>
          <Image
            src={SIDEBAR_LOGO_PATH}
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
          <div className="flex flex-col [&>section+section]:mt-5 [&>section+section]:border-t [&>section+section]:border-white/15 [&>section+section]:pt-5">
            {mainNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Overview" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(mainNav, "main")}
              </section>
            )}

            {(appointmentsNav.length > 0 || visitCardsNav.length > 0) && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
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
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
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
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Pharmacy & clients" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(pharmacyNav, "pharmacy")}
              </section>
            )}

            {financeAccountingNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Finance & accounting" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(financeAccountingNav, "financeAccounting")}
              </section>
            )}

            {allReportsNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Reports" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(allReportsNav, "reports")}
              </section>
            )}

            {clinicSetupNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Clinic setup" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(clinicSetupNav, "clinicSetup")}
              </section>
            )}

            {hrNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "Human resources" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(hrNav, "hr")}
              </section>
            )}

            {settingsNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {isExpanded || isHovered || isMobileOpen ? "System" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(settingsNav, "settings")}
              </section>
            )}

            {activitiesNav.length > 0 && (
              <section>
                <h2
                  className={`mb-2 flex text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
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
