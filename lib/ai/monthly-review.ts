import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { VND_PER_JPY } from "@/lib/currency";
import type { Lang } from "@/lib/scenario/dictionary";
import {
  MonthlyReviewCommentSchema,
  nextMonthKey,
  type MonthlyReviewComment,
  type MonthlyReviewSummary,
} from "@/lib/monthly-review";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const yen = (vnd: number) => Math.round(vnd / VND_PER_JPY);

function monthLabel(month: string, lang: Lang): string {
  const m = Number(month.slice(5));
  return lang === "ja"
    ? `${m}月`
    : new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });
}

// 先月の結果から、うまくいったこと・次は気をつけたいこと・来月に向けての
// ひとことを Claude に書かせる。失敗したら null(画面は数字だけで出す)。
export async function generateMonthlyReviewComment(
  summary: MonthlyReviewSummary,
  lang: Lang,
): Promise<MonthlyReviewComment | null> {
  const names = new Set(summary.categories.map((c) => c.name));
  const rows = summary.categories
    .map(
      (c) =>
        `- ${c.name} (${c.isFixed ? "fixed" : "variable"}): budget ¥${yen(c.budget)}, actual ¥${yen(c.actual)}, previous month ¥${yen(c.prevActual)}`,
    )
    .join("\n");
  const nextMonth = monthLabel(nextMonthKey(summary.month), lang);

  const language =
    lang === "ja"
      ? "Japanese. Use a polite, warm tone (です・ます調, e.g. 「〜でした」「〜してみましょう」)"
      : "English. Use a friendly, encouraging tone";

  try {
    const message = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(MonthlyReviewCommentSchema) },
      messages: [
        {
          role: "user",
          content: `You are writing a short monthly look-back for a personal budgeting app used by a Japanese person living in Ho Chi Minh City.
Here are the results for ${monthLabel(summary.month, lang)} compared with each category's budget and with the previous month (${monthLabel(summary.prevMonth, lang)}).

Total: budget ¥${yen(summary.totalBudget)}, actual ¥${yen(summary.totalActual)}, previous month ¥${yen(summary.prevTotalActual)}
Categories:
${rows}

Write:
- "good": up to 3 things that went well (categories that stayed within budget or dropped noticeably from the previous month). Prefer the most meaningful ones by amount.
- "improve": up to 3 things to watch next month (categories over budget or that grew noticeably). Empty if nothing stands out.
- "next": one or two sentences of concrete, gentle advice for ${nextMonth}.

Rules:
- "category" must be exactly one of the category names listed above.
- Each "comment" is one short sentence. Do not write amounts or currency in comments (the app shows the numbers next to them).
- Never blame the user or use words like "overspending" or "failure". Keep it encouraging.
- Write the comments and "next" in ${language}.`,
        },
      ],
    });

    const parsed = message.parsed_output;
    if (!parsed) return null;
    return {
      good: parsed.good.filter((g) => names.has(g.category)).slice(0, 3),
      improve: parsed.improve.filter((g) => names.has(g.category)).slice(0, 3),
      next: parsed.next,
    };
  } catch (error) {
    // 残高切れ・レート制限などは数字だけで表示を続ける(ステータスのみログ)。
    if (error instanceof Anthropic.APIError) {
      console.error(`monthly review: Claude API error ${error.status}`);
    } else {
      console.error("monthly review: failed to generate comment");
    }
    return null;
  }
}
