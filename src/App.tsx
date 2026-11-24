import { useEffect, useState } from "react";
import { DocsScreen } from "./docs";
import { BrandMark, WorkspaceScreen } from "./workspace";
import { cases, getCase } from "./fixtures";
import { siteHref, useRoute, type Section } from "./route";
import {
  AvailabilityScreen,
  ClaimScreen,
  FindingsScreen,
  FleetScreen,
  sectionLabel,
  type PackStatus,
} from "./screens";

const PACK_KEY = "c2c-site-p-pack";
const STEPS: Section[] = ["availability", "findings", "claim"];

function readPack(): PackStatus {
  try {
    const stored = sessionStorage.getItem(PACK_KEY);
    if (stored === "approved" || stored === "sent") return stored;
  } catch {
    /* session storage can be blocked */
  }
  return "draft";
}

export function App() {
  const route = useRoute();
  const [modeBySite, setModeBySite] = useState<Record<string, "contract" | "oem">>({});
  const [packStatus, setPackStatus] = useState<PackStatus>(() => readPack());
  const current = route.name === "site" && route.id ? getCase(route.id) : undefined;
  const mode = current ? (modeBySite[current.id] ?? "contract") : "contract";
  const stepIndex = STEPS.indexOf(route.section);
  const nextStep = current && stepIndex >= 0 ? STEPS[stepIndex + 1] : undefined;

  useEffect(() => {
    try {
      sessionStorage.setItem(PACK_KEY, packStatus);
    } catch {
      /* session storage can be blocked */
    }
  }, [packStatus]);

  useEffect(() => {
    if (route.name === "docs") {
      document.title = "Concepts · Clause to Claim";
    } else if (current) {
      document.title = `${current.name}, ${sectionLabel(route.section)} · Clause to Claim`;
    } else {
      document.title = route.name === "home" ? "Workspace · Clause to Claim" : "Portfolio · Clause to Claim";
    }
  }, [current, route]);

  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <div className={`shell${route.name === "home" ? " shell-home" : ""}`}>
        <div className="sidebar">
          <a className="mark" href="#/">
            <BrandMark />
            Clause to Claim
          </a>
          <nav aria-label="Menu">
            <p className="side-label">Book</p>
            <a href="#/" aria-current={route.name === "home" ? "page" : undefined}>
              <NavIcon kind="book" />
              <span className="nav-copy"><span className="nav-name">Workspace</span></span>
            </a>
            <a href="#/portfolio" aria-current={route.name === "fleet" ? "page" : undefined}>
              <NavIcon kind="book" />
              <span className="nav-copy">
                <span className="nav-name">Portfolio</span>
              </span>
            </a>
            {cases.map((item) => (
              <a
                key={item.id}
                href={siteHref(item.id)}
                aria-current={item.id === current?.id ? "page" : undefined}
              >
                <NavIcon kind="site" />
                <span className="nav-copy">
                  <span className="nav-name">{item.name}</span>
                  <span className="nav-meta">{item.quarterLabel}</span>
                </span>
              </a>
            ))}
            <p className="side-label">Reference</p>
            <a href="#/docs" aria-current={route.name === "docs" ? "page" : undefined}>
              <NavIcon kind="note" />
              <span className="nav-copy">
                <span className="nav-name">Concepts</span>
              </span>
            </a>
          </nav>
          <footer className="side-foot">
            <span className="avatar" aria-hidden="true">
              FR
            </span>
            <span>
              <strong>Fleet R Wind One Ltd</strong>
              <small>Demonstration. Glen Moor, Site P and Northwind are fictional.</small>
            </span>
          </footer>
        </div>
        <main id="content">
          {current && (
            <nav className="steps" aria-label="Case steps">
              {STEPS.map((section, index) => (
                <a
                  key={section}
                  href={siteHref(current.id, section)}
                  aria-current={route.section === section ? "step" : undefined}
                >
                  <span>{index + 1}</span>
                  {sectionLabel(section)}
                </a>
              ))}
            </nav>
          )}
          {route.name === "home" ? (
            <WorkspaceScreen />
          ) : route.name === "docs" ? (
            <DocsScreen />
          ) : route.name === "fleet" || !current ? (
            <FleetScreen cases={cases} packStatus={packStatus} />
          ) : route.section === "findings" ? (
            <FindingsScreen input={current} />
          ) : route.section === "claim" ? (
            <ClaimScreen input={current} packStatus={packStatus} onPackStatus={setPackStatus} />
          ) : (
            <AvailabilityScreen
              input={current}
              mode={mode}
              onMode={(next) => setModeBySite((prev) => ({ ...prev, [current.id]: next }))}
            />
          )}
          {current && nextStep && (
            <p className="step-next">
              <a className="solid" href={siteHref(current.id, nextStep)}>
                Continue to {sectionLabel(nextStep).toLowerCase()}
              </a>
            </p>
          )}
        </main>
      </div>
    </>
  );
}

function NavIcon({ kind }: { kind: "book" | "site" | "note" }) {
  const paths = {
    book: "M2 3.5h5.2v9H3.2A1.2 1.2 0 0 1 2 11.3V3.5Zm6.8 0H14v7.8a1.2 1.2 0 0 1-1.2 1.2H8.8v-9Z",
    site: "M8 2.2a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6ZM8 6.8v6.2M5.4 13h5.2",
    note: "M3 2.5h7.2L13 5.3V13.5H3V2.5Zm7 0v3h3",
  };
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[kind]} fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
