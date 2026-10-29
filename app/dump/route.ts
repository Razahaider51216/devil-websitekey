import { serveDump } from "../../lib/dump-delivery";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { return serveDump(req, "entry.lua"); }
