import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";

export interface ImageRef {
  fullMatch: string;
  alt: string;
  target: string;
  isWikilink: boolean;
  isRemote: boolean;
}

export function extractImageRefs(content: string): ImageRef[] {
  const refs: ImageRef[] = [];
  const seen = new Set<string>();

  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdRegex.exec(content)) !== null) {
    const target = match[2];
    if (seen.has(target)) continue;
    seen.add(target);
    refs.push({
      fullMatch: match[0],
      alt: match[1],
      target,
      isWikilink: false,
      isRemote: /^https?:\/\//i.test(target),
    });
  }

  const wikiRegex = /!\[\[([^\]]+)\]\]/g;
  while ((match = wikiRegex.exec(content)) !== null) {
    const target = match[1];
    if (seen.has(target)) continue;
    seen.add(target);
    refs.push({
      fullMatch: match[0],
      alt: target.replace(/\.[^.]+$/, ""),
      target,
      isWikilink: true,
      isRemote: false,
    });
  }

  return refs;
}

function resolveWikilink(target: string, noteDir: string, vaultRoot: string): string | null {
  const cleanTarget = target.split("|")[0].trim();
  const searchPaths = [
    path.join(noteDir, cleanTarget),
    path.join(vaultRoot, cleanTarget),
    path.join(vaultRoot, "assets", cleanTarget),
    path.join(vaultRoot, "img", cleanTarget),
  ];

  const imgDirs = findImageDirs(noteDir);
  for (const dir of imgDirs) {
    searchPaths.push(path.join(dir, cleanTarget));
  }
  for (const dir of findImageDirs(vaultRoot)) {
    searchPaths.push(path.join(dir, cleanTarget));
  }

  for (const p of searchPaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findImageDirs(baseDir: string): string[] {
  const dirs: string[] = [];
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(path.join(baseDir, entry.name));
      }
    }
  } catch {
    // ignore
  }
  return dirs;
}

export function resolveImagePath(
  target: string,
  isWikilink: boolean,
  noteDir: string,
  vaultRoot: string
): string | null {
  if (path.isAbsolute(target)) {
    return fs.existsSync(target) ? target : null;
  }

  if (isWikilink) {
    return resolveWikilink(target, noteDir, vaultRoot);
  }

  const decoded = decodeURIComponent(target);
  const resolved = path.resolve(noteDir, decoded);
  if (fs.existsSync(resolved)) return resolved;

  const vaultResolved = path.resolve(vaultRoot, decoded);
  if (fs.existsSync(vaultResolved)) return vaultResolved;

  return null;
}

export async function uploadToPicGo(
  imagePath: string,
  picgoServer: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
    };
    const mimeType = mimeTypes[ext] || "image/png";

    const boundary = `----PicGo${Date.now()}`;
    const bodyStart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
    const requestBody = Buffer.concat([bodyStart, fileData, bodyEnd]);

    const url = new URL(picgoServer);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 36677,
      path: "/upload",
      method: "POST",
      timeout: 30000,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(requestBody.length),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (result.success && result.result && result.result.length > 0) {
            resolve(result.result[0]);
          } else {
            reject(new Error(result.message || result.msg || "Upload failed"));
          }
        } catch {
          reject(new Error("Failed to parse PicGo response: " + data.slice(0, 200)));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("PicGo upload timed out (30s)"));
    });

    req.on("error", (err) => {
      reject(new Error(`Cannot connect to PicGo at ${url.hostname}:${url.port} — is PicGo running? (${err.message})`));
    });

    req.write(requestBody);
    req.end();
  });
}

export async function processImages(
  content: string,
  noteAbsPath: string,
  vaultRoot: string,
  picgoServer: string
): Promise<{ content: string; uploaded: number; failed: number; errors: string[] }> {
  const refs = extractImageRefs(content);
  const localRefs = refs.filter((r) => !r.isRemote);

  if (localRefs.length === 0) {
    return { content, uploaded: 0, failed: 0, errors: [] };
  }

  const noteDir = path.dirname(noteAbsPath);
  let result = content;
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  const uploads: Array<{ ref: ImageRef; absPath: string }> = [];

  for (const ref of localRefs) {
    const absPath = resolveImagePath(ref.target, ref.isWikilink, noteDir, vaultRoot);
    if (absPath) {
      uploads.push({ ref, absPath });
    } else {
      failed++;
      errors.push(`Image not found: ${ref.target} in ${path.basename(noteAbsPath)}`);
    }
  }

  for (const { ref, absPath } of uploads) {
    try {
      const cdnUrl = await uploadToPicGo(absPath, picgoServer);
      result = result.replace(ref.fullMatch, `![${ref.alt}](${cdnUrl})`);
      uploaded++;
    } catch (e: any) {
      failed++;
      errors.push(`Upload failed for ${ref.target}: ${e.message}`);
    }
  }

  return { content: result, uploaded, failed, errors };
}
