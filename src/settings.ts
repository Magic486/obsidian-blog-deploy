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
}

export const DEFAULT_SETTINGS: BlogDeploySettings = {
  blogPath: "C:\\Users\\yelfs\\Desktop\\My-Blog",
  postsSubdir: "source\\_posts",
  deployDelayMinutes: 10,
  autoPush: true,
  topImg: "transparent",
  comments: false,
  commitTemplate: "publish: {{title}} via Obsidian",
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
    containerEl.createEl("h2", { text: "Blog Deploy Settings" });

    new Setting(containerEl)
      .setName("Blog local path")
      .setDesc("Absolute path to your Hexo/Hugo blog directory (git repo root)")
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
      .setName("Posts subdirectory")
      .setDesc("Relative path from blog root to the _posts folder")
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
      .setName("Deploy delay (minutes)")
      .setDesc("How many minutes to wait before auto-deploy (0 = immediate)")
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
      .setName("Auto git push")
      .setDesc("Automatically commit and push to GitHub after deploying")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoPush).onChange(async (value) => {
          this.plugin.settings.autoPush = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Comments enabled")
      .setDesc("Default value for 'comments' in frontmatter")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.comments).onChange(async (value) => {
          this.plugin.settings.comments = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Top image")
      .setDesc("Default value for 'top_img' in frontmatter (e.g., 'transparent' or a URL)")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.topImg)
          .onChange(async (value) => {
            this.plugin.settings.topImg = value || "transparent";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Commit message template")
      .setDesc("Use {{title}} as placeholder for the post title")
      .addText((text) =>
        text
          .setPlaceholder("publish: {{title}} via Obsidian")
          .setValue(this.plugin.settings.commitTemplate)
          .onChange(async (value) => {
            this.plugin.settings.commitTemplate = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
