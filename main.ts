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
              .setTitle("📤 Deploy to blog")
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
      name: "Deploy current note to blog",
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
      name: "Force deploy all pending notes now",
      callback: () => {
        this.scheduler.forceDeploy();
      },
    });

    this.addCommand({
      id: "clear-queue",
      name: "Clear deploy queue",
      callback: () => {
        this.scheduler.clearQueue();
      },
    });

    this.addCommand({
      id: "show-queue",
      name: "Show deploy queue",
      callback: () => {
        const queue = this.scheduler.getQueue();
        if (queue.length === 0) {
          new Notice("Deploy queue is empty");
        } else {
          const names = queue.map((q) => `- ${q.title}`).join("\n");
          new Notice(`Deploy queue (${queue.length}):\n${names}`, 8000);
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
      new Notice("❌ Failed to get vault root path");
      return;
    }

    let item: DeployItem | null = null;
    try {
      const deployer = new Deployer(
        this.settings.blogPath,
        this.settings.postsSubdir,
        this.settings.topImg,
        this.settings.comments,
        this.settings.commitTemplate,
        vaultRoot
      );
      item = deployer.prepareItem(file.path);
    } catch (e: any) {
      new Notice(`❌ Error reading file: ${e.message}`);
      return;
    }

    if (!item) {
      new Notice("❌ Failed to prepare deploy item");
      return;
    }

    new DeployConfirmModal(this.app, item, (confirmedItem) => {
      if (confirmedItem) {
        this.scheduler.add(confirmedItem);
      }
    }).open();
  }
}

class DeployConfirmModal extends Modal {
  private item: DeployItem;
  private onSubmit: (item: DeployItem | null) => void;
  private titleInput: HTMLInputElement;
  private tagsInput: HTMLInputElement;

  constructor(app: App, item: DeployItem, onSubmit: (item: DeployItem | null) => void) {
    super(app);
    this.item = item;
    this.onSubmit = onSubmit;
    this.titleInput = document.createElement("input");
    this.tagsInput = document.createElement("input");
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.addClass("blog-deploy-modal");
    contentEl.createEl("h2", { text: "📤 Deploy to Blog" });

    contentEl.createEl("p", {
      text: `File: ${this.item.fileName}`,
      cls: "blog-deploy-file",
    });

    const titleSetting = contentEl.createDiv();
    titleSetting.createEl("label", { text: "Title" });
    this.titleInput = titleSetting.createEl("input", {
      type: "text",
      value: this.item.title,
    });
    this.titleInput.style.width = "100%";
    this.titleInput.style.marginBottom = "12px";

    const tagsSetting = contentEl.createDiv();
    tagsSetting.createEl("label", { text: "Tags (comma-separated)" });
    this.tagsInput = tagsSetting.createEl("input", {
      type: "text",
      value: this.item.tags,
      placeholder: "e.g. Java, 笔记",
    });
    this.tagsInput.style.width = "100%";
    this.tagsInput.style.marginBottom = "12px";

    contentEl.createEl("p", {
      text: `Destination: ${this.item.destPath}`,
      cls: "blog-deploy-path",
    });

    const buttonRow = contentEl.createDiv();
    buttonRow.style.display = "flex";
    buttonRow.style.justifyContent = "flex-end";
    buttonRow.style.gap = "8px";
    buttonRow.style.marginTop = "16px";

    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => {
      this.onSubmit(null);
      this.close();
    };

    const deployBtn = buttonRow.createEl("button", {
      text: "✅ Add to queue",
      cls: "mod-cta",
    });
    deployBtn.onclick = () => {
      this.item.title = this.titleInput.value.trim() || this.item.title;
      this.item.tags = this.tagsInput.value.trim() || this.item.tags;
      this.onSubmit(this.item);
      this.close();
    };
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
