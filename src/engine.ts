export type EventKind = "forced" | "grid" | "maintenance";

export interface Turbine {
  id: string;
  ratedKw: number;
}

export interface StatusEvent {
  id: string;
  turbineId: string;
  start: number;
  end: number;
  kind: EventKind;
  code: string;
  message: string;
}

export interface OutageNotice {
  id: string;
  reference: string;
  start: number;
  end: number;
  note: string;
}

export interface StoryWindow {
  start: number;
  end: number;
  turbineIds: string[];
  title: string;
}

export interface CaseInput {
  id: string;
  name: string;
  owner: string;
  contractor: string;
  quarterLabel: string;
  periodStart: number;
  periodEnd: number;
  turbines: Turbine[];
  events: StatusEvent[];
  outages: OutageNotice[];
  guarantee: number;
  pricePerMwh: number;
  measuredProductionMwh: number;
  allowanceHours: number;
  oemAllowanceHours: number;
  /** Figure printed on the OEM statement, as a fraction. */
  oemReported: number;
  capGbp: number;
  stories: StoryWindow[];
  clauses: { id: string; cite: string; text: string }[];
  meterNote: string;
  settlement?: { cashGbp: number; paidOn: string; note: string };
}

export type Reason =
  | "forced"
  | "grid-unverified"
  | "grid-verified"
  | "maintenance-deemed"
  | "maintenance-excess";

export interface Segment {
  turbineId: string;
  start: number;
  end: number;
  unavailable: boolean;
  reason: Reason;
  eventId: string;
  code: string;
  message: string;
}

export interface TurbineResult {
  id: string;
  ratedKw: number;
  periodHours: number;
  unavailableHours: number;
  deemedHours: number;
  availability: number;
}

export interface Finding {
  id: string;
  title: string;
  hours: number;
  turbines: string[];
  clause: string;
  confidence: "High";
  narrative: string;
  centralGbp: number;
}

export interface CaseResult {
  mode: "contract" | "oem";
  periodHours: number;
  denominatorHours: number;
  unavailableHours: number;
  availability: number;
  oemAvailability: number;
  shortfallMwh: number;
  damagesGbp: number;
  capGbp: number;
  turbines: TurbineResult[];
  segments: Segment[];
  forcedHours: number;
  gridUnverifiedHours: number;
  gridVerifiedHours: number;
  maintenanceDeemedHours: number;
  maintenanceExcessHours: number;
  findings: Finding[];
  varianceDamagesGbp: number;
}

const HOUR = 3_600_000;

function hours(ms: number): number {
  return ms / HOUR;
}

function clip(start: number, end: number, from: number, to: number): [number, number] | null {
  const a = Math.max(start, from);
  const b = Math.min(end, to);
  return b > a ? [a, b] : null;
}

interface Tagged {
  turbineId: string;
  start: number;
  end: number;
  rank: number;
  unavailable: boolean;
  reason: Reason;
  eventId: string;
  code: string;
  message: string;
}

function intersect(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const a = Math.max(a0, b0);
  const b = Math.min(a1, b1);
  return b > a ? [a, b] : null;
}

function subtract(start: number, end: number, cuts: Array<[number, number]>): Array<[number, number]> {
  let parts: Array<[number, number]> = [[start, end]];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [p0, p1] of parts) {
      if (c1 <= p0 || c0 >= p1) {
        next.push([p0, p1]);
        continue;
      }
      if (c0 > p0) next.push([p0, c0]);
      if (c1 < p1) next.push([c1, p1]);
    }
    parts = next;
  }
  return parts;
}

function tagEvents(input: CaseInput, mode: "contract" | "oem"): Tagged[] {
  const tagged: Tagged[] = [];
  for (const event of input.events) {
    const span = clip(event.start, event.end, input.periodStart, input.periodEnd);
    if (!span) continue;
    const [start, end] = span;
    if (event.kind === "forced") {
      tagged.push({
        turbineId: event.turbineId,
        start,
        end,
        rank: 3,
        unavailable: true,
        reason: "forced",
        eventId: event.id,
        code: event.code,
        message: event.message,
      });
      continue;
    }
    if (event.kind === "maintenance") {
      tagged.push({
        turbineId: event.turbineId,
        start,
        end,
        rank: 2,
        unavailable: false,
        reason: "maintenance-deemed",
        eventId: event.id,
        code: event.code,
        message: event.message,
      });
      continue;
    }
    const cuts: Array<[number, number]> = [];
    if (mode === "contract") {
      for (const outage of input.outages) {
        const hit = intersect(start, end, outage.start, outage.end);
        if (hit) cuts.push(hit);
      }
    } else {
      cuts.push([start, end]);
    }
    for (const [c0, c1] of cuts) {
      tagged.push({
        turbineId: event.turbineId,
        start: c0,
        end: c1,
        rank: 1,
        unavailable: false,
        reason: "grid-verified",
        eventId: event.id,
        code: event.code,
        message: event.message,
      });
    }
    if (mode === "contract") {
      for (const [u0, u1] of subtract(start, end, cuts)) {
        tagged.push({
          turbineId: event.turbineId,
          start: u0,
          end: u1,
          rank: 4,
          unavailable: true,
          reason: "grid-unverified",
          eventId: event.id,
          code: event.code,
          message: event.message,
        });
      }
    }
  }
  return tagged;
}

function resolveTurbine(turbineId: string, tagged: Tagged[], from: number, to: number): Segment[] {
  const mine = tagged.filter((t) => t.turbineId === turbineId);
  const bounds = new Set<number>([from, to]);
  for (const t of mine) {
    bounds.add(t.start);
    bounds.add(t.end);
  }
  const points = [...bounds].sort((a, b) => a - b);
  const raw: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const covering = mine.filter((t) => t.start <= a && t.end >= b);
    if (covering.length === 0) continue;
    covering.sort((x, y) => x.rank - y.rank || x.start - y.start);
    const win = covering[0];
    const prev = raw[raw.length - 1];
    if (
      prev &&
      prev.end === a &&
      prev.reason === win.reason &&
      prev.eventId === win.eventId &&
      prev.unavailable === win.unavailable
    ) {
      prev.end = b;
      continue;
    }
    raw.push({
      turbineId,
      start: a,
      end: b,
      unavailable: win.unavailable,
      reason: win.reason,
      eventId: win.eventId,
      code: win.code,
      message: win.message,
    });
  }
  return raw;
}

function applyAllowance(segments: Segment[], allowanceHours: number): Segment[] {
  const allowanceMs = Math.round(allowanceHours * HOUR);
  const used = new Map<string, number>();
  const out: Segment[] = [];
  const ordered = [...segments].sort((a, b) => a.start - b.start || a.turbineId.localeCompare(b.turbineId));
  for (const seg of ordered) {
    if (seg.reason !== "maintenance-deemed") {
      out.push(seg);
      continue;
    }
    const usedMs = used.get(seg.turbineId) ?? 0;
    const left = Math.max(0, allowanceMs - usedMs);
    const len = seg.end - seg.start;
    if (left >= len) {
      used.set(seg.turbineId, usedMs + len);
      out.push(seg);
      continue;
    }
    if (left > 0) {
      used.set(seg.turbineId, allowanceMs);
      out.push({ ...seg, end: seg.start + left, reason: "maintenance-deemed", unavailable: false });
      out.push({
        ...seg,
        start: seg.start + left,
        reason: "maintenance-excess",
        unavailable: true,
      });
    } else {
      out.push({ ...seg, reason: "maintenance-excess", unavailable: true });
    }
  }
  return out;
}

function sumMs(segments: Segment[], pred: (s: Segment) => boolean): number {
  return segments.reduce((acc, s) => acc + (pred(s) ? s.end - s.start : 0), 0);
}

export function roundMoney(gbp: number): number {
  return Math.round((gbp + Number.EPSILON) * 100) / 100;
}

function damagesFor(availability: number, input: CaseInput): { shortfallMwh: number; damagesGbp: number } {
  if (availability >= input.guarantee || availability <= 0) {
    return { shortfallMwh: 0, damagesGbp: 0 };
  }
  const shortfallMwh = input.measuredProductionMwh * (input.guarantee / availability - 1);
  const uncapped = shortfallMwh * input.pricePerMwh;
  return { shortfallMwh, damagesGbp: roundMoney(Math.min(uncapped, input.capGbp)) };
}

function evaluate(input: CaseInput, mode: "contract" | "oem") {
  const periodMs = input.periodEnd - input.periodStart;
  const allowance = mode === "oem" ? input.oemAllowanceHours : input.allowanceHours;
  const tagged = tagEvents(input, mode);
  let segments: Segment[] = [];
  for (const turbine of input.turbines) {
    segments = segments.concat(
      resolveTurbine(turbine.id, tagged, input.periodStart, input.periodEnd),
    );
  }
  segments = applyAllowance(segments, allowance);
  const turbines: TurbineResult[] = input.turbines.map((turbine) => {
    const mine = segments.filter((s) => s.turbineId === turbine.id);
    const unavailableMs = sumMs(mine, (s) => s.unavailable);
    const deemedMs = sumMs(mine, (s) => !s.unavailable);
    const periodHours = hours(periodMs);
    const unavailableHours = hours(unavailableMs);
    return {
      id: turbine.id,
      ratedKw: turbine.ratedKw,
      periodHours,
      unavailableHours,
      deemedHours: hours(deemedMs),
      availability: 1 - unavailableHours / periodHours,
    };
  });
  const unavailableMs = sumMs(segments, (s) => s.unavailable);
  const denominatorMs = periodMs * input.turbines.length;
  const availability = 1 - unavailableMs / denominatorMs;
  return {
    periodHours: hours(periodMs),
    denominatorHours: hours(denominatorMs),
    unavailableHours: hours(unavailableMs),
    availability,
    turbines,
    segments,
    forcedHours: hours(sumMs(segments, (s) => s.reason === "forced")),
    gridUnverifiedHours: hours(sumMs(segments, (s) => s.reason === "grid-unverified")),
    gridVerifiedHours: hours(sumMs(segments, (s) => s.reason === "grid-verified")),
    maintenanceDeemedHours: hours(sumMs(segments, (s) => s.reason === "maintenance-deemed")),
    maintenanceExcessHours: hours(sumMs(segments, (s) => s.reason === "maintenance-excess")),
  };
}

function allocate(findings: Omit<Finding, "centralGbp">[], varianceDamages: number): Finding[] {
  const totalHours = findings.reduce((acc, f) => acc + f.hours, 0);
  if (totalHours <= 0 || varianceDamages <= 0) {
    return findings.map((f) => ({ ...f, centralGbp: 0 }));
  }
  const raw = findings.map((f) => (varianceDamages * f.hours) / totalHours);
  const floored = raw.map((n) => Math.floor(n * 100) / 100);
  let pennies = Math.round(varianceDamages * 100) - Math.round(floored.reduce((a, n) => a + n, 0) * 100);
  const order = raw
    .map((n, i) => ({ i, frac: n * 100 - Math.floor(n * 100) }))
    .sort((a, b) => b.frac - a.frac);
  const pence = floored.map((n) => Math.round(n * 100));
  for (const row of order) {
    if (pennies <= 0) break;
    pence[row.i] += 1;
    pennies -= 1;
  }
  return findings.map((f, i) => ({ ...f, centralGbp: pence[i] / 100 }));
}

export function runCase(input: CaseInput, mode: "contract" | "oem"): CaseResult {
  const contract = evaluate(input, "contract");
  const oem = evaluate(input, "oem");
  const active = mode === "contract" ? contract : oem;
  const contractMoney = damagesFor(contract.availability, input);
  const oemMoney = damagesFor(oem.availability, input);
  const activeMoney = mode === "contract" ? contractMoney : oemMoney;
  const variance = roundMoney(contractMoney.damagesGbp - oemMoney.damagesGbp);

  const gridTurbines = [
    ...new Set(
      contract.segments.filter((s) => s.reason === "grid-unverified").map((s) => s.turbineId),
    ),
  ];
  const allowanceTurbines = [
    ...new Set(
      contract.segments.filter((s) => s.reason === "maintenance-excess").map((s) => s.turbineId),
    ),
  ];

  const drafts: Omit<Finding, "centralGbp">[] = [];
  if (contract.gridUnverifiedHours > 0) {
    drafts.push({
      id: `${input.id}-grid`,
      title: "Grid code without an outage notice",
      hours: contract.gridUnverifiedHours,
      turbines: gridTurbines,
      clause: "Grid unavailability",
      confidence: "High",
      narrative:
        "The status log codes these hours as grid loss. The outage notices cover only part of that window, and the contract treats a DNO notice as the evidence of grid unavailability.",
    });
  }
  if (contract.maintenanceExcessHours > 0) {
    drafts.push({
      id: `${input.id}-allowance`,
      title: "Scheduled maintenance past the allowance",
      hours: contract.maintenanceExcessHours,
      turbines: allowanceTurbines,
      clause: "Allowed maintenance hours",
      confidence: "High",
      narrative: `The contract allows ${input.allowanceHours} hours of scheduled maintenance per turbine. The OEM statement applies ${input.oemAllowanceHours} hours. The hours above the contract allowance count as unavailable.`,
    });
  }

  return {
    mode,
    periodHours: active.periodHours,
    denominatorHours: active.denominatorHours,
    unavailableHours: active.unavailableHours,
    availability: active.availability,
    oemAvailability: oem.availability,
    shortfallMwh: activeMoney.shortfallMwh,
    damagesGbp: activeMoney.damagesGbp,
    capGbp: input.capGbp,
    turbines: active.turbines,
    segments: active.segments,
    forcedHours: active.forcedHours,
    gridUnverifiedHours: active.gridUnverifiedHours,
    gridVerifiedHours: active.gridVerifiedHours,
    maintenanceDeemedHours: active.maintenanceDeemedHours,
    maintenanceExcessHours: active.maintenanceExcessHours,
    findings: allocate(drafts, variance),
    varianceDamagesGbp: variance,
  };
}
