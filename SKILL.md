# Skill: Obsidian 插件开发与 Hexo 博客自动部署

## 一、Obsidian 插件架构

### 1.1 插件入口模板

```typescript
import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TFile } from "obsidian";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MySettingTab(this.app, this));
    // 注册命令、事件等
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

### 1.2 关键 API

| API | 用途 |
|-----|------|
| `this.addCommand({ id, name, callback })` | 注册 Ctrl+P 命令 |
| `this.app.workspace.on("file-menu", (menu, file) => ...)` | 右键菜单 |
| `this.addStatusBarItem()` | 底部状态栏元素 |
| `new Notice("文本", 持续时间)` | 弹窗提示 |
| `new Modal(app).open()` | 自定义弹窗 |
| `this.addSettingTab(new Tab(...))` | 设置面板 |
| `this.app.vault.adapter.getBasePath()` | 获取 vault 绝对路径 |

### 1.3 弹窗示例

```typescript
class MyModal extends Modal {
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "标题" });
    // 添加表单元素...
    const btn = contentEl.createEl("button", { text: "确认" });
    btn.onclick = () => this.close();
  }
  onClose() { contentEl.empty(); }
}
```

---

## 二、项目配置文件

### 2.1 package.json 关键字段

```json
{
  "devDependencies": {
    "obsidian": "^1.4.0",      // 类型定义
    "typescript": "^5.0.0",
    "esbuild": "^0.20.0",      // 打包工具
    "@types/node": "^20.0.0"
  }
}
```

### 2.2 esbuild.config.mjs 标准模板

```javascript
import esbuild from "esbuild";
const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
});
if (process.argv[2] === "production") {
  await context.rebuild(); process.exit(0);
} else {
  await context.watch();
}
```

### 2.3 manifest.json

```json
{
  "id": "plugin-id",
  "name": "插件名称",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "插件描述",
  "author": "作者",
  "isDesktopOnly": true
}
```

### 2.4 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src/**/*.ts", "main.ts"]
}
```

---

## 三、文件系统操作（关键踩坑）

### 3.1 TFile.path 是相对路径

**核心规则**：`TFile.path` 返回的是相对于 vault 根的路径（如 `数据库/基本操作.md`），**不是** 绝对路径。

```typescript
// ❌ 错误：直接用 TFile.path 调 fs
fs.readFileSync(file.path);  // file.path = "数据库/note.md" → 找不到

// ✅ 正确：拼接 vault 绝对路径
const vaultRoot = (this.app.vault.adapter as any).getBasePath();
const absPath = path.join(vaultRoot, file.path);
fs.readFileSync(absPath);
```

### 3.2 创建子目录

```typescript
const destDir = path.dirname(destPath);
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}
```

### 3.3 文件夹名清理

Windows 不允许的文件名字符：`\ / : * ? " < > |`

```typescript
function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}
```

---

## 四、Node.js execSync 调用外部命令

### 4.1 基本用法

```typescript
import { execSync } from "child_process";

const stdout = execSync("命令", {
  encoding: "utf-8",
  timeout: 30000,
  windowsHide: true,
  stdio: ["pipe", "pipe", "pipe"],
});
```

### 4.2 调用 Git

```typescript
// 检查是否是 git 仓库
fs.statSync(path.join(repoPath, ".git"));  // 存在 = 是仓库

// 检查是否有未提交变更
execSync("git status --porcelain", { cwd: repoPath });

// add + commit + push
execSync(`git add "${file}"`, { cwd: repoPath });
execSync(`git commit -m "message"`, { cwd: repoPath });
execSync(`git push origin main`, { cwd: repoPath, timeout: 60000 });
```

### 4.3 调用 curl（PicGo 上传图片）

```typescript
// Windows 必须用 curl.exe 而非 curl（PowerShell 中 curl 是 Invoke-WebRequest 别名）
const cmd = `curl.exe -s -X POST "http://127.0.0.1:36677/upload" -F "files=@${imagePath}" --connect-timeout 10 -m 40`;
const stdout = execSync(cmd, { encoding: "utf-8", timeout: 45000 });
const result = JSON.parse(stdout);
// result = { success: true, result: ["https://gitee.com/.../xxx.png"] }
```

---

## 五、PicGo 图片上传集成

### 5.1 PicGo API

| 项目 | 值 |
|------|-----|
| 端点 | `POST http://127.0.0.1:36677/upload` |
| 表单字段名 | `files` |
| 响应格式 | `{ success: bool, result: string[] }` |
| 前提 | PicGo 已开启 Server（设置 → Server → 开启） |

### 5.2 Windows 中文路径问题

**踩坑**：curl.exe 在 Windows 上无法直接读取中文路径的文件。

**解决**：先复制到 `os.tmpdir()` 的临时文件，上传后删除。

```typescript
import * as os from "os";
const tmpFile = path.join(os.tmpdir(), `picgo_upload_${Date.now()}${ext}`);
fs.copyFileSync(imagePath, tmpFile);
// ... curl upload with tmpFile ...
fs.unlinkSync(tmpFile);  // 清理
```

### 5.3 手动构建 multipart 的坑

❌ **不要手动拼装 multipart body**（边界符、换行符、Content-Length、编码都很容易出错）：

```typescript
// ❌ 不推荐：手动拼 Buffer
const bodyStart = Buffer.from(`--${boundary}\r\n...`);
const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
const requestBody = Buffer.concat([bodyStart, fileData, bodyEnd]);
http.request(...)
```

✅ **推荐：用 curl.exe 一行搞定**：

```typescript
execSync(`curl.exe -s -X POST "${url}/upload" -F "files=@${path}"`);
```

### 5.4 Gitee vs GitHub 图床选择

| 维度 | GitHub + jsDelivr | Gitee |
|------|-------------------|-------|
| 国内访问 | jsDelivr CDN 快 | 直连快 |
| 容量 | 大 | 小（单仓库容量限制） |
| 防盗链 | 无 | **有**（需 `<meta name="referrer" content="no-referrer">` 解决） |
| 上传速度 | 需翻墙 | 直连稳定 |
| 稳定性 | 高 | 偶有维护 |

**结论**：国内网络环境下 Gitee 更稳定；防盗链通过博客 HTML 注入 meta 标签解决。

---

## 六、GitHub 操作

### 6.1 gh CLI 安装与认证

```bash
# 安装
winget install --id GitHub.cli

# 认证（非交互式）
echo "ghp_xxx" | gh auth login --with-token
# 或用环境变量
$env:GH_TOKEN = "ghp_xxx"
```

### 6.2 创建仓库并推送

```bash
gh repo create 用户名/仓库名 --public --source=. --remote=origin --push
```

### 6.3 SSH vs HTTPS 推送

- **SSH**：国内网络更稳定（端口 22 较少被墙）
- **HTTPS**：通过 443 端口，可能被干扰
- 国内推荐用 SSH：`git remote add origin git@github.com:user/repo.git`

### 6.4 Personal Access Token 权限

创建 Token 时需要勾选：`repo`（全部子项）、`workflow`

---

## 七、Hexo 博客集成

### 7.1 Frontmatter 格式

```yaml
---
title: 文章标题
tags: 标签1, 标签2
date: 2026-04-28
top_img: transparent
comments: false
---
```

### 7.2 permalink 机制

URL 由 `_config.yml` 的 `permalink` 决定，**与文件在 `_posts/` 中的子目录结构无关**：

```yaml
permalink: :year/:month/:day/:title/
# 生成 URL: 2026/04/28/文章标题/
```

所以 `_posts/` 下可以随意建子文件夹分类，不影响网站 URL。

### 7.3 HTML 注入（防盗链 meta 标签）

Butterfly 主题通过 `_config.butterfly.yml` 的 `inject.head` 注入：

```yaml
inject:
  head:
    - <meta name="referrer" content="no-referrer">
```

---

## 八、Obsidian 图片引用处理

### 8.1 图片引用格式

| 格式 | 示例 | 处理方式 |
|------|------|----------|
| Markdown URL | `![alt](https://cdn.xxx/img.png)` | 跳过 |
| Markdown 本地 | `![alt](assets/img.png)` | 相对笔记目录拼接绝对路径 |
| Wikilink | `![[img.png]]` | 在笔记目录、子目录、vault 根搜索 |

### 8.2 提取图片引用

```typescript
const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;      // Markdown
const wikiRegex = /!\[\[([^\]]+)\]\]/g;            // Wikilink
const isRemote = /^https?:\/\//i.test(target);     // 是否已是 URL
```

### 8.3 Wikilink 路径解析

Obsidian 的 wikilink 解析规则（简化版）：
1. 笔记所在目录
2. 笔记目录下的子目录
3. vault 根目录
4. vault 下的 `assets/`、`img/` 目录

---

## 九、调度与延迟队列

### 9.1 倒计时机制

```typescript
let remainingSeconds = delayMinutes * 60;
const interval = setInterval(() => {
  remainingSeconds--;
  this.updateStatusBar();
  if (remainingSeconds <= 0) {
    clearInterval(interval);
    this.executeDeploy();
  }
}, 1000);
```

### 9.2 可交互状态栏

```typescript
const statusBarItem = this.addStatusBarItem();
// 添加文字
statusBarItem.createSpan({ text: "⏳ 3篇待部署" });
// 添加可点击链接
const btn = statusBarItem.createEl("a", { text: "立即推送" });
btn.onclick = (e) => {
  e.preventDefault();
  this.forceDeploy();
};
```

---

## 十、Fontmatter 自动生成

### 10.1 从笔记内容提取标题

```typescript
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || "";
}
```

### 10.2 从文件夹名提取标签

```typescript
// TFile.path = "数据库/基本操作.md" → tags: 数据库
function extractTagsFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).filter(f => f && !f.startsWith(".")).join(", ");
}
```

---

## 十一、常见错误排查

| 错误 | 原因 | 解决 |
|------|------|------|
| 右键部署无反应 | `fs.readFileSync` 用了相对路径 | 拼接 `vault.adapter.getBasePath()` |
| `No files found in form-data: files` | multipart 字段名错误或体格式有 bug | 改用 `curl.exe -F "files=@"` |
| `Failed to open/read local data` | curl 无法读取中文路径 | 先 `copyFileSync` 到 `os.tmpdir()` |
| `request failed with status code 400` | multipart body 编码错误 | 放弃手动拼 body，用 curl |
| PicGo 上传 socket hang up | GitHub 图床网络不稳定 | 切换 Gitee 为默认图床 |
| Gitee 图片博客不显示 | 防盗链 Referer 校验 | 博客注入 `<meta referrer="no-referrer">` |
| `git push` HTTPS 超时 | 443 端口被干扰 | 改用 SSH 协议 `git@github.com:...` |
| `gh auth login` 报 read:org | Token 缺少该 scope | 用 `$env:GH_TOKEN` 环境变量代替 |

---

## 十二、构建部署清单

```bash
# 1. 开发
npm install
npm run build          # 编译 TypeScript + esbuild 打包

# 2. 安装到 Obsidian
cp main.js manifest.json "vault/.obsidian/plugins/my-plugin/"

# 3. Git 提交
git add -A
git commit -m "描述"
git push origin main

# 4. GitHub 创建仓库
gh repo create user/repo --public --push
```
