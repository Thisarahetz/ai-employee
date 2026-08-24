"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FormState {
  tenantName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const INITIAL_STATE: FormState = {
  tenantName: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (Object.values(form).some((value) => !value.trim())) {
      setError("All fields are required.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(form);
      router.replace("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Could not create your account. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <h2 className="text-lg font-semibold text-ink-primary">Create your workspace</h2>

      {error && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <Input
        label="Business / tenant name"
        value={form.tenantName}
        onChange={(e) => update("tenantName", e.target.value)}
        placeholder="Acme Salon"
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
        <Input label="Last name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
      </div>

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={(e) => update("email", e.target.value)}
        required
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        value={form.password}
        onChange={(e) => update("password", e.target.value)}
        required
      />

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        Create account
      </Button>

      <p className="text-center text-sm text-ink-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
