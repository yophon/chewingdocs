import fs from "node:fs";
import path from "node:path";
import { defineConfig, type DefaultTheme } from "vitepress";

const docsRoot = path.resolve(__dirname, "..");

const series: Array<{ text: string; dir: string }> = [
  { text: "AI 学习", dir: "aiLearning" },
  { text: "AI Infra", dir: "aiInfraLearning" },
  { text: "后端学习", dir: "backendLearning" },
  { text: "前端学习", dir: "webLearning" },
  { text: "设计模式", dir: "designPatternLearning" },
  { text: "云服务与互联网基础常识", dir: "cloudBasicsLearning" },
  { text: "系统设计", dir: "systemDesign" },
  { text: "分布式系统", dir: "distributedLearning" },
  { text: "网络", dir: "networkLearning" },
  { text: "操作系统", dir: "osLearning" },
  { text: "DevOps / SRE", dir: "devopsLearning" },
  { text: "数据工程", dir: "dataEngineering" },
  { text: "算法", dir: "algorithmLearning" },
  { text: "程序员的数学", dir: "mathForCS" },
  { text: "Git", dir: "gitLearning" },
  { text: "终端工程", dir: "terminalLearning" },
  { text: "Go", dir: "goLearning" },
  { text: "Rust", dir: "rustLearning" },
  { text: "Flutter", dir: "flutterLearning" },
  { text: "解释器", dir: "interpreterLearning" },
  { text: "安全", dir: "securityLearning" },
  { text: "Claude Code", dir: "claudeLearning" }
];

function stripExt(file: string) {
  return file.replace(/\.md$/, "");
}

function titleFromFile(file: string) {
  return stripExt(file).replace(/^\d+-/, "");
}

function itemsForDir(dir: string): DefaultTheme.SidebarItem[] {
  const fullDir = path.join(docsRoot, dir);
  if (!fs.existsSync(fullDir)) return [];

  return fs
    .readdirSync(fullDir)
    .filter((file) => file.endsWith(".md") && file !== "00-写作计划.md")
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }))
    .map((file) => ({
      text: file === "目录.md" ? "目录" : titleFromFile(file),
      link: `/${dir}/${stripExt(file)}`
    }));
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
    {
      text: "学习系列",
      items: series.map(({ text, dir }) => ({
        text,
        link: `/${dir}/${itemsForDir(dir)[0]?.link.split("/").pop() ?? ""}`
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
  description: "按主题整理的技术学习文档库",
  base: "/chewingdocs/",
  cleanUrls: true,
  ignoreDeadLinks: true,
  lastUpdated: true,
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
