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
      new Notice(`"${item.title}" 已在部署队列中`);
      return;
    }
    this.queue.push(item);
    new Notice(`"${item.title}" 已加入队列（共 ${this.queue.length} 篇待处理）`);

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
    new Notice("部署队列已清空");
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
      this.statusBarItem.style.cursor = "default";
    }

    if (this.queue.length === 0) {
      this.statusBarItem.setText("");
      this.statusBarItem.style.display = "none";
    } else {
      this.statusBarItem.empty();

      const mins = Math.floor(this.remainingSeconds / 60);
      const secs = this.remainingSeconds % 60;
      const timeStr = `${mins}:${String(secs).padStart(2, "0")}`;

      const label = this.statusBarItem.createSpan({
        text: `⏳ ${this.queue.length} 篇待部署 | 剩余 ${timeStr}`,
      });

      const forceBtn = this.statusBarItem.createEl("a", {
        text: "立即推送",
        cls: "blog-deploy-status-btn",
      });
      forceBtn.style.cssText = "margin-left:8px;cursor:pointer;color:var(--text-accent);";
      forceBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.forceDeploy();
      };

      const cancelBtn = this.statusBarItem.createEl("a", {
        text: "取消全部",
        cls: "blog-deploy-status-btn",
      });
      cancelBtn.style.cssText = "margin-left:4px;cursor:pointer;color:var(--text-error);";
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.clearQueue();
      };

      this.statusBarItem.style.display = "";
    }
  }

  private async executeDeploy(): Promise<void> {
    if (this.queue.length === 0) return;

    const items = [...this.queue];
    this.queue = [];
    this.clearTimer();
    this.updateStatusBar();

    new Notice(`正在部署 ${items.length} 篇笔记到博客...`);

    const vaultRoot = (this.plugin.app.vault.adapter as any).getBasePath?.() ?? "";

    const deployer = new Deployer(
      this.plugin.settings.blogPath,
      this.plugin.settings.postsSubdir,
      this.plugin.settings.topImg,
      this.plugin.settings.comments,
      this.plugin.settings.commitTemplate,
      vaultRoot,
      this.plugin.settings.picgoServer
    );

    const result = await deployer.deployAll(items, this.plugin.settings.autoPush);

    if (result.success) {
      new Notice(`✅ ${result.message}`);
    } else {
      new Notice(`❌ ${result.message}`);
    }

    if (result.imageErrors.length > 0) {
      const errSummary = result.imageErrors.slice(0, 3).join("; ");
      const more = result.imageErrors.length > 3 ? `（还有 ${result.imageErrors.length - 3} 个错误）` : "";
      new Notice(`⚠️ 图片问题：${errSummary}${more}`, 8000);
    }
  }
}
