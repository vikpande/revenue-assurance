import { useMemo, useState } from "react";
import type { CaseInput, CaseResult, Reason, Segment, StoryWindow } from "./engine";
import { runCase } from "./engine";
import { downloadJson, gbp, hrs, mwh, pct } from "./format";
import { siteHref, snapshotText, useSha256, type Section } from "./route";
import { formatWhen } from "./time";

const REASON_LABEL: Record<Reason, string> = {
  forced: "Forced outage",
  "grid-unverified": "Grid code, no notice for this part",
  "grid-verified": "Grid code covered by an outage notice",
  "maintenance-deemed": "Scheduled maintenance inside the allowance",
  "maintenance-excess": "Scheduled maintenance past the allowance",
};

type FileFilter = "all" | "unsettled" | "settled";

export function FleetScreen({
  cases,
  packStatus,
}: {
  cases: CaseInput[];
  packStatus: PackStatus;
}) {
  const [filter, setFilter] = useState<FileFilter>("all");
  const rows = cases.map((item) => ({
    item,
    contract: runCase(item, "contract"),
    oem: runCase(item, "oem"),
  }));
  const shown = rows.filter(({ item }) =>
    filter === "all" ? true : filter === "settled" ? Boolean(item.settlement) : !item.settlement,
  );
  const inDispute = rows.reduce((sum, row) => sum + row.contract.varianceDamagesGbp, 0);
  const cash = rows.reduce((sum, row) => sum + (row.item.settlement?.cashGbp ?? 0), 0);
  const unsettled = rows.filter((row) => !row.item.settlement).length;
  const unsettledValue = rows
    .filter((row) => !row.item.settlement)
    .reduce((sum, row) => sum + row.contract.varianceDamagesGbp, 0);
  const earned = cash + unsettledValue;
  const priority = rows
    .filter(({ item }) => !item.settlement)
    .sort((a, b) => b.contract.varianceDamagesGbp - a.contract.varianceDamagesGbp)[0];
  return (
    <section>
      <header className="page-head portfolio-head">
        <span className="workspace-kicker">Revenue assurance workspace</span>
        <h1>Find the value hidden in availability data.</h1>
        <p className="quiet">
          Review contract exceptions, trace every hour to its evidence, and prepare a claim with
          the calculation already in place.
        </p>
      </header>
      {priority && (
        <section className="review-brief" aria-labelledby="review-brief-title">
          <div className="review-brief-main">
            <span className="brief-label"><span className="brief-spark" aria-hidden="true">✦</span> Next review</span>
            <h2 id="review-brief-title">{priority.item.name} needs a closer look</h2>
            <p>
              {priority.contract.findings.length} contract exception{priority.contract.findings.length === 1 ? "" : "s"} account for {gbp(priority.contract.varianceDamagesGbp)} in disputed value. Start with the evidence behind the OEM coding difference.
            </p>
            <div className="brief-actions">
              <a className="solid" href={siteHref(priority.item.id, "findings")}>Review findings</a>
              <a className="brief-link" href={siteHref(priority.item.id)}>See calculation</a>
            </div>
          </div>
          <div className="review-brief-aside">
            <span>Evidence in view</span>
            <strong>{priority.item.events.length} status events</strong>
            <strong>{priority.item.outages.length} outage notice{priority.item.outages.length === 1 ? "" : "s"}</strong>
            <strong>{priority.item.clauses.length} contract clauses</strong>
            <small>Computed from demonstration records</small>
          </div>
        </section>
      )}
      <dl className="metrics">
        <div>
          <dt>Sites</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>In dispute</dt>
          <dd className="dispute">{gbp(inDispute)}</dd>
        </div>
        <div>
          <dt>Unsettled</dt>
          <dd>{unsettled}</dd>
        </div>
        <div>
          <dt>Cash landed</dt>
          <dd className="settled">{gbp(cash)}</dd>
        </div>
      </dl>
      <EarnBar settled={cash} unsettled={unsettledValue} total={earned} />
      <div className="toolbar">
        <div className="filters" role="group" aria-label="Show sites">
          {(
            [
              ["all", "All"],
              ["unsettled", "Unsettled"],
              ["settled", "Settled"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="quiet">
          {shown.length} of {rows.length} sites
        </p>
      </div>
      <div className="table-wrap">
        <table className="register">
          <thead>
            <tr>
              <th>Site</th>
              <th>Quarter</th>
              <th className="num">OEM coding</th>
              <th className="num">Contract</th>
              <th className="num">In dispute</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ item, contract, oem }) => {
              const file = fileState(item, packStatus);
              return (
                <tr key={item.id}>
                  <td>
                    <a href={siteHref(item.id)}>{item.name}</a>
                    <div className="quiet">
                      {item.turbines.length} turbines,{" "}
                      {item.turbines[0].ratedKw.toLocaleString("en-GB")} kW
                    </div>
                  </td>
                  <td>{item.quarterLabel}</td>
                  <td className="num">{pct(oem.availability)}</td>
                  <td className="num">{pct(contract.availability)}</td>
                  <td className="num dispute">{gbp(contract.varianceDamagesGbp)}</td>
                  <td>
                    <span className={`pill pill-${file.tone}`}>{file.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EarnBar({
  settled,
  unsettled,
  total,
}: {
  settled: number;
  unsettled: number;
  total: number;
}) {
  const settledShare = total > 0 ? (settled / total) * 100 : 0;
  const openShare = total > 0 ? (unsettled / total) * 100 : 0;
  return (
    <figure className="earn">
      <figcaption className="earn-head">
        <span>Total earned</span>
        <strong>{gbp(total)}</strong>
      </figcaption>
      <div
        className="earn-bar"
        role="img"
        aria-label={`Total earned ${gbp(total)}. Settled ${gbp(settled)}. Unsettled ${gbp(unsettled)}.`}
      >
        <i className="earn-settled" style={{ width: `${settledShare}%` }} />
        <i className="earn-open" style={{ width: `${openShare}%` }} />
      </div>
      <p className="earn-key">
        <span>
          <i className="earn-settled" />
          Settled <b>{gbp(settled)}</b>
        </span>
        <span>
          <i className="earn-open" />
          Unsettled <b>{gbp(unsettled)}</b>
        </span>
      </p>
    </figure>
  );
}

function fileState(
  item: CaseInput,
  packStatus: PackStatus,
): { label: string; tone: "settled" | PackStatus } {
  if (item.settlement) return { label: `Cash ${gbp(item.settlement.cashGbp)}`, tone: "settled" };
  if (packStatus === "sent") return { label: "Sent", tone: "sent" };
  if (packStatus === "approved") return { label: "Approved", tone: "approved" };
  return { label: "Draft", tone: "draft" };
}

export function AvailabilityScreen({
  input,
  mode,
  onMode,
}: {
  input: CaseInput;
  mode: "contract" | "oem";
  onMode: (mode: "contract" | "oem") => void;
}) {
  const view = useMemo(() => runCase(input, mode), [input, mode]);
  const oem = useMemo(() => runCase(input, "oem"), [input]);
  const contract = useMemo(() => runCase(input, "contract"), [input]);
  const [selected, setSelected] = useState<string | null>(null);
  const hash = useSha256(snapshotText(input));
  const within = Math.abs(oem.availability - input.oemReported) * 100 < 0.1;

  return (
    <section>
      <header className="page-head">
        <h1>{input.name}</h1>
        <p className="quiet">
          {input.quarterLabel}. {input.owner}. Contractor {input.contractor}. Guarantee{" "}
          {pct(input.guarantee, 1)} at {gbp(input.pricePerMwh)} per MWh.
        </p>
      </header>
      <dl className="metrics">
        <div>
          <dt>This reading</dt>
          <dd>{pct(view.availability)}</dd>
        </div>
        <div>
          <dt>OEM statement</dt>
          <dd>{pct(input.oemReported, 2)}</dd>
        </div>
        <div>
          <dt>Damages on this reading</dt>
          <dd>{gbp(view.damagesGbp)}</dd>
        </div>
        <div>
          <dt>Amount in dispute</dt>
          <dd className="dispute">{gbp(contract.varianceDamagesGbp)}</dd>
        </div>
      </dl>
      <ReadingNote input={input} view={view} contract={contract} />

      <div className="switch-row">
        <button
          type="button"
          className="switch"
          aria-pressed={mode === "oem"}
          onClick={() => onMode(mode === "oem" ? "contract" : "oem")}
        >
          <span className="knob" aria-hidden="true">
            <i />
          </span>
          {mode === "oem" ? "Showing the OEM coding" : "Show the OEM grid coding"}
        </button>
        <p>
          {mode === "oem"
            ? "Grid codes are excused in full, which is how the statement treats them. The findings list still holds the contract reading."
            : "Grid codes count as unavailable except where an outage notice covers them."}
        </p>
      </div>

      {input.stories.map((story) => (
        <StoryStrip
          key={story.title}
          story={story}
          result={view}
          outages={input.outages}
          selected={selected}
          onSelect={setSelected}
          showLegend={story === input.stories[input.stories.length - 1]}
        />
      ))}

      {selected && (
        <SegmentDetail
          segment={view.segments.find((segment) => segmentKey(segment) === selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <h2>How the hours add up</h2>
      <div className="table-wrap">
        <table className="register">
          <thead>
            <tr>
              <th>Treatment</th>
              <th className="num">Hours</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            <HourRow label="Forced outages" hours={view.forcedHours} effect="Unavailable" />
            <HourRow
              label="Grid code with no covering notice"
              hours={view.gridUnverifiedHours}
              effect="Unavailable"
            />
            <HourRow
              label="Grid code covered by a notice"
              hours={view.gridVerifiedHours}
              effect="Deemed available"
            />
            <HourRow
              label="Scheduled maintenance inside the allowance"
              hours={view.maintenanceDeemedHours}
              effect="Deemed available"
            />
            <HourRow
              label="Scheduled maintenance past the allowance"
              hours={view.maintenanceExcessHours}
              effect="Unavailable"
            />
            <tr className="total">
              <td>Unavailable hours</td>
              <td className="num">{hrs(view.unavailableHours)}</td>
              <td>Enters the availability fraction</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Calculation</h2>
      <p className="formula">
        1 − {hrs(view.unavailableHours)} ÷ {hrs(view.denominatorHours)} = {pct(view.availability, 6)}
      </p>
      {view.availability + 1e-12 < input.guarantee ? (
        <p className="formula">
          {input.measuredProductionMwh.toLocaleString("en-GB")} × ({pct(input.guarantee, 1)} ÷{" "}
          {pct(view.availability, 6)} − 1) = {mwh(view.shortfallMwh)} × {gbp(input.pricePerMwh)} ={" "}
          {gbp(view.damagesGbp)}
        </p>
      ) : (
        <p className="formula">
          {pct(view.availability)} is above the {pct(input.guarantee, 1)} guarantee, so damages on
          this reading are {gbp(0)}.
        </p>
      )}
      <p className="quiet">
        Full damages follow the reading selected above. The claim is the difference between the
        contract and the OEM coding, {gbp(contract.varianceDamagesGbp)}. The cap this contract year
        is {gbp(input.capGbp)}. {input.meterNote}
      </p>
      <p>
        Reproducing the OEM coding on the same events gives {pct(oem.availability)}. The statement
        says {pct(input.oemReported, 2)}.
        {within ? " That is within 0.1 percentage points." : " The gap is wider than 0.1 percentage points."}
      </p>

      {input.clauses.slice(0, 2).map((clause) => (
        <blockquote key={clause.id}>
          <p>{clause.text}</p>
          <footer>{clause.cite}</footer>
        </blockquote>
      ))}

      <div className="actions">
        <button
          type="button"
          className="ghost"
          onClick={() =>
            downloadJson(`${input.id}-${mode}-trace.json`, {
              mode,
              availability: view.availability,
              unavailableHours: view.unavailableHours,
              damagesGbp: view.damagesGbp,
              snapshot: hash,
              turbines: view.turbines,
            })
          }
        >
          Download the trace
        </button>
        <span className="quiet">Snapshot {hash.slice(0, 16)}</span>
      </div>

      <h2>Every turbine</h2>
      <div className="table-wrap">
        <table className="register">
          <thead>
            <tr>
              <th>Turbine</th>
              <th className="num">Unavailable h</th>
              <th className="num">Deemed h</th>
              <th className="num">Availability</th>
            </tr>
          </thead>
          <tbody>
            {[...view.turbines]
              .sort((a, b) => b.unavailableHours - a.unavailableHours || a.id.localeCompare(b.id))
              .map((turbine) => (
                <tr key={turbine.id}>
                  <td>{turbine.id}</td>
                  <td className="num">{hrs(turbine.unavailableHours)}</td>
                  <td className="num">{hrs(turbine.deemedHours)}</td>
                  <td className="num">{pct(turbine.availability)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReadingNote({
  input,
  view,
  contract,
}: {
  input: CaseInput;
  view: CaseResult;
  contract: CaseResult;
}) {
  if (view.mode === "oem") {
    return (
      <p className="summary">
        This is the OEM coding. Damages on it are {gbp(view.damagesGbp)}. The contract reading
        differs by {gbp(contract.varianceDamagesGbp)}.
      </p>
    );
  }
  return (
    <p className="summary">
      This is the contract reading. The OEM statement says {pct(input.oemReported, 2)}. The amount
      in dispute is {gbp(contract.varianceDamagesGbp)}
      {input.settlement ? `, of which ${gbp(input.settlement.cashGbp)} has been paid` : ""}.
    </p>
  );
}

function HourRow({ label, hours, effect }: { label: string; hours: number; effect: string }) {
  if (hours <= 0) return null;
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{hrs(hours)}</td>
      <td>{effect}</td>
    </tr>
  );
}

function StoryStrip({
  story,
  result,
  outages,
  selected,
  onSelect,
  showLegend,
}: {
  story: StoryWindow;
  result: CaseResult;
  outages: CaseInput["outages"];
  selected: string | null;
  onSelect: (key: string) => void;
  showLegend: boolean;
}) {
  return (
    <figure className="story">
      <figcaption>{story.title}</figcaption>
      {story.turbineIds.map((turbineId) => (
        <div className="strip" key={turbineId}>
          <span>{turbineId}</span>
          <div className="bar">
            {result.segments
              .filter(
                (segment) =>
                  segment.turbineId === turbineId &&
                  segment.end > story.start &&
                  segment.start < story.end,
              )
              .map((segment) => {
                const box = place(segment.start, segment.end, story.start, story.end);
                if (!box) return null;
                const key = segmentKey(segment);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`seg ${segment.reason}${selected === key ? " is-selected" : ""}`}
                    style={{ left: `${box.left}%`, width: `${box.width}%` }}
                    aria-pressed={selected === key}
                    onClick={() => onSelect(key)}
                  >
                    <span className="sr">{REASON_LABEL[segment.reason]}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      {outages.map((outage) => {
        const box = place(outage.start, outage.end, story.start, story.end);
        if (!box) return null;
        return (
          <div className="strip notice" key={outage.id}>
            <span>{outage.reference}</span>
            <div className="bar bar-notice">
              <i style={{ left: `${box.left}%`, width: `${box.width}%` }} />
            </div>
          </div>
        );
      })}
      {showLegend && (
        <ul className="legend">
          <li>
            <i className="seg forced" /> Forced outage
          </li>
          <li>
            <i className="seg grid-unverified" /> Grid code, no notice
          </li>
          <li>
            <i className="seg grid-verified" /> Notice covers it
          </li>
          <li>
            <i className="seg maintenance-deemed" /> Inside the allowance
          </li>
          <li>
            <i className="seg maintenance-excess" /> Past the allowance
          </li>
        </ul>
      )}
    </figure>
  );
}

function SegmentDetail({ segment, onClose }: { segment: Segment | undefined; onClose: () => void }) {
  if (!segment) return null;
  const duration = (segment.end - segment.start) / 3_600_000;
  return (
    <aside className="detail">
      <p>
        <strong>{segment.turbineId}</strong> {segment.code}. {segment.message}
      </p>
      <p>
        {formatWhen(segment.start)} to {formatWhen(segment.end)} ({hrs(duration)} h).{" "}
        {REASON_LABEL[segment.reason]}.
      </p>
      <button type="button" className="text-button" onClick={onClose}>
        Close this event
      </button>
    </aside>
  );
}

function place(start: number, end: number, win0: number, win1: number) {
  const span = win1 - win0;
  const a = Math.max(start, win0);
  const b = Math.min(end, win1);
  if (b <= a || span <= 0) return null;
  return { left: ((a - win0) / span) * 100, width: ((b - a) / span) * 100 };
}

function segmentKey(segment: Segment): string {
  return `${segment.turbineId}-${segment.start}-${segment.reason}`;
}

export function FindingsScreen({ input }: { input: CaseInput }) {
  const contract = useMemo(() => runCase(input, "contract"), [input]);
  return (
    <section>
      <header className="page-head">
        <h1>Findings</h1>
        <p className="quiet">
          Hours the contract and the OEM coding treat differently. Forced outages counted in both
          readings stay out of the claim.
        </p>
      </header>
      <dl className="metrics cols-3">
        <div>
          <dt>Findings</dt>
          <dd>{contract.findings.length}</dd>
        </div>
        <div>
          <dt>Hours in dispute</dt>
          <dd>{hrs(contract.findings.reduce((sum, finding) => sum + finding.hours, 0))}</dd>
        </div>
        <div>
          <dt>Amount in dispute</dt>
          <dd className="dispute">{gbp(contract.varianceDamagesGbp)}</dd>
        </div>
      </dl>
      {contract.findings.length === 0 ? (
        <p>No hours differ. There is nothing to draft.</p>
      ) : (
        <ol className="findings">
          {contract.findings.map((finding) => (
            <li key={finding.id}>
              <div className="finding-head">
                <h2>{finding.title}</h2>
                <p className="finding-money">{gbp(finding.centralGbp)}</p>
              </div>
              <p>
                {hrs(finding.hours)} hours on {finding.turbines.join(", ")}. {finding.narrative}
              </p>
              <p className="quiet">
                {finding.clause}. Confidence {finding.confidence}, because the status code, the
                notice and the clause can be shown together.
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="actions">
        <a className="solid" href={siteHref(input.id, "claim")}>
          Open the claim pack
        </a>
      </p>
    </section>
  );
}

export type PackStatus = "draft" | "approved" | "sent";

export function ClaimScreen({
  input,
  packStatus,
  onPackStatus,
}: {
  input: CaseInput;
  packStatus: PackStatus;
  onPackStatus: (status: PackStatus) => void;
}) {
  const contract = useMemo(() => runCase(input, "contract"), [input]);
  const hash = useSha256(snapshotText(input));
  const settled = Boolean(input.settlement);
  return (
    <article className="pack">
      <header className="page-head">
        <p className={`pill ${settled ? "pill-settled" : `pill-${packStatus}`}`}>
          {settled ? "Settled" : packLabel(packStatus)}
        </p>
        <h1>
          {input.name} {input.quarterLabel}
        </h1>
        <p className="quiet">
          From {input.owner} to {input.contractor}. Figures below are taken from the calculation.
        </p>
      </header>
      <dl className="metrics">
        <div>
          <dt>Contract availability</dt>
          <dd>{pct(contract.availability)}</dd>
        </div>
        <div>
          <dt>OEM statement</dt>
          <dd>{pct(input.oemReported, 2)}</dd>
        </div>
        <div>
          <dt>OEM coding, reproduced</dt>
          <dd>{pct(contract.oemAvailability)}</dd>
        </div>
        <div>
          <dt>Unavailable hours</dt>
          <dd>{hrs(contract.unavailableHours)}</dd>
        </div>
        <div>
          <dt>Shortfall</dt>
          <dd>{mwh(contract.shortfallMwh)}</dd>
        </div>
        <div>
          <dt>Damages on the contract</dt>
          <dd>{gbp(contract.damagesGbp)}</dd>
        </div>
        <div>
          <dt>Damages on the OEM coding</dt>
          <dd>{gbp(roundDiff(contract.damagesGbp, contract.varianceDamagesGbp))}</dd>
        </div>
        <div>
          <dt>Amount in dispute</dt>
          <dd className="dispute">{gbp(contract.varianceDamagesGbp)}</dd>
        </div>
      </dl>
      <h2>Findings in this pack</h2>
      <ul>
        {contract.findings.map((finding) => (
          <li key={finding.id}>
            {finding.title}: {hrs(finding.hours)} h, {gbp(finding.centralGbp)}. {finding.clause}.
          </li>
        ))}
      </ul>
      {input.clauses.map((clause) => (
        <blockquote key={clause.id}>
          <p>{clause.text}</p>
          <footer>{clause.cite}</footer>
        </blockquote>
      ))}
      <h2>Evidence</h2>
      <ul>
        <li>{input.events.length} status events and {input.outages.length} outage notice{input.outages.length === 1 ? "" : "s"}.</li>
        {input.outages.map((outage) => (
          <li key={outage.id}>
            {outage.reference}. {outage.note}
          </li>
        ))}
        <li>{input.meterNote}</li>
        <li className="hash">Snapshot SHA-256 {hash}</li>
      </ul>
      {input.settlement && (
        <>
          <h2>Cash</h2>
          <p>
            {gbp(input.settlement.cashGbp)} received on {input.settlement.paidOn}. {input.settlement.note}{" "}
            Gainshare at 20% of cash received is {gbp(input.settlement.cashGbp * 0.2)}.
          </p>
        </>
      )}
      {!settled && (
        <div className="actions">
          {packStatus === "draft" && (
            <button type="button" className="solid" onClick={() => onPackStatus("approved")}>
              Approve pack
            </button>
          )}
          {packStatus === "approved" && (
            <button type="button" className="solid" onClick={() => onPackStatus("sent")}>
              Mark as sent
            </button>
          )}
          {packStatus === "sent" && <p>Marked as sent in this demonstration. Nothing was emailed.</p>}
          {packStatus !== "draft" && (
            <button type="button" className="text-button" onClick={() => onPackStatus("draft")}>
              Return to draft
            </button>
          )}
        </div>
      )}
      <p className="quiet">
        A client deployment would leave this with the named signatory. This screen only marks the
        demonstration file.
      </p>
    </article>
  );
}

function roundDiff(damages: number, variance: number): number {
  return Math.round((damages - variance) * 100) / 100;
}

function packLabel(status: PackStatus): string {
  if (status === "approved") return "Approved";
  if (status === "sent") return "Sent";
  return "Draft";
}

export function sectionLabel(section: Section): string {
  if (section === "findings") return "Findings";
  if (section === "claim") return "Claim";
  return "Availability";
}
