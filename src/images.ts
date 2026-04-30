import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

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
    const ext = path.extname(imagePath);
    const tmpFile = path.join(os.tmpdir(), `picgo_upload_${Date.now()}${ext}`);
    let tmpCreated = false;

    try {
      fs.copyFileSync(imagePath, tmpFile);
      tmpCreated = true;

      const cmd = `curl.exe -s -X POST "${picgoServer}/upload" -F "files=@${tmpFile}" --connect-timeout 10 -m 40`;

      const stdout = execSync(cmd, {
        encoding: "utf-8",
        timeout: 45000,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });

      try {
        const result = JSON.parse(stdout);
        if (result.success && result.result && result.result.length > 0) {
          resolve(result.result[0]);
        } else {
          reject(new Error(result.message || result.msg || "上传失败：空响应"));
        }
      } catch {
        reject(new Error("解析 PicGo 响应失败：" + stdout.slice(0, 200)));
      }
    } catch (e: any) {
      const stderr = e.stderr?.toString() || e.stdout?.toString() || e.message || "";
      reject(new Error(stderr.slice(0, 200)));
    } finally {
      if (tmpCreated) {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      }
    }
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
      errors.push(`找不到图片：${ref.target}（在 ${path.basename(noteAbsPath)} 中）`);
    }
  }

  for (const { ref, absPath } of uploads) {
    try {
      const cdnUrl = await uploadToPicGo(absPath, picgoServer);
      result = result.replace(ref.fullMatch, `![${ref.alt}](${cdnUrl})`);
      uploaded++;
    } catch (e: any) {
      failed++;
      errors.push(`上传失败 ${ref.target}：${e.message}`);
    }
  }

  return { content: result, uploaded, failed, errors };
}
