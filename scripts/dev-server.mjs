import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const nestedRoot = resolve(projectRoot, "archacre-minimal");
const launchDirectory = process.env.INIT_CWD ?? projectRoot;

function containsPath(directory, file) {
  const pathname = relative(directory, file);
  return pathname !== ".." && !pathname.startsWith(`..${sep}`) && !isAbsolute(pathname);
}

const siteRoot = containsPath(nestedRoot, launchDirectory) ? nestedRoot : projectRoot;
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 5173);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("PORT must be a number from 0 to 65535.");
  process.exit(1);
}

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
]);

function sendText(response, status, message, headers = {}) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  response.end(`${message}\n`);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  } catch {
    sendText(response, 400, "Invalid URL");
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const file = resolve(siteRoot, `.${pathname}`);
  const contentType = contentTypes.get(extname(pathname).toLowerCase());
  const isSiteFile = /^\/[^/]+\.html$/i.test(pathname) || pathname.startsWith("/assets/");

  if (!isSiteFile || !contentType || !containsPath(siteRoot, file) || /[\\:\0]/.test(pathname)) {
    sendText(response, 404, "File not found");
    return;
  }

  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "Content-Length": body.length,
    });
    response.end(body);
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code)) {
      sendText(response, 404, "File not found");
    } else {
      console.error(error.message);
      sendText(response, 500, "Could not read the file");
    }
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the other server or set PORT to a different port.`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Serving ${siteRoot}`);
  console.log(`Open http://localhost:${server.address().port}/`);
});
