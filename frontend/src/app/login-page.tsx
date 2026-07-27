import { useState } from "react";

import { apiLogin } from "@/lib/api/client";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const ok = await apiLogin(password);
      if (ok) {
        // Cookie is set, hard reload to the root so the auth guard re-checks.
        window.location.href = "/";
      } else {
        setError("密码错误，请重试");
      }
    } catch {
      setError("登录失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-6 rounded-lg border p-8 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Coder</h1>
          <p className="mt-1 text-sm text-muted-foreground">请输入密码以继续</p>
        </div>

        <div className="flex flex-col gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoFocus
            className="rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={loading || !password}
          className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}
