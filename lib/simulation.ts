export interface SavingsMonthRecord {
  month: string; // 'YYYY-MM'
  planned_savings: number;
  actual_savings: number | null;
}

export interface SimulationMonth {
  month: string; // 'YYYY-MM'
  year: number;
  monthNum: number; // 1-12
  label: string; // 'Jan', 'Feb', ...
  planned: number;
  actual: number | null;
  hasRecord: boolean;
  isCurrentMonth: boolean;
  isFuture: boolean;
  cumulative: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthKey(year: number, monthNum: number): string {
  return `${year}-${String(monthNum).padStart(2, "0")}`;
}

export function buildSimulationYear(
  year: number,
  records: SavingsMonthRecord[],
  defaultMonthlyIncome: number,
  now: Date = new Date(),
): SimulationMonth[] {
  const byMonth = new Map(records.map((r) => [r.month, r]));
  const currentKey = monthKey(now.getFullYear(), now.getMonth() + 1);

  let cumulative = 0;
  const months: SimulationMonth[] = [];

  for (let m = 1; m <= 12; m++) {
    const key = monthKey(year, m);
    const record = byMonth.get(key);
    const isFuture = key > currentKey;
    const isCurrentMonth = key === currentKey;
    const isPast = key < currentKey;

    let hasRecord: boolean;
    let planned: number;
    let actual: number | null;

    if (record) {
      hasRecord = true;
      planned = record.planned_savings;
      actual = record.actual_savings;
    } else if (isPast) {
      // Never tracked before this feature existed — no plan to speak of.
      hasRecord = false;
      planned = 0;
      actual = null;
    } else {
      // Current/future month with no override yet: seed from default income.
      hasRecord = true;
      planned = defaultMonthlyIncome;
      actual = null;
    }

    if (hasRecord) {
      cumulative += actual ?? planned;
    }

    months.push({
      month: key,
      year,
      monthNum: m,
      label: MONTH_LABELS[m - 1],
      planned,
      actual,
      hasRecord,
      isCurrentMonth,
      isFuture,
      cumulative,
    });
  }

  return months;
}

export function annualTarget(months: SimulationMonth[]): number {
  return months.reduce((sum, m) => sum + (m.hasRecord ? m.planned : 0), 0);
}

export function yearEndProjection(months: SimulationMonth[]): number {
  return months[months.length - 1]?.cumulative ?? 0;
}
