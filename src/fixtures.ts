import type { CaseInput, StatusEvent, Turbine } from "./engine";
import { londonToUtc } from "./time";

const HOUR = 3_600_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function range(count: number, id: (n: number) => string, ratedKw: number): Turbine[] {
  return Array.from({ length: count }, (_, i) => ({ id: id(i + 1), ratedKw }));
}

function fault(
  turbineId: string,
  start: number,
  durationHours: number,
  code: string,
  message: string,
): StatusEvent {
  return {
    id: `${turbineId}-${code}-${start}`,
    turbineId,
    start,
    end: start + durationHours * HOUR,
    kind: "forced",
    code,
    message,
  };
}

const glenFaults: Array<[string, number]> = [
  ["T01", 12.5],
  ["T02", 48],
  ["T03", 31.5],
  ["T05", 66],
  ["T06", 22],
  ["T08", 95.5],
  ["T09", 40],
  ["T10", 18.5],
  ["T11", 57],
  ["T13", 9.5],
  ["T14", 73],
  ["T15", 35],
  ["T16", 44.5],
  ["T17", 61],
  ["T18", 27.5],
  ["T20", 52],
  ["T21", 38],
  ["T22", 80],
  ["T23", 14],
  ["T24", 66],
];

function glenMoorEvents(): StatusEvent[] {
  const events: StatusEvent[] = [];
  const june = londonToUtc(2022, 6, 1);
  for (const [turbineId, durationHours] of glenFaults) {
    events.push(
      fault(
        turbineId,
        june,
        durationHours,
        "NW-FO-01",
        "Forced outage recorded on the status log",
      ),
    );
  }
  for (const turbineId of ["T07", "T12", "T19"]) {
    events.push({
      id: `${turbineId}-gearbox`,
      turbineId,
      start: londonToUtc(2022, 5, 1),
      end: londonToUtc(2022, 5, 9),
      kind: "forced",
      code: "NW-GBX-07",
      message: "Gearbox fault, awaiting parts",
    });
    events.push({
      id: `${turbineId}-grid`,
      turbineId,
      start: londonToUtc(2022, 5, 9),
      end: londonToUtc(2022, 5, 20),
      kind: "grid",
      code: "NW-GRID-01",
      message: "Grid loss, mains failure",
    });
  }
  for (const turbineId of ["T02", "T05", "T09", "T14", "T18", "T22"]) {
    events.push({
      id: `${turbineId}-service`,
      turbineId,
      start: londonToUtc(2022, 4, 14),
      end: londonToUtc(2022, 4, 15),
      kind: "maintenance",
      code: "NW-SM-01",
      message: "Annual service",
    });
  }
  return events;
}

export const glenMoor: CaseInput = {
  id: "glen-moor",
  name: "Glen Moor",
  owner: "Fleet R Wind One Ltd",
  contractor: "Northwind Turbine Services Ltd",
  quarterLabel: "Q2 2022",
  periodStart: londonToUtc(2022, 4, 1),
  periodEnd: londonToUtc(2022, 7, 1),
  turbines: range(24, (n) => `T${pad(n)}`, 2500),
  events: glenMoorEvents(),
  outages: [
    {
      id: "dno-2022-0514",
      reference: "DNO-2022-0514",
      start: londonToUtc(2022, 5, 14, 6, 0),
      end: londonToUtc(2022, 5, 15, 1, 20),
      note: "Planned outage at the site connection. Notice covers the whole site.",
    },
  ],
  guarantee: 0.97,
  pricePerMwh: 72,
  measuredProductionMwh: 30_000,
  allowanceHours: 100,
  oemAllowanceHours: 100,
  oemReported: 0.972,
  capGbp: 108_000,
  stories: [
    {
      start: londonToUtc(2022, 5, 1),
      end: londonToUtc(2022, 5, 20),
      turbineIds: ["T07", "T12", "T19"],
      title: "1 to 20 May, the three turbines that waited on a gearbox",
    },
  ],
  meterNote:
    "Site meter, half-hourly export, summed to 30,000.000 MWh for the quarter. This demonstration does not replay the interval file.",
  settlement: {
    cashGbp: 22_000,
    paidOn: "17 Oct 2022",
    note: "Credit note. The contractor conceded 9 of the 11 disputed days.",
  },
  clauses: [
    {
      id: "grid",
      cite: "Schedule 7.4(a) and 7.14",
      text: "Grid unavailability is time the DNO has notified and the owner has on the outage log. Those notices are conclusive for the periods they cover.",
    },
    {
      id: "damages",
      cite: "Schedule 7.10",
      text: "If availability is below the guarantee, damages are measured production times (guarantee divided by availability, minus one) times the contract price.",
    },
  ],
};

function sitePEvents(): StatusEvent[] {
  return [
    fault("WT01", londonToUtc(2022, 10, 3), 400, "FO-01", "Forced outage, converter"),
    fault("WT02", londonToUtc(2022, 10, 3), 360, "FO-02", "Forced outage, pitch system"),
    fault("WT06", londonToUtc(2022, 10, 20), 280, "FO-06", "Forced outage, generator bearing"),
    {
      id: "WT04-grid",
      turbineId: "WT04",
      start: londonToUtc(2022, 11, 21),
      end: londonToUtc(2022, 11, 26),
      kind: "grid",
      code: "G-01",
      message: "Loss of mains at point of connection",
    },
    {
      id: "WT07-service",
      turbineId: "WT07",
      start: londonToUtc(2022, 11, 8, 7, 0),
      end: londonToUtc(2022, 11, 10, 11, 0),
      kind: "maintenance",
      code: "SM-01",
      message: "Scheduled service",
    },
  ];
}

export const siteP: CaseInput = {
  id: "site-p",
  name: "Site P",
  owner: "Fleet R Wind One Ltd",
  contractor: "Northwind Turbine Services Ltd",
  quarterLabel: "Q4 2022",
  periodStart: londonToUtc(2022, 10, 1),
  periodEnd: londonToUtc(2023, 1, 1),
  turbines: range(14, (n) => `WT${pad(n)}`, 2050),
  events: sitePEvents(),
  outages: [
    {
      id: "dno-2022-1121",
      reference: "DNO-2022-1121",
      start: londonToUtc(2022, 11, 21, 6, 0),
      end: londonToUtc(2022, 11, 21, 14, 0),
      note: "Notified outage, eight hours. The status code runs for five days.",
    },
  ],
  guarantee: 0.97,
  pricePerMwh: 72,
  measuredProductionMwh: 22_000,
  allowanceHours: 40,
  oemAllowanceHours: 120,
  oemReported: 0.9664,
  capGbp: 89_523,
  stories: [
    {
      start: londonToUtc(2022, 11, 21),
      end: londonToUtc(2022, 11, 26),
      turbineIds: ["WT04"],
      title: "21 to 26 November, WT04 coded as grid loss",
    },
    {
      start: londonToUtc(2022, 11, 8, 7, 0),
      end: londonToUtc(2022, 11, 10, 11, 0),
      turbineIds: ["WT07"],
      title: "8 to 10 November, WT07 scheduled service against a 40 hour allowance",
    },
  ],
  meterNote:
    "Site meter total of 22,000.000 MWh supplied with the file. Interval reads are not in this demonstration.",
  clauses: [
    {
      id: "grid",
      cite: "Schedule 7.4(a) and 7.14",
      text: "Grid unavailability is time the DNO has notified. Notices are conclusive for the periods they cover.",
    },
    {
      id: "allowance",
      cite: "Side letter No. 2, paragraph 2",
      text: "From 1 October 2022 the allowed maintenance hours are 40 per turbine per contract year. The OEM statement still applies 120.",
    },
    {
      id: "damages",
      cite: "Schedule 7.10",
      text: "Damages scale measured production by the availability shortfall, at £72 per MWh.",
    },
  ],
};

export const cases: CaseInput[] = [glenMoor, siteP];

export function getCase(id: string): CaseInput | undefined {
  return cases.find((item) => item.id === id);
}
