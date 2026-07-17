// Static fallback used only if the live rate fetch fails (e.g. offline dev,
// upstream outage) so the simulation never breaks entirely.
const FALLBACK_VND_PER_JPY = 165;

// Today's JPY -> VND rate, cached for 24h via Next's fetch cache (the free
// open.er-api.com feed updates roughly daily, so re-fetching more often
// wouldn't gain accuracy).
export async function getJpyToVndRate(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/JPY", {
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`exchange rate fetch failed: ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.VND;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("exchange rate response missing a usable VND rate");
    }
    return rate;
  } catch (err) {
    console.error("[exchange-rate] Falling back to static JPY->VND rate:", err);
    return FALLBACK_VND_PER_JPY;
  }
}
