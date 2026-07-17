export interface SavingsMonthRecord {
  month: string; // 'YYYY-MM'
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
  regularIncome: number;
  specialIncomes: SpecialEntry[];
  specialExpenses: SpecialEntry[];
  income: number; // regularIncome + sum(specialIncomes), JPY
  expense: number; // sum(specialExpenses), JPY
  remaining: number; // income - expense, JPY
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
  defaultMonthlyIncome: number,
  specialEntries: SpecialEntry[],
  vndPerJpy: number,
  now: Date = new Date(),
  startingCumulative = 0,
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
  const months: SimulationMonth[] = [];

  for (let m = 1; m <= 12; m++) {
    const key = monthKey(year, m);
    const record = byMonth.get(key);
    const specialIncomes = incomesByMonth.get(key) ?? [];
    const specialExpenses = expensesByMonth.get(key) ?? [];
    const isFuture = key > currentKey;
    const isCurrentMonth = key === currentKey;
    const isPast = key < currentKey;

    // A month counts once it's been explicitly tracked (a note or a special
    // entry was added), or it's the current/future month (seeded from the
    // default income). Untouched past months are "No data" and excluded.
    const hasRecord =
      !!record || specialIncomes.length > 0 || specialExpenses.length > 0 || !isPast;

    // Regular income always mirrors the current "Regular monthly income"
    // setting for any tracked month — it's a single figure, not something
    // set per month.
    const regularIncome = hasRecord ? defaultMonthlyIncome : 0;

    // Every entry converts into JPY using the day's rate before summing, so
    // VND special expenses (flagged from VN transactions) actually reduce
    // the JPY total instead of being silently excluded from it.
    const specialIncomeTotal = specialIncomes.reduce(
      (s, e) => s + toJpy(e.amount, e.currency, vndPerJpy),
      0,
    );
    const specialExpenseTotal = specialExpenses.reduce(
      (s, e) => s + toJpy(e.amount, e.currency, vndPerJpy),
      0,
    );
    const income = regularIncome + specialIncomeTotal;
    const expense = specialExpenseTotal;
    const remaining = income - expense;

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

export function annualRemaining(months: SimulationMonth[]): number {
  return months.reduce((sum, m) => sum + (m.hasRecord ? m.remaining : 0), 0);
}

export function yearEndProjection(months: SimulationMonth[]): number {
  return months[months.length - 1]?.cumulative ?? 0;
}
