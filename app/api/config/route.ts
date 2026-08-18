export const dynamic = "force-dynamic";

/**
 * Public client config, read at RUNTIME. The WalletConnect project id is a
 * public value (it ships in every WC frontend), but serving it here instead of
 * inlining NEXT_PUBLIC_* at build time means enabling/rotating it is a Coolify
 * env change + restart — no image rebuild, no build-arg plumbing.
 */
export async function GET() {
  return Response.json({
    wcProjectId: process.env.WC_PROJECT_ID ?? process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "",
  });
}
