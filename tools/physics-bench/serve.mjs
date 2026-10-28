import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
};
createServer(async (req, res) => {
  try {
    let p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (p.endsWith("/")) p += "index.html";
    const b = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(8399, () => console.log("on :8399"));
