"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { login as apiLogin } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "es";

  const [email, setEmail] = useState("test2@demo.com");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiLogin(email, password);
      localStorage.setItem("token", data.token);
      router.push(`/${locale}/dashboard`);
    } catch (err: any) {
      setError(err?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="w-full max-w-md">
      <h1 className="text-3xl font-semibold mb-6">Login</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none focus:border-zinc-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Password</label>
          <input
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none focus:border-zinc-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-white text-black py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        {error && (
          <div className="rounded-md border border-red-700 bg-red-950/40 px-3 py-2 text-red-200">
            {error}
          </div>
        )}
      </form>
    </main>
  );
}
