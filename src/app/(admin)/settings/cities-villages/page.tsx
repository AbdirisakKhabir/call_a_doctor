"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";

type City = { id: number; name: string; sortOrder: number; isActive: boolean };
type Village = { id: number; cityId: number; name: string; sortOrder: number; isActive: boolean };

export default function CitiesVillagesSettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("settings.manage");

  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [cityModal, setCityModal] = useState<"add" | "edit" | null>(null);
  const [cityEditId, setCityEditId] = useState<number | null>(null);
  const [cityForm, setCityForm] = useState({ name: "", sortOrder: "0" });
  const [cityError, setCityError] = useState("");
  const [citySubmitting, setCitySubmitting] = useState(false);

  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [villages, setVillages] = useState<Village[]>([]);
  const [villagesLoading, setVillagesLoading] = useState(false);
  const [villageModal, setVillageModal] = useState<"add" | "edit" | null>(null);
  const [villageEditId, setVillageEditId] = useState<number | null>(null);
  const [villageForm, setVillageForm] = useState({ name: "", sortOrder: "0" });
  const [villageError, setVillageError] = useState("");
  const [villageSubmitting, setVillageSubmitting] = useState(false);

  const loadCities = useCallback(async () => {
    const res = await authFetch("/api/cities?all=true");
    if (res.ok) setCities(await res.json());
  }, []);

  const loadVillages = useCallback(async (cityId: number) => {
    setVillagesLoading(true);
    try {
      const res = await authFetch(`/api/villages?cityId=${cityId}&all=true`);
      if (res.ok) setVillages(await res.json());
      else setVillages([]);
    } finally {
      setVillagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) {
      setCitiesLoading(false);
      return;
    }
    setCitiesLoading(true);
    loadCities().finally(() => setCitiesLoading(false));
  }, [canManage, loadCities]);

  useEffect(() => {
    if (selectedCityId != null) loadVillages(selectedCityId);
    else setVillages([]);
  }, [selectedCityId, loadVillages]);

  useEffect(() => {
    if (cities.length && selectedCityId == null) {
      setSelectedCityId(cities[0].id);
    }
    if (selectedCityId != null && !cities.some((c) => c.id === selectedCityId)) {
      setSelectedCityId(cities[0]?.id ?? null);
    }
  }, [cities, selectedCityId]);

  function openAddCity() {
    setCityModal("add");
    setCityEditId(null);
    setCityForm({ name: "", sortOrder: "0" });
    setCityError("");
  }

  function openEditCity(c: City) {
    setCityModal("edit");
    setCityEditId(c.id);
    setCityForm({ name: c.name, sortOrder: String(c.sortOrder) });
    setCityError("");
  }

  async function submitCity(e: React.FormEvent) {
    e.preventDefault();
    setCityError("");
    setCitySubmitting(true);
    try {
      if (cityModal === "add") {
        const res = await authFetch("/api/cities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cityForm),
        });
        const data = await res.json();
        if (!res.ok) {
          setCityError(data.error || "Failed");
          return;
        }
        await loadCities();
        setCityModal(null);
      } else if (cityModal === "edit" && cityEditId) {
        const res = await authFetch(`/api/cities/${cityEditId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cityForm),
        });
        const data = await res.json();
        if (!res.ok) {
          setCityError(data.error || "Failed");
          return;
        }
        await loadCities();
        setCityModal(null);
      }
    } finally {
      setCitySubmitting(false);
    }
  }

  async function toggleCity(c: City) {
    const res = await authFetch(`/api/cities/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    if (res.ok) await loadCities();
    else alert((await res.json()).error || "Failed");
  }

  async function deleteCity(id: number) {
    if (!confirm("Delete this city? Villages must be removed first.")) return;
    const res = await authFetch(`/api/cities/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadCities();
      if (selectedCityId === id) setSelectedCityId(null);
    } else alert((await res.json()).error || "Failed");
  }

  function openAddVillage() {
    if (selectedCityId == null) return;
    setVillageModal("add");
    setVillageEditId(null);
    setVillageForm({ name: "", sortOrder: "0" });
    setVillageError("");
  }

  function openEditVillage(v: Village) {
    setVillageModal("edit");
    setVillageEditId(v.id);
    setVillageForm({ name: v.name, sortOrder: String(v.sortOrder) });
    setVillageError("");
  }

  async function submitVillage(e: React.FormEvent) {
    e.preventDefault();
    if (selectedCityId == null) return;
    setVillageError("");
    setVillageSubmitting(true);
    try {
      if (villageModal === "add") {
        const res = await authFetch("/api/villages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...villageForm, cityId: selectedCityId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setVillageError(data.error || "Failed");
          return;
        }
        await loadVillages(selectedCityId);
        setVillageModal(null);
      } else if (villageModal === "edit" && villageEditId && selectedCityId) {
        const res = await authFetch(`/api/villages/${villageEditId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(villageForm),
        });
        const data = await res.json();
        if (!res.ok) {
          setVillageError(data.error || "Failed");
          return;
        }
        await loadVillages(selectedCityId);
        setVillageModal(null);
      }
    } finally {
      setVillageSubmitting(false);
    }
  }

  async function toggleVillage(v: Village) {
    const res = await authFetch(`/api/villages/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !v.isActive }),
    });
    if (res.ok && selectedCityId) await loadVillages(selectedCityId);
    else alert((await res.json()).error || "Failed");
  }

  async function deleteVillage(id: number) {
    if (!confirm("Delete this village?")) return;
    const res = await authFetch(`/api/villages/${id}`, { method: "DELETE" });
    if (res.ok && selectedCityId) await loadVillages(selectedCityId);
    else alert((await res.json()).error || "Failed");
  }

  if (!canManage) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Cities & villages" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have access to manage cities and villages.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Cities & villages" />
      <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        Define cities and villages used on client addresses. Villages are grouped under a city.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cities</h3>
            <Button startIcon={<PlusIcon />} onClick={openAddCity} size="sm">
              Add city
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            {citiesLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
              </div>
            ) : cities.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No cities yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>Order</TableCell>
                    <TableCell isHeader>Name</TableCell>
                    <TableCell isHeader>Status</TableCell>
                    <TableCell isHeader className="text-right">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cities.map((c) => (
                    <TableRow
                      key={c.id}
                      className={selectedCityId === c.id ? "bg-brand-50/50 dark:bg-brand-950/20" : ""}
                    >
                      <TableCell className="font-mono text-sm">{c.sortOrder}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelectedCityId(c.id)}
                          className="font-medium text-left text-brand-700 hover:underline dark:text-brand-300"
                        >
                          {c.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleCity(c)}
                          className={
                            c.isActive
                              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }
                        >
                          {c.isActive ? "Active" : "Inactive"}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => openEditCity(c)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                            aria-label="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCity(c.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"
                            aria-label="Delete"
                          >
                            <TrashBinIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Villages</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedCityId
                  ? `Under ${cities.find((c) => c.id === selectedCityId)?.name ?? "city"}`
                  : "Select a city from the list"}
              </p>
            </div>
            <Button startIcon={<PlusIcon />} onClick={openAddVillage} size="sm" disabled={selectedCityId == null}>
              Add village
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            {selectedCityId == null ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Add a city, then select it to manage villages.</p>
            ) : villagesLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
              </div>
            ) : villages.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No villages for this city yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>Order</TableCell>
                    <TableCell isHeader>Name</TableCell>
                    <TableCell isHeader>Status</TableCell>
                    <TableCell isHeader className="text-right">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {villages.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-sm">{v.sortOrder}</TableCell>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleVillage(v)}
                          className={
                            v.isActive
                              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }
                        >
                          {v.isActive ? "Active" : "Inactive"}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => openEditVillage(v)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                            aria-label="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteVillage(v.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"
                            aria-label="Delete"
                          >
                            <TrashBinIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>
      </div>

      {cityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-lg font-semibold">{cityModal === "add" ? "Add city" : "Edit city"}</h3>
            <form onSubmit={submitCity} className="mt-4 space-y-4">
              {cityError && <div className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600">{cityError}</div>}
              <div>
                <Label>Name *</Label>
                <input
                  required
                  value={cityForm.name}
                  onChange={(e) => setCityForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <input
                  type="number"
                  value={cityForm.sortOrder}
                  onChange={(e) => setCityForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCityModal(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={citySubmitting}>
                  {citySubmitting ? "…" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {villageModal && selectedCityId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-lg font-semibold">{villageModal === "add" ? "Add village" : "Edit village"}</h3>
            <form onSubmit={submitVillage} className="mt-4 space-y-4">
              {villageError && <div className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600">{villageError}</div>}
              <div>
                <Label>Name *</Label>
                <input
                  required
                  value={villageForm.name}
                  onChange={(e) => setVillageForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <input
                  type="number"
                  value={villageForm.sortOrder}
                  onChange={(e) => setVillageForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setVillageModal(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={villageSubmitting}>
                  {villageSubmitting ? "…" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
