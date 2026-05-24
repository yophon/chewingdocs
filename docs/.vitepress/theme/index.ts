import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import SeriesNav from "./SeriesNav.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "doc-before": () => h(SeriesNav),
      "doc-after": () => h(SeriesNav)
    });
  }
};
