/**
 * CLI CEX-volume runner: `npm run cex -- <slug>` refreshes one match's venue
 * volume; with no argument it refreshes every match currently due, then prints
 * the stored per-venue totals.
 */
import { refreshCexVolume, refreshDueCexVolume } from "../lib/cex";
import { getCexVolume, getMatchBySlug, getOnchainVolume } from "../lib/queries";
import { getDb } from "../lib/db";

async function main() {
  const slug = process.argv[2];
  if (slug) {
    const match = getMatchBySlug(slug);
    if (!match) {
      console.error(`match not found: ${slug}`);
      process.exit(1);
    }
    await refreshCexVolume(match);
    console.log(JSON.stringify({ slug, onchainUsd: getOnchainVolume(match.id), venues: getCexVolume(match.id) }));
  } else {
    await refreshDueCexVolume();
    const matches = getDb().prepare("SELECT id, slug FROM matches").all() as { id: number; slug: string }[];
    for (const m of matches) {
      const venues = getCexVolume(m.id);
      if (venues.length > 0) console.log(JSON.stringify({ slug: m.slug, venues }));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
