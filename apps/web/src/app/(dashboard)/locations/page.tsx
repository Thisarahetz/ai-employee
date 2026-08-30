"use client";

import { useState } from "react";

import { useBusinesses, useDeleteBusiness } from "@/lib/hooks/use-businesses";
import { getErrorMessage } from "@/lib/utils";
import type { Business } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LocationFormModal } from "@/components/locations/location-form-modal";

function formatType(type: Business["type"]): string {
  return type
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export default function LocationsPage() {
  const locationsQuery = useBusinesses();
  const deleteBusiness = useDeleteBusiness();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const locations = locationsQuery.data ?? [];
  const isLastLocation = locations.length <= 1;

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(location: Business) {
    setEditing(location);
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    setRowError(null);
    try {
      await deleteBusiness.mutateAsync(id);
      setConfirmingId(null);
    } catch (err) {
      setRowError(getErrorMessage(err, "Unable to remove this location."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Locations</h1>
          <p className="text-sm text-ink-secondary">
            Branches or sites under this workspace. A salon with several shops has one location per shop.
          </p>
        </div>
        <Button onClick={openAdd}>+ Add location</Button>
      </div>

      {rowError && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {rowError}
        </p>
      )}

      <Card>
        {locationsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : locationsQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(locationsQuery.error, "Unable to load locations.")}
              onRetry={() => locationsQuery.refetch()}
            />
          </div>
        ) : locations.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No locations yet"
              description="Add your first branch or site to organise conversations and channels by location."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Timezone</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {locations.map((location) => (
                  <tr key={location.id} className="hover:bg-surface-page">
                    <td className="px-5 py-3 font-medium text-ink-primary">
                      {location.name}
                      {location.integrationId && (
                        <span
                          className="ml-2 rounded bg-surface-page px-1.5 py-0.5 text-xs font-normal text-ink-secondary border border-line"
                          title="Kept in sync from a connected integration"
                        >
                          Synced
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{formatType(location.type)}</td>
                    <td className="px-5 py-3 text-ink-secondary">{location.timezone}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(location)}>
                          Edit
                        </Button>
                        {confirmingId === location.id ? (
                          <>
                            <Button
                              variant="danger"
                              size="sm"
                              isLoading={deleteBusiness.isPending}
                              onClick={() => handleDelete(location.id)}
                            >
                              Confirm remove
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isLastLocation}
                            title={isLastLocation ? "A workspace needs at least one location." : undefined}
                            onClick={() => {
                              setRowError(null);
                              setConfirmingId(location.id);
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <LocationFormModal
          key={editing?.id ?? "new"}
          isOpen
          onClose={() => setFormOpen(false)}
          location={editing}
        />
      )}
    </div>
  );
}
