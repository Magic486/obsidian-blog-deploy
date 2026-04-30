import {
  App,
  Menu,
  Modal,
  Notice,
  Plugin,
  TAbstractFile,
  TFolder,
  TFile,
} from "obsidian";
import {
  BlogDeploySettings,
  BlogDeploySettingTab,
  DEFAULT_SETTINGS,
} from "./src/settings";
import { DeployItem, Deployer } from "./src/deployer";
import { Scheduler } from "./src/scheduler";

export default class BlogDeployPlugin extends Plugin {
  settings!: BlogDeploySettings;
  scheduler!: Scheduler;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.scheduler = new Scheduler(this);

    this.addSettingTab(new BlogDeploySettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("📤 部署到博客")
              .setIcon("send")
              .onClick(() => {
                this.showDeployDialog(file);
              });
          });
        }
      })
    );

    this.addCommand({
      id: "deploy-to-blog",
      name: "部署当前笔记到博客",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "md") {
          if (!checking) {
            this.showDeployDialog(file);
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "deploy-now",
      name: "立即部署队列中的所有笔记",
      callback: () => {
        this.scheduler.forceDeploy();
      },
    });

    this.addCommand({
      id: "clear-queue",
      name: "清空部署队列",
      callback: () => {
        this.scheduler.clearQueue();
      },
    });

    this.addCommand({
      id: "show-queue",
      name: "查看部署队列",
      callback: () => {
        const queue = this.scheduler.getQueue();
        if (queue.length === 0) {
          new Notice("部署队列为空");
        } else {
          const names = queue.map((q) => `- ${q.title}`).join("\n");
          new Notice(`部署队列（${queue.length} 篇）：\n${names}`, 8000);
        }
      },
    });
  }

  onunload(): void {
    // Cleanup handled by Obsidian automatically
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private showDeployDialog(file: TFile): void {
    const vaultRoot = (this.app.vault.adapter as any).getBasePath?.() ?? "";
    if (!vaultRoot) {
      new Notice("❌ 获取 vault 根路径失败");
      return;
    }

    let item: DeployItem | null = null;
    let existingTags: string[] = [];
    try {
      const deployer = new Deployer(
        this.settings.blogPath,
        this.settings.postsSubdir,
        this.settings.topImg,
        this.settings.comments,
        this.settings.commitTemplate,
        vaultRoot,
        this.settings.picgoServer
      );
      item = deployer.prepareItem(file.path);
      existingTags = deployer.getExistingTags();
    } catch (e: any) {
      new Notice(`❌ 读取文件出错：${e.message}`);
      return;
    }

    if (!item) {
      new Notice("❌ 准备部署项失败");
      return;
    }

    new DeployConfirmModal(this.app, item, existingTags, (confirmedItem) => {
      if (confirmedItem) {
        this.scheduler.add(confirmedItem);
      }
    }).open();
  }
}

class DeployConfirmModal extends Modal {
  private item: DeployItem;
  private existingTags: string[];
  private onSubmit: (item: DeployItem | null) => void;
  private titleInput: HTMLInputElement;
  private tagsInput: HTMLInputElement;
  private processImagesCheckbox: HTMLInputElement;
  private destHint: HTMLElement;

  constructor(app: App, item: DeployItem, existingTags: string[], onSubmit: (item: DeployItem | null) => void) {
    super(app);
    this.item = item;
    this.existingTags = existingTags;
    this.onSubmit = onSubmit;
    this.titleInput = document.createElement("input");
    this.tagsInput = document.createElement("input");
    this.processImagesCheckbox = document.createElement("input");
    this.destHint = document.createElement("p");
  }

  private updateDestHint(): void {
    const tags = this.tagsInput.value.trim() || this.item.tags;
    const subfolder = tags.split(",")[0]?.trim() || "未分类";
    const sanitized = subfolder.replace(/[\\/:*?"<>|]/g, "_").trim() || "未分类";
    this.destHint.setText(`目标位置：source/_posts/${sanitized}/${this.item.fileName}`);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.addClass("blog-deploy-modal");
    contentEl.createEl("h2", { text: "📤 部署到博客" });

    contentEl.createEl("p", {
      text: `文件：${this.item.fileName}`,
      cls: "blog-deploy-file",
    });

    const titleSetting = contentEl.createDiv();
    titleSetting.createEl("label", { text: "标题" });
    this.titleInput = titleSetting.createEl("input", {
      type: "text",
      value: this.item.title,
    });
    this.titleInput.style.width = "100%";
    this.titleInput.style.marginBottom = "12px";

    const tagsSetting = contentEl.createDiv();
    tagsSetting.createEl("label", { text: "标签（逗号分隔）" });
    this.tagsInput = tagsSetting.createEl("input", {
      type: "text",
      value: this.item.tags,
      placeholder: "例如：Java, 笔记",
    });
    this.tagsInput.style.width = "100%";
    this.tagsInput.style.marginBottom = "6px";
    this.tagsInput.oninput = () => this.updateDestHint();

    if (this.existingTags.length > 0) {
      const chipRow = tagsSetting.createDiv();
      chipRow.style.display = "flex";
      chipRow.style.flexWrap = "wrap";
      chipRow.style.gap = "4px";
      chipRow.style.marginBottom = "12px";

      chipRow.createEl("span", {
        text: "已有标签：",
        cls: "blog-deploy-chip-label",
      });

      for (const tag of this.existingTags) {
        const chip = chipRow.createEl("span", {
          text: tag,
          cls: "blog-deploy-tag-chip",
        });
        chip.style.cssText = `
          display: inline-block;
          padding: 2px 8px;
          background: var(--interactive-normal);
          border-radius: 10px;
          font-size: 12px;
          cursor: pointer;
          user-select: none;
        `;
        chip.onmouseenter = () => {
          chip.style.background = "var(--interactive-accent)";
          chip.style.color = "var(--text-on-accent)";
        };
        chip.onmouseleave = () => {
          chip.style.background = "var(--interactive-normal)";
          chip.style.color = "";
        };
        chip.onclick = () => {
          const currentTags = this.tagsInput.value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          const idx = currentTags.indexOf(tag);
          if (idx >= 0) {
            currentTags.splice(idx, 1);
          } else {
            currentTags.push(tag);
          }
          this.tagsInput.value = currentTags.join(", ");
          this.updateDestHint();
        };
      }
    }

    const imageSetting = contentEl.createDiv();
    imageSetting.style.display = "flex";
    imageSetting.style.alignItems = "center";
    imageSetting.style.gap = "8px";
    imageSetting.style.marginBottom = "12px";
    this.processImagesCheckbox = imageSetting.createEl("input", {
      type: "checkbox",
    });
    this.processImagesCheckbox.checked = true;
    this.processImagesCheckbox.id = "blog-deploy-process-images";
    imageSetting.createEl("label", {
      text: "🖼️ 上传本地图片到图床 (PicGo)",
      cls: "blog-deploy-checkbox-label",
    });
    const label = imageSetting.querySelector("label");
    if (label) label.setAttribute("for", "blog-deploy-process-images");

    this.destHint = contentEl.createEl("p", {
      cls: "blog-deploy-path",
    });
    this.updateDestHint();

    const buttonRow = contentEl.createDiv();
    buttonRow.style.display = "flex";
    buttonRow.style.justifyContent = "flex-end";
    buttonRow.style.gap = "8px";
    buttonRow.style.marginTop = "16px";

    const cancelBtn = buttonRow.createEl("button", { text: "取消" });
    cancelBtn.onclick = () => {
      this.onSubmit(null);
      this.close();
    };

    const deployBtn = buttonRow.createEl("button", {
      text: "✅ 加入队列",
      cls: "mod-cta",
    });
    deployBtn.onclick = () => {
      this.item.title = this.titleInput.value.trim() || this.item.title;
      this.item.tags = this.tagsInput.value.trim() || this.item.tags;
      this.item.processImages = this.processImagesCheckbox.checked;
      this.onSubmit(this.item);
      this.close();
    };
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
