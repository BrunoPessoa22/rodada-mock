import { getPot } from "@/lib/pot";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getPot());
}
