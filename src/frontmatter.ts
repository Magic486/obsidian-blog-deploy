export interface Frontmatter {
  title: string;
  tags: string;
  date: string;
  top_img: string;
  comments: boolean;
  [key: string]: string | boolean;
}

export function parseFrontmatter(content: string): {
  frontmatter: Frontmatter | null;
  body: string;
} {
  if (!content.startsWith("---")) {
    return { frontmatter: null, body: content };
  }
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }
  const fmSection = content.substring(3, endIndex).trim();
  const body = content.substring(endIndex + 3).trimStart();
  const lines = fmSection.split("\n");
  const frontmatter: Record<string, string | boolean> = {};
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();
    if (value === "false") {
      frontmatter[key] = false;
    } else if (value === "true") {
      frontmatter[key] = true;
    } else {
      frontmatter[key] = value;
    }
  }
  return { frontmatter: frontmatter as Frontmatter, body };
}

export function generateFrontmatterString(fm: Frontmatter): string {
  let result = "---\n";
  result += `title: ${fm.title}\n`;
  result += `tags: ${fm.tags}\n`;
  result += `date: ${fm.date}\n`;
  result += `top_img: ${fm.top_img}\n`;
  result += `comments: ${fm.comments}\n`;
  result += "---\n\n";
  return result;
}

export function generateFrontmatter(
  title: string,
  tags: string,
  topImg: string,
  comments: boolean
): Frontmatter {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return {
    title,
    tags,
    date: `${y}-${m}-${d}`,
    top_img: topImg,
    comments,
  };
}

export function extractTitleFromContent(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim();
  }
  return "";
}

export function extractTagsFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  if (parts.length <= 1) {
    return "";
  }
  const folders = parts.slice(0, -1);
  return folders.filter((f) => f.trim().length > 0 && !f.startsWith(".")).join(", ");
}
