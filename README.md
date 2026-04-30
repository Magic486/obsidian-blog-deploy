# Blog Deploy - Obsidian 博客部署插件

右键一键部署 Obsidian 笔记到 Hexo 博客，自动添加 Frontmatter、上传图片、按标签分类并推送至 GitHub。

## 功能

- **右键部署** — 在文件浏览器右键任意 `.md` 笔记，选择「📤 部署到博客」
- **自动 Frontmatter** — 自动生成标题、标签、日期等文章头部信息
- **智能标签识别** — 根据笔记所在文件夹自动检测标签（如 `数据库/基本操作.md` → tags: 数据库）
- **已有标签选择** — 部署弹窗展示博客中已有的标签，点击即可添加/移除
- **按标签分类** — 自动在 `_posts/` 下按标签创建子文件夹（如 `_posts/C++/`, `_posts/数据库/`）
- **延迟部署** — 笔记加入队列，等待可配置的延迟后统一部署（默认 10 分钟），方便批量操作
- **自动上传图片** — 笔记中的本地图片自动通过 PicGo 上传到图床，替换为 CDN 链接
- **原笔记无修改** — 所有图片路径替换仅在博客副本中生效，vault 中的原笔记完全不受影响
- **自动 Git 推送** — 自动执行 `git add` → `git commit` → `git push`，触发 GitHub Actions 部署
- **队列管理** — 状态栏倒计时，可随时「立即推送」或「取消全部」

## 系统要求

- Obsidian v1.0.0+
- PicGo 桌面端（图片上传功能需要）
- 一个 Hexo/Hugo 博客的本地 Git 仓库
- Git 已配置 push 权限

## 安装

### 手动安装（推荐）

1. 从 [Releases](https://github.com/Magic486/obsidian-blog-deploy/releases) 下载 `main.js` 和 `manifest.json`
2. 复制到你的 vault 的 `.obsidian/plugins/obsidian-blog-deploy/` 文件夹
3. 重启 Obsidian 或刷新插件列表
4. 进入设置 → 第三方插件 → 启用「Blog Deploy」

### 从源码构建

```bash
git clone https://github.com/Magic486/obsidian-blog-deploy.git
cd obsidian-blog-deploy
npm install
npm run build
# 将 main.js 和 manifest.json 复制到 vault 的 .obsidian/plugins/obsidian-blog-deploy/
```

## 配置

启用插件后，进入 **设置 → Blog Deploy**：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 博客本地路径 | `C:\Users\yelfs\Desktop\My-Blog` | 博客 Git 仓库的绝对路径 |
| 文章子目录 | `source\_posts` | _posts 文件夹的相对路径 |
| 部署延迟（分钟） | `10` | 等待多久后自动部署（0 = 立即） |
| 自动 Git Push | `开启` | 部署后自动提交并推送 |
| 开启评论 | `关闭` | 文章头部 comments 默认值 |
| 顶部图片 | `transparent` | 文章头部 top_img 默认值 |
| 提交信息模板 | `publish: {{title}} via Obsidian` | Git 提交信息格式 |
| PicGo 服务器地址 | `http://127.0.0.1:36677` | PicGo 本地上传服务器地址 |

## 使用方法

### 部署笔记

1. 在 Obsidian 文件浏览器中右键任意 `.md` 文件
2. 选择 **📤 部署到博客**
3. 在弹出的对话框中确认/修改标题和标签
   - 点击下方「已有标签」中的标签芯片可快速添加/移除
   - 也可直接在输入框中手动输入新标签
4. 勾选/取消「🖼️ 上传本地图片到图床」
5. 点击 **✅ 加入队列**
6. 状态栏显示 `⏳ N 篇待部署 | 剩余 X:XX [立即推送] [取消全部]`
7. 倒计时结束后自动完成部署，或点击「立即推送」/「取消全部」

### 命令面板（Ctrl/Cmd+P）

| 命令 | 说明 |
|------|------|
| 部署当前笔记到博客 | 部署当前打开的笔记 |
| 立即部署队列中的所有笔记 | 跳过倒计时直接部署 |
| 清空部署队列 | 取消所有待部署笔记 |
| 查看部署队列 | 列出所有待部署笔记 |

### 图片上传流程

```
笔记本地图片（![img](assets/1.png)）
          ↓ 部署时触发
    PicGo 上传到 Gitee 图床
          ↓
    替换为图床链接（![img](https://gitee.com/.../1.png)）
          ↓
    写入 blog/source/_posts/标签子目录/
    ✅ 原 vault 笔记完全不修改
```

> 前提：PicGo 已开启 Server（默认 `127.0.0.1:36677`），并将 Gitee 设为默认图床。

### 生成的 Frontmatter 格式

```yaml
---
title: 你的笔记标题
tags: 数据库
date: 2026-04-28
top_img: transparent
comments: false
---
```

- **title**：取笔记第一个 `# 标题`，否则取文件名
- **tags**：自动检测笔记所在文件夹名，可在部署弹窗中修改
- **date**：当天日期

### 博客防盗链（Gitee）

如果使用 Gitee 图床，需要在博客 HTML 中添加以下 meta 标签防止防盗链：

```html
<meta name="referrer" content="no-referrer">
```

Hexo Butterfly 主题可在 `_config.butterfly.yml` 的 `inject.head` 中添加。

## License

MIT
