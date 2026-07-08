export function formatVND(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₫";
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function formatDateWithYear(date: string | Date): string {
  const d = new Date(date);
  const dow = DOW[d.getDay()];
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${dow}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
