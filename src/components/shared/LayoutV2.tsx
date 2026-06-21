"use client";

/**
 * Layout V2 — wrapper único pras 3 abas (Panorama / Pipeline / Marketing).
 *
 *  - Autenticação simples (mesma da v1)
 *  - Navegação 3 abas + admin escondido
 *  - SwrProvider envolve filhos
 *  - Toggle dark/light mode
 *  - Mobile-first
 */
import { useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, FileText, Megaphone, FileBarChart2, Settings, Sun, Moon } from "lucide-react";
import LoginScreen from "@/components/LoginScreen";
import SwrProvider from "./SwrProvider";
import BonusBadge from "./BonusBadge";
import { setDashKey, getDashKey } from "@/lib/client-auth";

const TABS = [
  { href: "/panorama", label: "Panorama", icon: BarChart3 },
  { href: "/pipeline", label: "Pipeline", icon: FileText },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/relatorio", label: "Relatório", icon: FileBarChart2 },
] as const;

export default function LayoutV2({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [dark, setDark] = useState(false);
  // Logo do empreendimento (já existe em public/) — dark-aware; cai pro texto se falhar.
  const [logoErro, setLogoErro] = useState(false);

  // Restaura sessão + tema do localStorage
  useEffect(() => {
    setDark(localStorage.getItem("theme") === "dark");
    document.documentElement.classList.toggle("dark", localStorage.getItem("theme") === "dark");

    // Sessão é mantida no localStorage (mesma lógica da v1 — sem cookie httpOnly por enquanto).
    // As rotas de ESCRITA agora exigem a credencial (Bearer) — sessão antiga sem a
    // chave guardada precisa relogar uma vez, senão as escritas dariam 401 silencioso.
    const auth = localStorage.getItem("dashboard-auth") === "true" && !!getDashKey();
    setAuthenticated(auth);

    // Nota: NÃO fazemos clear-cache automático aqui. Criava race condition com os
    // fetchs SWR dos filhos (POST e GET batiam em instâncias diferentes da lambda,
    // GET pegava cache vazio antes do POST limpar). Cache stale é resolvido pelo
    // SWR revalidateOnMount + dedupingInterval curto.
  }, []);

  // Pré-aquecimento: quando autenticado, dispara os fetches pesados do ERP UAU em
  // background. Sem cron (plano Hobby não permite). Quando o usuário navegar pro
  // Estoque/Pipeline, o cache do servidor (10min) já estará quente.
  useEffect(() => {
    if (!authenticated) return;
    const warmUrls = ["/api/uau", "/api/uau/vendas", "/api/uau/financeiro"];
    for (const url of warmUrls) {
      // keepalive + no-await: dispara e esquece, não bloqueia a UI
      fetch(url, { keepalive: true }).catch(() => { /* silencioso */ });
    }
  }, [authenticated]);

  function onLoginSuccess(senha: string) {
    localStorage.setItem("dashboard-auth", "true");
    setDashKey(senha); // credencial usada nas chamadas de escrita (Bearer)
    setAuthenticated(true);
  }

  function toggleTheme() {
    const novo = !dark;
    setDark(novo);
    document.documentElement.classList.toggle("dark", novo);
    localStorage.setItem("theme", novo ? "dark" : "light");
  }

  // Loading antes de saber se está autenticado
  if (authenticated === null) {
    return <div style={{ padding: "2rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>Carregando…</div>;
  }

  if (!authenticated) {
    return (
      <LoginScreen
        onLogin={onLoginSuccess}
        dark={dark}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <SwrProvider>
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        {/* Header — background sólido (não --surface translúcido) + z-index alto */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "var(--bg-header, var(--bg-primary, #ffffff))",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border)",
            padding: "0.625rem 1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              maxWidth: "1400px",
              margin: "0 auto",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginRight: "0.5rem", display: "flex", alignItems: "center" }}>
              {!logoErro ? (
                <img
                  src={dark ? "/logo-cenario-negativa.png" : "/logo-cenario.png"}
                  alt="Cenário dos Lagos"
                  style={{ height: 30, width: "auto", display: "block" }}
                  onError={() => setLogoErro(true)}
                />
              ) : (
                <>
                  <span className="header-logo-full">Cenário dos Lagos</span>
                  <span className="header-logo-short" style={{ display: "none" }}>CDL</span>
                </>
              )}
            </div>

            <nav className="nav-desktop" style={{ display: "flex", gap: "0.25rem", flex: 1, overflowX: "auto" }}>
              {TABS.map(({ href, label, icon: Icon }) => {
                const ativo = pathname.startsWith(href);
                return (
                  <button
                    key={href}
                    onClick={() => router.push(href)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      padding: "0.4rem 0.75rem",
                      borderRadius: "0.5rem",
                      background: ativo ? "var(--border)" : "transparent",
                      color: ativo ? "var(--text)" : "var(--text-muted)",
                      fontWeight: ativo ? 700 : 500,
                      fontSize: "0.825rem",
                      border: "none",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "background 0.15s",
                    }}
                  >
                    <Icon size={14} />
                    <span className="header-tab-label">{label}</span>
                  </button>
                );
              })}
            </nav>

            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <BonusBadge />
              <button
                onClick={() => router.push("/admin")}
                style={{
                  padding: "0.4rem",
                  borderRadius: "0.5rem",
                  background: "transparent",
                  color: "var(--text-dim)",
                  border: 0,
                  cursor: "pointer",
                }}
                title="Admin"
                aria-label="Admin"
              >
                <Settings size={14} />
              </button>
              <button
                onClick={toggleTheme}
                style={{
                  padding: "0.4rem",
                  borderRadius: "0.5rem",
                  background: "transparent",
                  color: "var(--text-dim)",
                  border: 0,
                  cursor: "pointer",
                }}
                title={dark ? "Modo claro" : "Modo escuro"}
                aria-label="Alternar tema"
              >
                {dark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          </div>
        </header>

        {/* Conteúdo */}
        <main
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            padding: "1rem",
          }}
        >
          {children}
        </main>

        {/* Navegação inferior — só no mobile (CSS .nav-mobile). Abas grandes, polegar-friendly. */}
        <nav
          className="nav-mobile"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--bg-header, var(--bg-primary, #ffffff))",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderTop: "1px solid var(--border)",
            padding: "0.3rem 0.4rem",
            paddingBottom: "max(0.3rem, env(safe-area-inset-bottom))",
            justifyContent: "space-around",
          }}
        >
          {TABS.map(({ href, label, icon: Icon }) => {
            const ativo = pathname.startsWith(href);
            return (
              <button
                key={href}
                onClick={() => router.push(href)}
                aria-label={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.15rem",
                  flex: 1,
                  padding: "0.3rem",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: ativo ? "var(--text)" : "var(--text-muted)",
                }}
              >
                <Icon size={19} />
                <span style={{ fontSize: "0.62rem", fontWeight: ativo ? 700 : 500 }}>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </SwrProvider>
  );
}
