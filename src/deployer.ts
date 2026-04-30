import * as path from "path";
import * as fs from "fs";
import {
  Frontmatter,
  parseFrontmatter,
  generateFrontmatterString,
  generateFrontmatter,
  extractTitleFromContent,
  extractTagsFromPath,
} from "./frontmatter";
import { GitOperator } from "./git";
import { processImages } from "./images";

export interface DeployItem {
  sourcePath: string;
  destPath: string;
  title: string;
  tags: string;
  fileName: string;
  processImages: boolean;
}

export interface DeployResult {
  success: boolean;
  message: string;
  count: number;
  imagesUploaded: number;
  imagesFailed: number;
  imageErrors: string[];
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function computeSubfolder(tags: string): string {
  const firstTag = tags.split(",")[0]?.trim();
  if (!firstTag) return "未分类";
  const sanitized = sanitizeFolderName(firstTag);
  return sanitized || "未分类";
}

function collectTagsFromFile(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    if (frontmatter?.tags) {
      return frontmatter.tags.toString().split(",").map((t: string) => t.trim()).filter(Boolean);
    }
  } catch {
    // skip unreadable files
  }
  return [];
}

export class Deployer {
  private blogPath: string;
  private postsSubdir: string;
  private vaultRoot: string;
  private git: GitOperator | null;
  private topImg: string;
  private comments: boolean;
  private commitTemplate: string;
  private picgoServer: string;

  constructor(
    blogPath: string,
    postsSubdir: string,
    topImg: string,
    comments: boolean,
    commitTemplate: string,
    vaultRoot: string,
    picgoServer: string
  ) {
    this.blogPath = blogPath;
    this.postsSubdir = postsSubdir;
    this.topImg = topImg;
    this.comments = comments;
    this.commitTemplate = commitTemplate;
    this.vaultRoot = vaultRoot;
    this.picgoServer = picgoServer;
    this.git = null;
  }

  get postsPath(): string {
    return path.join(this.blogPath, this.postsSubdir);
  }

  getExistingTags(): string[] {
    const tagSet = new Set<string>();
    try {
      const walkDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            const tags = collectTagsFromFile(fullPath);
            for (const t of tags) {
              tagSet.add(t);
            }
          }
        }
      };
      walkDir(this.postsPath);
    } catch {
      // ignore
    }
    return [...tagSet].sort();
  }

  initGit(): GitOperator {
    this.git = new GitOperator(this.blogPath);
    return this.git;
  }

  getGit(): GitOperator | null {
    return this.git;
  }

  readFile(filePath: string): string {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(this.vaultRoot, filePath);
    return fs.readFileSync(absPath, "utf-8");
  }

  prepareItem(relativePath: string): DeployItem | null {
    const absSourcePath = path.join(this.vaultRoot, relativePath);
    const content = this.readFile(absSourcePath);
    const fileName = path.basename(relativePath);

    const { frontmatter } = parseFrontmatter(content);
    const title =
      frontmatter?.title || extractTitleFromContent(content) || path.parse(fileName).name;
    const autoTags = extractTagsFromPath(relativePath);

    let tags = frontmatter?.tags || "";
    if (autoTags && !tags) {
      tags = autoTags;
    } else if (autoTags && tags) {
      const tagSet = new Set([...tags.split(",").map((t) => t.trim()), ...autoTags.split(",").map((t) => t.trim())]);
      tags = [...tagSet].filter(Boolean).join(", ");
    }

    const subfolder = computeSubfolder(tags);
    const destPath = path.join(this.postsPath, subfolder, fileName);

    return { sourcePath: absSourcePath, destPath, title, tags, fileName, processImages: true };
  }

  async deployItem(item: DeployItem): Promise<{
    dest: string;
    imagesUploaded: number;
    imagesFailed: number;
    imageErrors: string[];
  }> {
    const content = this.readFile(item.sourcePath);
    const { body } = parseFrontmatter(content);

    let processedBody = body;
    let imagesUploaded = 0;
    let imagesFailed = 0;
    const imageErrors: string[] = [];

    if (item.processImages) {
      const result = await processImages(body, item.sourcePath, this.vaultRoot, this.picgoServer);
      processedBody = result.content;
      imagesUploaded = result.uploaded;
      imagesFailed = result.failed;
      imageErrors.push(...result.errors);
    }

    const fm = generateFrontmatter(item.title, item.tags, this.topImg, this.comments);
    const fmStr = generateFrontmatterString(fm);
    const newContent = fmStr + processedBody;

    const destDir = path.dirname(item.destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(item.destPath, newContent, "utf-8");
    return { dest: item.destPath, imagesUploaded, imagesFailed, imageErrors };
  }

  async deployAll(items: DeployItem[], pushToGit: boolean): Promise<DeployResult> {
    const git = this.initGit();

    if (!git.isRepo()) {
      return { success: false, message: "博客路径不是一个 Git 仓库", count: 0, imagesUploaded: 0, imagesFailed: 0, imageErrors: [] };
    }

    if (!fs.existsSync(this.postsPath)) {
      return { success: false, message: `文章目录不存在：${this.postsPath}`, count: 0, imagesUploaded: 0, imagesFailed: 0, imageErrors: [] };
    }

    const deployed: string[] = [];
    let totalUploaded = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    for (const item of items) {
      try {
        const { dest, imagesUploaded, imagesFailed, imageErrors } = await this.deployItem(item);
        deployed.push(dest);
        totalUploaded += imagesUploaded;
        totalFailed += imagesFailed;
        allErrors.push(...imageErrors);
      } catch (e: any) {
        return { success: false, message: `写入 ${item.fileName} 失败：${e.message}`, count: deployed.length, imagesUploaded: totalUploaded, imagesFailed: totalFailed, imageErrors: allErrors };
      }
    }

    if (deployed.length === 0) {
      return { success: false, message: "没有文件被部署", count: 0, imagesUploaded: 0, imagesFailed: 0, imageErrors: [] };
    }

    let msg = `成功部署 ${deployed.length} 篇笔记`;
    if (totalUploaded > 0) {
      msg += ` | 🖼️ ${totalUploaded} 张图片已上传`;
    }
    if (totalFailed > 0) {
      msg += ` | ⚠️ ${totalFailed} 张失败`;
    }

    if (pushToGit) {
      const relativePaths = deployed.map((d) => path.relative(this.blogPath, d));
      const added = git.add(relativePaths);
      if (!added) {
        return { success: false, message: "git add 失败", count: deployed.length, imagesUploaded: totalUploaded, imagesFailed: totalFailed, imageErrors: allErrors };
      }

      const title = items.map((i) => i.title).join(", ");
      const commitMsg = git.getCommitMessageTemplate(this.commitTemplate, title);
      git.commit(commitMsg);

      const pushResult = git.push();
      if (!pushResult.success) {
        return {
          success: false,
          message: `${msg}，但 git push 失败：${pushResult.message}`,
          count: deployed.length,
          imagesUploaded: totalUploaded,
          imagesFailed: totalFailed,
          imageErrors: allErrors,
        };
      }

      msg += "，已推送至 GitHub";
    }

    return { success: true, message: msg, count: deployed.length, imagesUploaded: totalUploaded, imagesFailed: totalFailed, imageErrors: allErrors };
  }
}
