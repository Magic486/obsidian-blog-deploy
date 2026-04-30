import { App, PluginSettingTab, Setting } from "obsidian";
import BlogDeployPlugin from "../main";

export interface BlogDeploySettings {
  blogPath: string;
  postsSubdir: string;
  deployDelayMinutes: number;
  autoPush: boolean;
  topImg: string;
  comments: boolean;
  commitTemplate: string;
  picgoServer: string;
}

export const DEFAULT_SETTINGS: BlogDeploySettings = {
  blogPath: "C:\\Users\\yelfs\\Desktop\\My-Blog",
  postsSubdir: "source\\_posts",
  deployDelayMinutes: 10,
  autoPush: true,
  topImg: "transparent",
  comments: false,
  commitTemplate: "publish: {{title}} via Obsidian",
  picgoServer: "http://127.0.0.1:36677",
};

export class BlogDeploySettingTab extends PluginSettingTab {
  plugin: BlogDeployPlugin;

  constructor(app: App, plugin: BlogDeployPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "博客部署设置" });

    new Setting(containerEl)
      .setName("博客本地路径")
      .setDesc("Hexo/Hugo 博客 Git 仓库的绝对路径")
      .addText((text) =>
        text
          .setPlaceholder("C:\\Users\\yelfs\\Desktop\\My-Blog")
          .setValue(this.plugin.settings.blogPath)
          .onChange(async (value) => {
            this.plugin.settings.blogPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("文章子目录")
      .setDesc("博客根目录下的 _posts 文件夹相对路径")
      .addText((text) =>
        text
          .setPlaceholder("source/_posts")
          .setValue(this.plugin.settings.postsSubdir)
          .onChange(async (value) => {
            this.plugin.settings.postsSubdir = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("部署延迟（分钟）")
      .setDesc("等待多久后自动部署（0 = 立即部署）")
      .addSlider((slider) =>
        slider
          .setLimits(0, 60, 1)
          .setValue(this.plugin.settings.deployDelayMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.deployDelayMinutes = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自动 Git Push")
      .setDesc("部署后自动提交并推送到 GitHub")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoPush).onChange(async (value) => {
          this.plugin.settings.autoPush = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("开启评论")
      .setDesc("文章头部的 comments 默认值")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.comments).onChange(async (value) => {
          this.plugin.settings.comments = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("顶部图片")
      .setDesc("文章头部的 top_img 默认值（例如 transparent 或图片 URL）")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.topImg)
          .onChange(async (value) => {
            this.plugin.settings.topImg = value || "transparent";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("提交信息模板")
      .setDesc("使用 {{title}} 作为文章标题的占位符")
      .addText((text) =>
        text
          .setPlaceholder("publish: {{title}} via Obsidian")
          .setValue(this.plugin.settings.commitTemplate)
          .onChange(async (value) => {
            this.plugin.settings.commitTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("PicGo 服务器地址")
      .setDesc("PicGo 本地上传服务器地址（PicGo → 设置 → Server）")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:36677")
          .setValue(this.plugin.settings.picgoServer)
          .onChange(async (value) => {
            this.plugin.settings.picgoServer = value || "http://127.0.0.1:36677";
            await this.plugin.saveSettings();
          })
      );
  }
}
