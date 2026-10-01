import { defineConfig } from "vite";

// 相対パスで出力し、GitHub Pages（/genome-battle/）でもローカルでも同じビルドで動かす。
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
