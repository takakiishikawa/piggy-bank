import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type SubscriptionJudgment = "sub" | "not_sub" | "unknown";

export interface SubscriptionCandidate {
  store: string;
  category: string;
  amount: number;
}

export interface SubscriptionClassification {
  store: string;
  judgment: SubscriptionJudgment;
  reason: string;
}

const BATCH_SIZE = 30;

export async function classifySubscriptionCandidates(
  candidates: SubscriptionCandidate[],
): Promise<SubscriptionClassification[]> {
  if (candidates.length === 0) return [];

  const batches: SubscriptionCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    batches.push(candidates.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const list = batch
        .map(
          (c, i) =>
            `${i + 1}. ${c.store} | Category: ${c.category} | Amount: ${c.amount.toLocaleString()} VND`,
        )
        .join("\n");

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `From this credit card statement of a Japanese resident of Ho Chi Minh City, Vietnam, judge whether each store is a "subscription" (SaaS, fixed-price software, or a monthly recurring service).

[Counts as sub (only when confident)]
Figma, Netflix, Spotify, Adobe, GitHub, ChatGPT/Anthropic/OpenAI, Obsidian, Notion, Dropbox, iCloud, Google One/YouTube Premium, gym monthly membership, phone bill, internet line, cloud storage, video/music streaming, newspaper/magazine subscription

[Counts as not_sub (clearly not a subscription)]
- Supermarkets / grocery stores (Co.op Mart, Vinmart, Bach Hoa Xanh, etc.)
- Restaurants / cafes / bars (Gyumaru, Mutsumian, Starbucks, etc.)
- Apparel / clothing stores (UNIQLO, Zara, etc.)
- Massage parlors / salons (usually pay-per-visit)
- One-off purchases of electronics / furniture / books
- Taxis / ride-hailing services (Grab, etc.)
- Money transfers / bank transfers / ATM
- Rent / utilities (electricity, water, gas)

[Counts as unknown]
- Can't tell from the brand name (unrecognized alphanumeric name, or a Vietnamese company name with an unclear business type)
- Looks SaaS-like but you can't confirm what it actually is

[Rules]
- Always mark unclear stores as unknown. Avoid false positives at all costs
- Even if the same store charges a similar amount regularly, if it's "repeat purchases of goods" or "a regular customer visiting often," mark it not_sub
- If the category is "Dining Out", "Home Cooking", "Fashion", "Massage", "Transport", or "Medical Expenses", mark it not_sub
- Keep the reason under 20 characters

[Candidates]
${list}

Return only a JSON array (no markdown, no code block):
[{"store": "store name (must match input exactly)", "judgment": "sub" | "not_sub" | "unknown", "reason": "reason, under 20 characters"}]`,
          },
        ],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text : "[]";
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      try {
        const parsed = JSON.parse(match[0]) as Array<{
          store: string;
          judgment: string;
          reason?: string;
        }>;
        return parsed
          .filter(
            (p) =>
              p.store &&
              (p.judgment === "sub" ||
                p.judgment === "not_sub" ||
                p.judgment === "unknown"),
          )
          .map<SubscriptionClassification>((p) => ({
            store: p.store,
            judgment: p.judgment as SubscriptionJudgment,
            reason: p.reason ?? "",
          }));
      } catch {
        return [];
      }
    }),
  );

  return results.flat();
}
