# Blog Deploy - Obsidian Plugin

One-click deploy Obsidian notes to your Hexo blog with auto git push.

## Features

- **Right-click to deploy** - Right-click any `.md` note in the file explorer and select "📤 Deploy to blog"
- **Auto frontmatter** - Automatically generates title, tags, date, and other frontmatter based on your note
- **Smart tag detection** - Tags are auto-detected from the note's parent folder (e.g., `数据库/基本操作.md` → tags: 数据库)
- **Delayed deployment** - Notes are queued and deployed after a configurable delay (default 10 minutes), so you can batch multiple notes
- **Auto git push** - Automatically `git add`, `git commit`, and `git push` to trigger your GitHub Actions deployment
- **Queue management** - View, cancel, or force-deploy the queue anytime via command palette

## Requirements

- Obsidian v1.0.0+
- Node.js installed on your system (for production builds only, not needed to use the plugin)
- A Hexo/Hugo blog in a local git repository
- Git configured with push access to your blog's remote

## Installation

### Manual Installation (recommended)

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/magic486/obsidian-blog-deploy/releases)
2. Copy both files into your vault's `.obsidian/plugins/obsidian-blog-deploy/` folder
3. Restart Obsidian or refresh plugins
4. Go to Settings → Community plugins → Enable "Blog Deploy"

### From Source

```bash
git clone https://github.com/magic486/obsidian-blog-deploy.git
cd obsidian-blog-deploy
npm install
npm run build
# Copy main.js and manifest.json to your vault's .obsidian/plugins/obsidian-blog-deploy/
```

## Configuration

After enabling the plugin, go to **Settings → Blog Deploy**:

| Setting | Default | Description |
|---------|---------|-------------|
| Blog local path | `C:\Users\yelfs\Desktop\My-Blog` | Absolute path to your blog git repo |
| Posts subdirectory | `source\_posts` | Relative path to the posts folder |
| Deploy delay (minutes) | `10` | Wait time before auto-deploy (0 = immediate) |
| Auto git push | `On` | Automatically commit and push after deploying |
| Comments enabled | `Off` | Default `comments` value in frontmatter |
| Top image | `transparent` | Default `top_img` value in frontmatter |
| Commit message template | `publish: {{title}} via Obsidian` | Git commit message format |

## Usage

### Deploy a note

1. Right-click any `.md` file in Obsidian's file explorer
2. Select **📤 Deploy to blog**
3. Confirm/edit the title and tags in the dialog
4. Click **✅ Add to queue**
5. The status bar shows `⏳ N note(s) pending | Deploy in X:XX`
6. After the delay, the note is automatically copied to your blog, committed, and pushed

### Commands (Ctrl/Cmd+P)

- **Deploy current note to blog** - Deploy the currently open note
- **Force deploy all pending notes now** - Deploy immediately without waiting
- **Clear deploy queue** - Cancel all pending deployments
- **Show deploy queue** - List all pending notes

### Frontmatter Generated

```yaml
---
title: Your Note Title
tags: 数据库
date: 2026-04-28
top_img: transparent
comments: false
---
```

- **title**: First `# heading` in the note, or the filename
- **tags**: Auto-detected from the note's parent folder(s)
- **date**: Today's date

## How It Works

1. Right-click adds the note to a **deploy queue**
2. The queue countdown starts (configurable delay, default 10 min)
3. Each new note added resets the countdown
4. When the timer expires:
   - Frontmatter is added to each note
   - Notes are copied to `blog/source/_posts/`
   - `git add` → `git commit` → `git push` is executed
   - Your GitHub Actions workflow handles the rest (Hexo build + deploy)

## License

MIT
