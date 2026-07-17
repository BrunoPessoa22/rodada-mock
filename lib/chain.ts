import { createPublicClient, http, parseAbi, type PublicClient } from "viem";
import { chiliz } from "viem/chains";
import { RPC_URL } from "./config";

export const UNIV2_ABI = parseAbi([
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]);

let client: PublicClient | null = null;

export function getClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: chiliz,
      transport: http(RPC_URL, {
        retryCount: 3,
        retryDelay: 400,
        timeout: 15_000,
        // rpc.chiliz.com filters some default user agents (403s python urllib).
        fetchOptions: { headers: { "User-Agent": "rodada-league/0.4" } },
      }),
    });
  }
  return client;
}

/** Binary-search the block whose timestamp is closest at-or-after `tsSeconds`. */
export async function findBlockByTimestamp(tsSeconds: number): Promise<bigint> {
  const c = getClient();
  const latest = await c.getBlock();
  if (Number(latest.timestamp) <= tsSeconds) return latest.number;

  let lo = 1n;
  let hi = latest.number;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const block = await c.getBlock({ blockNumber: mid });
    if (Number(block.timestamp) < tsSeconds) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}
