import type { Context } from "hono";

export async function serveSkillsHandler(c: Context): Promise<Response> {
  const { readFile } = await import("@zenfs/core/promises");
  const subpath = c.req.path.replace(/^\/skills\//, "");
  const filePath = `/skillfiles/api/${subpath}`;

  try {
    const content = await readFile(filePath, "utf-8");
    return c.text(content, 200, { "Content-Type": "text/markdown; charset=utf-8" });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e) {
      const code = (e as { code: unknown }).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return c.json({ error: "Not found" }, 404);
      }
    }
    throw e;
  }
}
