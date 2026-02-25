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
  DollarLineIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  LockIcon,
  PageIcon,
  PieChartIcon,
  TableIcon,
  TimeIcon,
  UserCircleIcon,
} from "../icons/index";

// --- Types ---

type SubItem = {
  name: string;
  path: string;
  pro?: boolean;
  new?: boolean;
  permission?: string;
};

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  permission?: string;
  subItems?: SubItem[];
};

type MenuCategory = "academics" | "reports" | "activities";

// --- Data Structures ---

// Academics (top): Dashboard, Faculties, Departments, Courses, Classes, Admission, Attendance, Examinations
const academicsItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/",
    permission: "dashboard.view",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Faculties",
    path: "/faculties",
    permission: "faculties.view",
  },
  {
    icon: <TableIcon />,
    name: "Departments",
    path: "/departments",
    permission: "departments.view",
  },
  {
    icon: <ListIcon />,
    name: "Courses",
    path: "/courses",
    permission: "courses.view",
  },
  {
    icon: <TimeIcon />,
    name: "Semesters",
    path: "/semesters",
    permission: "semesters.view",
  },
  {
    icon: <CalenderIcon />,
    name: "Classes",
    path: "/classes",
    permission: "classes.view",
  },
  {
    icon: <UserCircleIcon />,
    name: "Lecturers",
    path: "/lecturers",
    permission: "lecturers.view",
  },
  {
    icon: <PageIcon />,
    name: "Admission",
    path: "/admission",
    permission: "admission.view",
  },
  {
    icon: <PieChartIcon />,
    name: "Attendance",
    path: "/attendance",
    permission: "attendance.view",
  },
  {
    icon: <ListIcon />,
    name: "Examinations",
    path: "/examinations",
    permission: "examinations.view",
    subItems: [
      { name: "Exam Records", path: "/examinations", permission: "examinations.view" },
      { name: "Record Exams", path: "/examinations/record", permission: "examinations.create" },
      { name: "Student Transcript", path: "/examinations/transcript", permission: "examinations.view" },
    ],
  },
  {
    icon: <DollarLineIcon />,
    name: "Finance",
    path: "/finance",
    permission: "admission.view",
  },
];

const reportsItems: NavItem[] = [
  {
    icon: <PageIcon />,
    name: "Admission Report",
    path: "/reports/admission",
    permission: "reports.view",
  },
  {
    icon: <PieChartIcon />,
    name: "Attendance Report",
    path: "/reports/attendance",
    permission: "reports.view",
  },
  {
    icon: <ListIcon />,
    name: "Exam Report",
    path: "/reports/exam",
    permission: "reports.view",
  },
  {
    icon: <DollarLineIcon />,
    name: "Payment Reports",
    path: "/reports/payment",
    permission: "reports.view",
    subItems: [
      { name: "Student Transactions", path: "/reports/student-transactions", permission: "reports.view" },
      { name: "Class Revenue", path: "/reports/class-revenue", permission: "reports.view" },
      { name: "Unpaid Students", path: "/reports/unpaid-students", permission: "reports.view" },
    ],
  },
];

// Activities (bottom): Users, Roles, Permissions
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
    icon: <LockIcon />,
    name: "Permissions",
    path: "/permissions",
    permission: "permissions.view",
  },
];

// --- Helper Functions ---

function filterByPermission<T extends { permission?: string; subItems?: SubItem[] }>(
  items: T[],
  hasPermission: (p: string) => boolean
): T[] {
  return items
    .filter((item) => !item.permission || hasPermission(item.permission))
    .map((item) => {
      if (!item.subItems) return item;
      const filteredSub = item.subItems.filter(
        (s) => !s.permission || hasPermission(s.permission)
      );
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
  const academicsNav = useMemo(() => filterByPermission(academicsItems, hasPermission), [hasPermission]);
  const reportsNav = useMemo(() => filterByPermission(reportsItems, hasPermission), [hasPermission]);
  const activitiesNav = useMemo(() => filterByPermission(activitiesItems, hasPermission), [hasPermission]);

  // State
  const [openSubmenu, setOpenSubmenu] = useState<{
    type: MenuCategory;
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

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
    const categories: MenuCategory[] = ["academics", "reports", "activities"];

    categories.forEach((menuType) => {
      const items =
        menuType === "academics" ? academicsNav :
        menuType === "reports" ? reportsNav : activitiesNav;

      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (subItem.path === pathname) {
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
  }, [pathname, academicsNav, reportsNav, activitiesNav]);

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
    <ul className="flex flex-col gap-4">
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
                <ul className="mt-2 space-y-1 ml-9">
                  {nav.subItems.map((subItem) => (
                    <li key={subItem.name}>
                      <Link
                        href={subItem.path}
                        className={`menu-dropdown-item ${
                          isActive(subItem.path)
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
      className={`no-print fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${isExpanded || isMobileOpen || isHovered ? "w-[290px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`py-8 flex ${!isExpanded && !isHovered && !isMobileOpen ? "lg:justify-center" : ""}`}>
        <Link href="/" className={`flex items-center gap-2 ${!isExpanded && !isHovered && !isMobileOpen ? "lg:justify-center" : ""}`}>
          <Image
            src="/logo/logo%20abaarso.png"
            alt="ATU Berbera"
            width={48}
            height={48}
            priority
            className="object-contain h-12 w-12 shrink-0"
          />
          {(isExpanded || isHovered || isMobileOpen) && (
            <span className="text-sm font-semibold text-gray-800 dark:text-white/90 whitespace-nowrap">
              ABAARSO TECH UNIVERSITY
            </span>
          )}
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {/* Academics Section (top) */}
            {academicsNav.length > 0 && (
              <div>
                <h2 className={`mb-4 text-xs uppercase flex text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                  {isExpanded || isHovered || isMobileOpen ? "Academics" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(academicsNav, "academics")}
              </div>
            )}

            {/* Reports Section */}
            {reportsNav.length > 0 && (
              <div>
                <h2 className={`mb-4 text-xs uppercase flex text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                  {isExpanded || isHovered || isMobileOpen ? "Reports" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(reportsNav, "reports")}
              </div>
            )}

            {/* Activities Section (bottom): Users, Roles, Permissions */}
            {activitiesNav.length > 0 && (
              <div>
                <h2 className={`mb-4 text-xs uppercase flex text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                  {isExpanded || isHovered || isMobileOpen ? "Activities" : <HorizontaLDots />}
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