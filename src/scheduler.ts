import { Notice } from "obsidian";
import { DeployItem, Deployer } from "./deployer";
import BlogDeployPlugin from "../main";

export class Scheduler {
  private plugin: BlogDeployPlugin;
  private queue: DeployItem[] = [];
  private timer: NodeJS.Timeout | null = null;
  private statusBarItem: HTMLElement | null = null;
  private remainingSeconds: number = 0;
  private countdownInterval: NodeJS.Timeout | null = null;

  constructor(plugin: BlogDeployPlugin) {
    this.plugin = plugin;
  }

  add(item: DeployItem): void {
    const exists = this.queue.some((q) => q.sourcePath === item.sourcePath);
    if (exists) {
      new Notice(`"${item.title}" is already in the deploy queue`);
      return;
    }
    this.queue.push(item);
    new Notice(`"${item.title}" added to deploy queue (${this.queue.length} pending)`);

    this.resetTimer();
  }

  remove(sourcePath: string): void {
    this.queue = this.queue.filter((q) => q.sourcePath !== sourcePath);
    this.updateStatusBar();
    if (this.queue.length === 0) {
      this.clearTimer();
    }
  }

  getQueue(): DeployItem[] {
    return [...this.queue];
  }

  private resetTimer(): void {
    this.clearTimer();
    const delayMinutes = this.plugin.settings.deployDelayMinutes;
    if (delayMinutes <= 0) {
      this.executeDeploy();
      return;
    }

    this.remainingSeconds = delayMinutes * 60;
    this.updateStatusBar();

    this.countdownInterval = setInterval(() => {
      this.remainingSeconds--;
      this.updateStatusBar();
      if (this.remainingSeconds <= 0) {
        this.clearCountdown();
        this.executeDeploy();
      }
    }, 1000);
  }

  forceDeploy(): void {
    this.clearTimer();
    this.executeDeploy();
  }

  clearQueue(): void {
    this.queue = [];
    this.clearTimer();
    this.updateStatusBar();
    new Notice("Deploy queue cleared");
  }

  private clearTimer(): void {
    this.clearCountdown();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private clearCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) {
      this.statusBarItem = this.plugin.addStatusBarItem();
      this.statusBarItem.addClass("blog-deploy-status");
    }

    if (this.queue.length === 0) {
      this.statusBarItem.setText("");
      this.statusBarItem.style.display = "none";
    } else {
      const mins = Math.floor(this.remainingSeconds / 60);
      const secs = this.remainingSeconds % 60;
      const timeStr = `${mins}:${String(secs).padStart(2, "0")}`;
      this.statusBarItem.setText(`⏳ ${this.queue.length} note(s) pending | Deploy in ${timeStr}`);
      this.statusBarItem.style.display = "";
    }
  }

  private async executeDeploy(): Promise<void> {
    if (this.queue.length === 0) return;

    const items = [...this.queue];
    this.queue = [];
    this.clearTimer();
    this.updateStatusBar();

    new Notice(`Deploying ${items.length} note(s) to blog...`);

    const vaultRoot = (this.plugin.app.vault.adapter as any).getBasePath?.() ?? "";

    const deployer = new Deployer(
      this.plugin.settings.blogPath,
      this.plugin.settings.postsSubdir,
      this.plugin.settings.topImg,
      this.plugin.settings.comments,
      this.plugin.settings.commitTemplate,
      vaultRoot
    );

    const result = deployer.deployAll(items, this.plugin.settings.autoPush);

    if (result.success) {
      new Notice(`✅ ${result.message}`);
    } else {
      new Notice(`❌ ${result.message}`);
    }
  }
}
