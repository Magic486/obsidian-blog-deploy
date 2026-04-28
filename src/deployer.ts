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
    const destPath = path.join(this.postsPath, fileName);

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

    fs.writeFileSync(item.destPath, newContent, "utf-8");
    return { dest: item.destPath, imagesUploaded, imagesFailed, imageErrors };
  }

  async deployAll(items: DeployItem[], pushToGit: boolean): Promise<DeployResult> {
    const git = this.initGit();

    if (!git.isRepo()) {
      return { success: false, message: "Blog path is not a git repository", count: 0, imagesUploaded: 0, imagesFailed: 0, imageErrors: [] };
    }

    if (!fs.existsSync(this.postsPath)) {
      return { success: false, message: `Posts directory not found: ${this.postsPath}`, count: 0, imagesUploaded: 0, imagesFailed: 0, imageErrors: [] };
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
        return { success: false, message: `Failed to write ${item.fileName}: ${e.message}`, count: deployed.length, imagesUploaded: totalUploaded, imagesFailed: totalFailed, imageErrors: allErrors };
      }
    }

    if (deployed.length === 0) {
      return { success: false, message: "No files deployed", count: 0, imagesUploaded: 0, imagesFailed: 0, imageErrors: [] };
    }

    let msg = `Deployed ${deployed.length} note(s)`;
    if (totalUploaded > 0) {
      msg += ` | 🖼️ ${totalUploaded} image(s) uploaded`;
    }
    if (totalFailed > 0) {
      msg += ` | ⚠️ ${totalFailed} failed`;
    }

    if (pushToGit) {
      const relativePaths = deployed.map((d) => path.relative(this.blogPath, d));
      const added = git.add(relativePaths);
      if (!added) {
        return { success: false, message: "git add failed", count: deployed.length, imagesUploaded: totalUploaded, imagesFailed: totalFailed, imageErrors: allErrors };
      }

      const title = items.map((i) => i.title).join(", ");
      const commitMsg = git.getCommitMessageTemplate(this.commitTemplate, title);
      git.commit(commitMsg);

      const pushResult = git.push();
      if (!pushResult.success) {
        return {
          success: false,
          message: `${msg} but git push failed: ${pushResult.message}`,
          count: deployed.length,
          imagesUploaded: totalUploaded,
          imagesFailed: totalFailed,
          imageErrors: allErrors,
        };
      }

      msg += " and pushed to GitHub";
    }

    return { success: true, message: msg, count: deployed.length, imagesUploaded: totalUploaded, imagesFailed: totalFailed, imageErrors: allErrors };
  }
}
