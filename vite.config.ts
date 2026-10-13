import { defineConfig } from "vite";

// 相対パスで出力し、GitHub Pages（/genome-battle/）でもローカルでも同じビルドで動かす。
export default defineConfig({
  base: "./",
  // 管理画面（admin.html）は別ページ。アプリからはリンクしない。
  // アプリ本体は従来どおり assets/index-*.js に出す（src/update.ts が新しい版の判定に使う）。共通部分は chunk-*.js。
  build: {
    target: "es2022",
    rollupOptions: { input: { index: "index.html", admin: "admin.html" }, output: { chunkFileNames: "assets/chunk-[hash].js" } },
  },
});
