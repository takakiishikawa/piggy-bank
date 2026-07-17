export interface SavingsMonthRecord {
  month: string; // 'YYYY-MM'
  planned_savings: number;
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
  income: number; // regularIncome + sum(specialIncomes)
  expense: number; // sum(specialExpenses)
  remaining: number; // income - expense
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

export function buildSimulationYear(
  year: number,
  records: SavingsMonthRecord[],
  defaultMonthlyIncome: number,
  specialEntries: SpecialEntry[],
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

    let regularIncome: number;
    if (record) {
      regularIncome = record.planned_savings;
    } else if (isPast) {
      regularIncome = 0;
    } else {
      regularIncome = defaultMonthlyIncome;
    }

    // Only JPY-denominated entries count toward the JPY totals below — VND
    // entries (flagged from VN transactions) are kept in the lists for
    // display but excluded from this math, since summing across currencies
    // without a conversion rate would misstate the total.
    const specialIncomeTotal = specialIncomes
      .filter((e) => e.currency === "JPY")
      .reduce((s, e) => s + e.amount, 0);
    const specialExpenseTotal = specialExpenses
      .filter((e) => e.currency === "JPY")
      .reduce((s, e) => s + e.amount, 0);
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

// VND special expenses (flagged directly from VN transactions) are shown
// for reference — summed separately in their own currency since they're
// excluded from the JPY expense/remaining/cumulative math above.
export function annualSpecialExpenseVnd(months: SimulationMonth[]): number {
  return months.reduce(
    (sum, m) =>
      sum +
      m.specialExpenses
        .filter((e) => e.currency === "VND")
        .reduce((s, e) => s + e.amount, 0),
    0,
  );
}
