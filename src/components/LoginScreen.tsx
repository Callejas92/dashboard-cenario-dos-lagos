"use client";

import { useState } from "react";
import { Lock, Sun, Moon } from "lucide-react";

interface LoginScreenProps {
  onLogin: (password: string) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

export default function LoginScreen({ onLogin, dark, onToggleTheme }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLogin(password);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <button
        onClick={onToggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg transition-colors"
        style={{ color: "var(--text-dim)" }}
        title={dark ? "Modo claro" : "Modo escuro"}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="kpi-card w-full max-w-sm p-8">
        <div className="flex flex-col items-center gap-6 mb-8">
          <img
            src={dark ? "/logo-cenario-negativa.png" : "/logo-cenario.png"}
            alt="Cenário dos Lagos"
            className="h-16 object-contain"
          />
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>Dashboard Marketing</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                placeholder="Senha de acesso"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--input-bg)",
                  border: error ? "1px solid var(--red)" : "1px solid var(--input-border)",
                  color: "var(--text)",
                }}
                autoFocus
              />
            </div>
            {error && <p className="text-xs mt-2" style={{ color: "var(--red)" }}>Senha incorreta</p>}
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: "linear-gradient(135deg, #1a5c3a, #24795a)",
              color: "white",
              opacity: loading || !password ? 0.5 : 1,
            }}
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        <div className="flex justify-center mt-6">
          <img src="/logo-mangaba.png" alt="Mangaba Urbanismo" className="h-5 object-contain opacity-60" />
        </div>
      </div>
    </div>
  );
}
