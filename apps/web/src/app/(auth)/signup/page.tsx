"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in your name, email, and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const parts = fullName.trim().split(" ");
      const firstName = parts[0] || "Business";
      const lastName = parts.slice(1).join(" ") || "Owner";

      await signup({
        tenantName: `${firstName}'s Business`,
        businessType: "CUSTOM",
        firstName,
        lastName,
        email: email.trim(),
        password,
      });

      router.replace("/onboarding");
    } catch (err) {
      setError(getErrorMessage(err, "Could not create your account. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-bold text-ink-primary">Create your account</h2>
        <p className="mt-1 text-xs text-ink-secondary">
          Set up your account to hire and manage AI employees for your business.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-status-critical/10 px-3.5 py-2.5 text-xs text-status-critical font-medium">
          {error}
        </p>
      )}

      <Input
        label="Full Name"
        placeholder="e.g. John Doe"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        autoComplete="name"
        required
      />

      <Input
        label="Email Address"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="Must be at least 8 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <Button type="submit" className="w-full text-xs font-bold py-2.5" isLoading={isSubmitting}>
        Create Account &amp; Setup Business →
      </Button>

      <p className="text-center text-xs text-ink-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
