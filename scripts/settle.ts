/**
 * Settlement runner: compute the pro-rata CHZ payout per verified identity.
 *
 *   npm run settle -- <slug>       # one match, print CSV to stdout
 *   npm run settle -- season       # whole season
 *   npm run settle -- <slug> --write   # also persist to the payouts table
 *
 * This only computes who is owed what. Sending the CHZ is a separate,
 * human-authorized step against a funded wallet.
 */
import { computeSettlement, recordSettlement, settlementCsv } from "../lib/settlement";

function main() {
  const arg = process.argv[2];
  const write = process.argv.includes("--write");
  if (!arg) {
    console.error("usage: npm run settle -- <slug|season> [--write]");
    process.exit(1);
  }

  const settlement = computeSettlement({ slug: arg === "season" ? undefined : arg });
  const totalChz = settlement.rows.reduce((s, r) => s + r.chz, 0);

  console.error(
    `# ${settlement.scope}: ${settlement.rows.length} payable identities, ` +
      `${settlement.payablePoints.toFixed(2)} points, pool ${settlement.poolChz} CHZ, ` +
      `allocated ${totalChz.toFixed(2)} CHZ`
  );
  console.log(settlementCsv(settlement));

  if (write) {
    const n = recordSettlement(settlement);
    console.error(`# wrote ${n} payout rows (status=computed) to the payouts table`);
  }
}

main();
