import type { Metadata } from "next";
import React from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DashboardMetrics from "@/components/dashboard/DashboardMetrics";
import PharmacyRevenueChart from "@/components/dashboard/PharmacyRevenueChart";
import AppointmentsChart from "@/components/dashboard/AppointmentsChart";
import AppointmentStatusChart from "@/components/dashboard/AppointmentStatusChart";
import AppointmentRevenueChart from "@/components/dashboard/AppointmentRevenueChart";
import RevenueSummaryCard from "@/components/dashboard/RevenueSummaryCard";
import StatsPercentagesCard from "@/components/dashboard/StatsPercentagesCard";

export const metadata: Metadata = {
  title: "Call a Doctor | Dashboard",
  description: "Clinic Management System Dashboard",
};

export default function DashboardPage() {
  return (
    <div>
      <PageBreadCrumb pageTitle="Dashboard" />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12">
          <DashboardMetrics />
        </div>

        <div className="col-span-12 lg:col-span-8">
          <PharmacyRevenueChart />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <RevenueSummaryCard />
        </div>

        <div className="col-span-12 lg:col-span-8">
          <AppointmentsChart />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <AppointmentStatusChart />
        </div>

        <div className="col-span-12 lg:col-span-8">
          <AppointmentRevenueChart />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <StatsPercentagesCard />
        </div>
      </div>
    </div>
  );
}
