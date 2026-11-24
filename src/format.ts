export function pct(fraction: number, digits = 4): string {
  return `${(fraction * 100).toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function gbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

export function mwh(value: number): string {
  return `${value.toLocaleString("en-GB", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })} MWh`;
}

export function hrs(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded.toLocaleString("en-GB", { maximumFractionDigits: 4 });
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
