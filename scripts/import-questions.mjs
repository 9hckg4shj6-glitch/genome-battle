// 問題演習アプリのゲノム編から2025年度の100問を取り込む（一方向・何度でも再実行可）。
//   node scripts/import-questions.mjs [問題演習アプリのパス]
// 出力:
//   public/questions.json        … 問題文・選択肢・図だけ（正解と解説は含めない＝覗いても答えが分からない）
//   supabase/seed.generated.sql  … 正解と簡略版の解説（決着した問題だけRPCで返す）、AIが読む文字数と図の有無
//   public/images/*.webp         … 参照される図
// 解説は本アプリより簡略版：【正解】と本文のみ。【試験のツボ】と選択肢ごとの解説は載せない。
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import vm from "node:vm";

const src = process.argv[2] ?? join(homedir(), "アルゴリズム学習/問題演習アプリ");
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(src, "public/subjects/genome/questions.js"), "utf8"), sandbox);
const all = sandbox.window.QUIZ_DATA.filter((q) => q.id.startsWith("genome-2025-"));
if (all.length !== 100) throw new Error(`2025年度は100問のはずが ${all.length} 問`);

const publicQuestions = all.map((q) => {
  if (q.choices.length !== 5 || q.answer < 0 || q.answer > 4) throw new Error(`${q.id}: 5択でない`);
  const image = q.image ? `images/${basename(q.image)}` : undefined;
  if (q.image) copyFileSync(join(src, "public", q.image), join("public", image));
  return { id: q.id, field: q.field, question: q.question, choices: q.choices, image, imageAlt: q.imageAlt };
});
writeFileSync("public/questions.json", JSON.stringify(publicQuestions));

const sqlText = (s) => `'${s.replaceAll("'", "''")}'`;
const rows = all.map((q) => {
  const explanation = q.explanation.split("【試験のツボ】")[0].trim();
  // AI対戦の回答時刻に使う。問題文＋選択肢の文字数（019_ai_reading_pace.sql）。
  const readChars = (q.question + q.choices.join("")).length;
  return `  (${sqlText(q.id)}, ${q.answer}, ${sqlText(explanation)}, ${sqlText(q.field)}, ${readChars}, ${q.image ? "true" : "false"})`;
});
writeFileSync(
  "supabase/seed.generated.sql",
  `-- scripts/import-questions.mjs が生成。手で直さない。\n` +
    `insert into public.questions (id, answer, explanation, field, read_chars, has_figure) values\n${rows.join(",\n")}\n` +
    `on conflict (id) do update set answer = excluded.answer, explanation = excluded.explanation, field = excluded.field, read_chars = excluded.read_chars, has_figure = excluded.has_figure;\n`,
);
console.log(`questions: ${publicQuestions.length}, images: ${new Set(publicQuestions.map((q) => q.image).filter(Boolean)).size}`);
