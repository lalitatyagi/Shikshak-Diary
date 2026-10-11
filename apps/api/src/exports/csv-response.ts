import type { FastifyReply } from "fastify";

/** Send a CSV attachment with a UTF-8 BOM so Excel opens Hindi/names correctly. */
export function sendCsvAttachment(
  reply: FastifyReply,
  filename: string,
  csv: string,
): FastifyReply {
  const safeName = filename.replace(/[^\w.-]+/g, "_");
  return reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header(
      "Content-Disposition",
      `attachment; filename="${safeName}"`,
    )
    .send("\uFEFF" + csv);
}
