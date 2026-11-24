import { describe, expect, it } from "vitest";
import { runCase } from "./engine";
import { glenMoor, siteP } from "./fixtures";
import { londonToUtc } from "./time";

describe("london wall clock", () => {
  it("converts British Summer Time and GMT", () => {
    expect(londonToUtc(2022, 5, 1)).toBe(Date.UTC(2022, 3, 30, 23, 0));
    expect(londonToUtc(2022, 5, 14, 6, 0)).toBe(Date.UTC(2022, 4, 14, 5, 0));
    expect(londonToUtc(2022, 5, 15, 1, 20)).toBe(Date.UTC(2022, 4, 15, 0, 20));
    expect(londonToUtc(2022, 11, 21, 6, 0)).toBe(Date.UTC(2022, 10, 21, 6, 0));
    expect(londonToUtc(2022, 10, 1)).toBe(Date.UTC(2022, 8, 30, 23, 0));
  });
});

describe("Glen Moor Q2 2022", () => {
  const contract = runCase(glenMoor, "contract");
  const oem = runCase(glenMoor, "oem");

  it("matches the hand-checked hours and damages", () => {
    expect(contract.periodHours).toBe(2184);
    expect(contract.denominatorHours).toBe(52416);
    expect(contract.forcedHours).toBe(1467.5);
    expect(contract.gridUnverifiedHours).toBe(734);
    expect(contract.gridVerifiedHours).toBe(58);
    expect(contract.maintenanceDeemedHours).toBe(144);
    expect(contract.maintenanceExcessHours).toBe(0);
    expect(contract.unavailableHours).toBe(2201.5);
    expect((contract.availability * 100).toFixed(4)).toBe("95.7999");
    expect(contract.damagesGbp).toBe(27057.59);
    expect(contract.shortfallMwh).toBeCloseTo(375.7998, 3);
  });

  it("reproduces the OEM statement when their grid coding is accepted", () => {
    expect(oem.unavailableHours).toBe(1467.5);
    expect((oem.availability * 100).toFixed(4)).toBe("97.2003");
    expect(oem.damagesGbp).toBe(0);
    expect(Math.abs(oem.availability - glenMoor.oemReported)).toBeLessThan(0.001);
  });

  it("puts the whole variance on the grid finding", () => {
    expect(contract.findings).toHaveLength(1);
    expect(contract.findings[0].hours).toBe(734);
    expect(contract.findings[0].centralGbp).toBe(27057.59);
    expect(contract.findings[0].turbines).toEqual(["T07", "T12", "T19"]);
  });
});

describe("Site P Q4 2022", () => {
  const contract = runCase(siteP, "contract");
  const oem = runCase(siteP, "oem");

  it("uses the 2,209 hour quarter and splits the grid code", () => {
    expect(contract.periodHours).toBe(2209);
    expect(contract.gridUnverifiedHours).toBe(112);
    expect(contract.gridVerifiedHours).toBe(8);
    expect(contract.maintenanceExcessHours).toBe(12);
    expect(contract.maintenanceDeemedHours).toBe(40);
    expect(oem.maintenanceExcessHours).toBe(0);
    expect(oem.gridUnverifiedHours).toBe(0);
    expect(contract.varianceDamagesGbp).toBeGreaterThan(1000);
    expect(contract.findings.reduce((sum, f) => sum + f.centralGbp, 0)).toBe(
      contract.varianceDamagesGbp,
    );
  });
});
