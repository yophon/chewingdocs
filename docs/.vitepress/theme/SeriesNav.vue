<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";
import type { DefaultTheme } from "vitepress";

const { page, theme } = useData();

function normalizePath(value: string) {
  return decodeURI(value)
    .replace(/^(\.\.\/)+/, "")
    .replace(/^(\.\/)+/, "")
    .replace(/[?#].*$/, "")
    .replace(/\.md$/, "")
    .replace(/\/index$/, "")
    .replace(/\/$/, "")
    .replace(/^\/?/, "/");
}

function flattenItems(items: DefaultTheme.SidebarItem[] = []): DefaultTheme.SidebarItem[] {
  return items.flatMap((item) => {
    const current = item.link ? [item] : [];
    return item.items ? current.concat(flattenItems(item.items)) : current;
  });
}

const currentPath = computed(() => normalizePath(page.value.relativePath));

const seriesNav = computed(() => {
  const sidebar = theme.value.sidebar;
  if (!sidebar || Array.isArray(sidebar)) return null;

  const key = Object.keys(sidebar)
    .sort((a, b) => b.length - a.length)
    .find((item) => currentPath.value === normalizePath(item) || currentPath.value.startsWith(`${normalizePath(item)}/`));

  if (!key) return null;

  const group = sidebar[key];
  const groups = Array.isArray(group) ? group : group.items;
  const title = groups[0]?.text ?? "本系列";
  const chapters = flattenItems(groups)
    .filter((item) => item.link && item.text !== "目录")
    .map((item) => ({
      text: item.text ?? item.link!,
      link: item.link!
    }));

  const index = chapters.findIndex((item) => normalizePath(item.link) === currentPath.value);
  if (index === -1 || chapters.length < 2) return null;

  return {
    title,
    current: chapters[index],
    previous: chapters[index - 1],
    next: chapters[index + 1],
    chapters
  };
});

function goToChapter(event: Event) {
  const target = event.target as HTMLSelectElement;
  if (target.value) window.location.href = withBase(target.value);
}
</script>

<template>
  <nav v-if="seriesNav" class="SeriesNav" aria-label="章节导航">
    <div class="SeriesNav-title">{{ seriesNav.title }}</div>
    <div class="SeriesNav-controls">
      <a
        v-if="seriesNav.previous"
        class="SeriesNav-button"
        :href="withBase(seriesNav.previous.link)"
      >
        上一章
      </a>
      <span v-else class="SeriesNav-button is-disabled">上一章</span>

      <select
        class="SeriesNav-select"
        :value="seriesNav.current.link"
        aria-label="切换章节"
        @change="goToChapter"
      >
        <option
          v-for="chapter in seriesNav.chapters"
          :key="chapter.link"
          :value="chapter.link"
        >
          {{ chapter.text }}
        </option>
      </select>

      <a
        v-if="seriesNav.next"
        class="SeriesNav-button"
        :href="withBase(seriesNav.next.link)"
      >
        下一章
      </a>
      <span v-else class="SeriesNav-button is-disabled">下一章</span>
    </div>
  </nav>
</template>
