/**
 * CLI scoring runner: `npm run score -- <slug>` scores one match window;
 * with no argument it scores everything currently due.
 */
import { scoreDueMatches, scoreMatch } from "../lib/indexer";

async function main() {
  const slug = process.argv[2];
  if (slug) {
    const result = await scoreMatch(slug);
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } else {
    await scoreDueMatches();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
