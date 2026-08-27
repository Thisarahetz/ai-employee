"use client";

import { useState, type FormEvent } from "react";

import { useBusinesses, useCreateBusiness, useUpdateBusiness } from "@/lib/hooks/use-businesses";
import { getErrorMessage } from "@/lib/utils";
import type { Business } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

interface LocationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Passed when editing; omitted when adding. */
  location?: Business | null;
}

export function LocationFormModal({ isOpen, onClose, location }: LocationFormModalProps) {
  const isEdit = !!location;
  const { data: businesses } = useBusinesses();
  const createBusiness = useCreateBusiness();
  const updateBusiness = useUpdateBusiness();

  const [name, setName] = useState(location?.name ?? "");
  const [timezone, setTimezone] = useState(location?.timezone ?? browserTimezone());
  const [error, setError] = useState<string | null>(null);

  const isPending = createBusiness.isPending || updateBusiness.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Give this location a name.");
      return;
    }

    try {
      if (isEdit) {
        await updateBusiness.mutateAsync({
          id: location.id,
          name: name.trim(),
          timezone: timezone.trim() || "UTC",
        });
      } else {
        // New branches inherit the business type set when the workspace was
        // created (all locations of one business are the same type).
        await createBusiness.mutateAsync({
          name: name.trim(),
          type: businesses?.[0]?.type,
          timezone: timezone.trim() || "UTC",
        });
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save this location."));
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit location" : "Add location"}
      description="A branch or site under this workspace — a salon with several shops has one per shop."
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
            {error}
          </p>
        )}

        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Downtown branch"
          autoFocus
          required
        />

        <Input
          label="Timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/New_York"
          hint="IANA name — used for business hours and scheduling."
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEdit ? "Save changes" : "Add location"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
