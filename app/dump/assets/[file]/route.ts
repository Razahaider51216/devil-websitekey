import { serveDump } from "../../../../lib/dump-delivery";
export const dynamic = "force-dynamic";
export async function GET(req: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (file === "entry.lua") return new Response("Not found", { status: 404 });
  return serveDump(req, file);
}
