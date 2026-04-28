import { execSync, ExecSyncOptions } from "child_process";
import * as path from "path";

export class GitOperator {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  private exec(cmd: string): { stdout: string; stderr: string } {
    const options: ExecSyncOptions = {
      cwd: this.repoPath,
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    };
    try {
      const stdout = execSync(cmd, options);
      return { stdout: stdout.toString().trim(), stderr: "" };
    } catch (e: any) {
      return {
        stdout: e.stdout?.toString().trim() || "",
        stderr: e.stderr?.toString().trim() || e.message,
      };
    }
  }

  isRepo(): boolean {
    const dir = path.resolve(this.repoPath);
    const dotGit = path.join(dir, ".git");
    try {
      require("fs").statSync(dotGit);
      return true;
    } catch {
      return false;
    }
  }

  hasUnsavedChanges(): boolean {
    const { stdout } = this.exec("git status --porcelain");
    return stdout.length > 0;
  }

  add(files: string[]): boolean {
    const fileArgs = files.map((f) => `"${f}"`).join(" ");
    const { stderr } = this.exec(`git add ${fileArgs}`);
    if (stderr) {
      console.error("git add error:", stderr);
      return false;
    }
    return true;
  }

  commit(message: string): boolean {
    const { stderr } = this.exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    if (stderr && !stderr.includes("nothing to commit") && !stderr.includes("nothing added")) {
      console.error("git commit error:", stderr);
      return false;
    }
    return true;
  }

  push(branch: string = "main"): { success: boolean; message: string } {
    const { stdout, stderr } = this.exec(`git push origin ${branch}`);
    if (stderr && stderr.includes("error")) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout || "Pushed successfully" };
  }

  getCurrentBranch(): string {
    const { stdout } = this.exec("git rev-parse --abbrev-ref HEAD");
    return stdout || "main";
  }

  getCommitMessageTemplate(template: string, title: string): string {
    return template.replace("{{title}}", title);
  }
}
