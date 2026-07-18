export interface SavingsMonthRecord {
  month: string; // 'YYYY-MM'
  planned_savings: number; // manually entered income for the month (JPY)
  note: string | null;
}

export interface SpecialEntry {
  id: string;
  month: string; // 'YYYY-MM'
  kind: "income" | "expense";
  name: string;
  amount: number;
  currency: "JPY" | "VND";
}

export interface SimulationMonth {
  month: string; // 'YYYY-MM'
  year: number;
  monthNum: number; // 1-12
  label: string; // 'Jan', 'Feb', ...
  // Manually entered income (JPY), carried forward from the last month it
  // was explicitly set — income doesn't change every month, only on a raise.
  regularIncome: number;
  specialIncomes: SpecialEntry[];
  specialExpenses: SpecialEntry[];
  income: number; // regularIncome + sum(specialIncomes), JPY
  // Past months: actual VN spend that month. This month: Dashboard's
  // forecast. Future months: Total Monthly Budget. JPY.
  expense: number;
  specialExpenseTotal: number; // sum(specialExpenses), JPY
  remaining: number; // income - expense - specialExpenseTotal, JPY
  note: string | null;
  hasRecord: boolean;
  isCurrentMonth: boolean;
  isFuture: boolean;
  cumulative: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// First year the app tracks savings — years before this never carry a
// balance in, and cumulative carry-in for later years chains forward from here.
export const SIMULATION_EPOCH_YEAR = 2026;

export function monthKey(year: number, monthNum: number): string {
  return `${year}-${String(monthNum).padStart(2, "0")}`;
}

// Converts an entry's own amount into JPY using the given day's rate, so
// JPY and VND entries can be summed together correctly.
function toJpy(amount: number, currency: "JPY" | "VND", vndPerJpy: number): number {
  return currency === "VND" ? amount / vndPerJpy : amount;
}

export function buildSimulationYear(
  year: number,
  records: SavingsMonthRecord[],
  specialEntries: SpecialEntry[],
  vndPerJpy: number,
  // VN-side budget figures (VND) from the Dashboard/Budget pages.
  forecastVnd: number | null,
  lifeBudgetVnd: number,
  // Actual VN spend (VND) already recorded for past months, keyed 'YYYY-MM'.
  actualExpenseByMonth: Record<string, number>,
  now: Date = new Date(),
  startingCumulative = 0,
  startingIncome = 0,
): SimulationMonth[] {
  const byMonth = new Map(records.map((r) => [r.month, r]));
  const incomesByMonth = new Map<string, SpecialEntry[]>();
  const expensesByMonth = new Map<string, SpecialEntry[]>();
  for (const e of specialEntries) {
    const map = e.kind === "income" ? incomesByMonth : expensesByMonth;
    const arr = map.get(e.month);
    if (arr) arr.push(e);
    else map.set(e.month, [e]);
  }

  const currentKey = monthKey(now.getFullYear(), now.getMonth() + 1);

  let cumulative = startingCumulative;
  let lastIncome = startingIncome;
  const months: SimulationMonth[] = [];

  for (let m = 1; m <= 12; m++) {
    const key = monthKey(year, m);
    const record = byMonth.get(key);
    const specialIncomes = incomesByMonth.get(key) ?? [];
    const specialExpenses = expensesByMonth.get(key) ?? [];
    const isFuture = key > currentKey;
    const isCurrentMonth = key === currentKey;
    const isPast = key < currentKey;

    if (record) lastIncome = record.planned_savings;
    const regularIncome = lastIncome;

    // Every month within a tracked year has real data now (income carries
    // forward, expense falls back to actual/forecast/budget) — only years
    // before the epoch are excluded entirely.
    const hasRecord = year >= SIMULATION_EPOCH_YEAR;

    const specialIncomeTotal = specialIncomes.reduce(
      (s, e) => s + toJpy(e.amount, e.currency, vndPerJpy),
      0,
    );
    const specialExpenseTotal = specialExpenses.reduce(
      (s, e) => s + toJpy(e.amount, e.currency, vndPerJpy),
      0,
    );

    let expenseVnd: number;
    if (isCurrentMonth) {
      expenseVnd = forecastVnd ?? lifeBudgetVnd;
    } else if (isFuture) {
      expenseVnd = lifeBudgetVnd;
    } else {
      expenseVnd = actualExpenseByMonth[key] ?? 0;
    }
    const expense = expenseVnd / vndPerJpy;

    const income = regularIncome + specialIncomeTotal;
    const remaining = income - expense - specialExpenseTotal;

    if (hasRecord) {
      cumulative += remaining;
    }

    months.push({
      month: key,
      year,
      monthNum: m,
      label: MONTH_LABELS[m - 1],
      regularIncome,
      specialIncomes,
      specialExpenses,
      income,
      expense,
      specialExpenseTotal,
      remaining,
      note: record?.note ?? null,
      hasRecord,
      isCurrentMonth,
      isFuture,
      cumulative,
    });
  }

  return months;
}

export function annualIncome(months: SimulationMonth[]): number {
  return months.reduce((sum, m) => sum + (m.hasRecord ? m.income : 0), 0);
}

export function annualExpense(months: SimulationMonth[]): number {
  return months.reduce((sum, m) => sum + (m.hasRecord ? m.expense : 0), 0);
}

export function annualSpecialExpense(months: SimulationMonth[]): number {
  return months.reduce((sum, m) => sum + (m.hasRecord ? m.specialExpenseTotal : 0), 0);
}

export function annualRemaining(months: SimulationMonth[]): number {
  return months.reduce((sum, m) => sum + (m.hasRecord ? m.remaining : 0), 0);
}

export function yearEndProjection(months: SimulationMonth[]): number {
  return months[months.length - 1]?.cumulative ?? 0;
}

export function yearEndIncome(months: SimulationMonth[]): number {
  return months[months.length - 1]?.regularIncome ?? 0;
}
