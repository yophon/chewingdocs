import fs from "node:fs";
import path from "node:path";
import { series } from "../../data/series.mjs";
import { defineConfig, type DefaultTheme } from "vitepress";

const docsRoot = path.resolve(__dirname, "../..");

function stripExt(file: string) {
  return file.replace(/\.md$/, "");
}

function titleFromFile(file: string) {
  return stripExt(file).replace(/^(\d+)-/, "$1. ");
}

function itemsForDir(dir: string): DefaultTheme.SidebarItem[] {
  const fullDir = path.join(docsRoot, dir);
  if (!fs.existsSync(fullDir)) return [];

  return fs
    .readdirSync(fullDir)
    .filter((file) => file.endsWith(".md") && file !== "00-写作计划.md" && file !== "目录.md")
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }))
    .map((file) => ({
      text: file === "目录.md" ? "目录" : titleFromFile(file),
      link: `/${dir}/${stripExt(file)}`
    }));
}

function firstReadableLink(dir: string) {
  const firstItem = itemsForDir(dir).find((item) => item.text !== "目录");
  if (firstItem) return firstItem.link;

  const planFile = path.join(docsRoot, dir, "00-写作计划.md");
  return fs.existsSync(planFile) ? `/${dir}/00-写作计划` : `/${dir}/`;
}

function sidebar(): DefaultTheme.Sidebar {
  return Object.fromEntries(
    series.map(({ text, dir }) => [
      `/${dir}/`,
      [
        {
          text,
          items: itemsForDir(dir)
        }
      ]
    ])
  );
}

function nav(): DefaultTheme.NavItem[] {
  return [
    { text: "首页", link: "/" },
    { text: "学习系列", link: "/series" },
    { text: "版本复查", link: "/版本复查清单" },
    {
      text: "主题",
      items: series.map(({ text, dir }) => ({
        text,
        link: firstReadableLink(dir)
      }))
    },
    { text: "未来规划", link: "/未来系列规划" }
  ];
}

function escapeVueMustaches(html: string) {
  return html.replace(/\{\{/g, "&#123;&#123;").replace(/\}\}/g, "&#125;&#125;");
}

export default defineConfig({
  title: "chewingdocs",
  description: "按系列整理的工程知识库",
  srcDir: "..",
  srcExclude: ["README.md", "**/目录.md", "docs/**", "site/**", "node_modules/**"],
  base: "/chewingdocs/",
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    build: {
      chunkSizeWarningLimit: 3000
    }
  },
  markdown: {
    html: false,
    lineNumbers: false,
    config(md) {
      const render = md.render.bind(md);
      const renderInline = md.renderInline.bind(md);

      md.render = (src, env) => escapeVueMustaches(render(src, env));
      md.renderInline = (src, env) => escapeVueMustaches(renderInline(src, env));
    }
  },
  themeConfig: {
    logo: "/logo.svg",
    nav: nav(),
    sidebar: sidebar(),
    search: {
      provider: "local",
      options: {
        detailedView: false,
        miniSearch: {
          _splitIntoSections(_file, html) {
            const title = html.match(/<h1[^>]*>(.*?)<a /)?.[1]?.replace(/<[^>]+>/g, "") ?? "";
            const text = html
              .replace(/<script[\s\S]*?<\/script>/g, "")
              .replace(/<style[\s\S]*?<\/style>/g, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 1200);

            return [{ titles: title ? [title] : [], text }];
          }
        }
      }
    },
    outline: {
      level: [2, 3],
      label: "本页目录"
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/yophon/chewingdocs" }
    ],
    docFooter: {
      prev: "上一篇",
      next: "下一篇"
    },
    lastUpdated: {
      text: "最后更新",
      formatOptions: {
        dateStyle: "medium",
        timeStyle: "short"
      }
    },
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "外观",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式"
  }
});
