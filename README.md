# ゲノム対戦

ゲノム解析学 2025年度の過去問100問を使った、2〜8人の早押し5択対戦（ゲスト参加・名前だけ）。

- 公開URL: https://9hckg4shj6-glitch.github.io/genome-battle/
- LINEに流すときは末尾に `?openExternalBrowser=1` を付ける（外部ブラウザで開く方が安定）

## 構成

- 静的サイト（Vite + TypeScript）を GitHub Pages で配信。`npm run deploy` でビルドして `gh-pages` ブランチへ push（.env.local の Supabase 設定が埋め込まれる）
- Supabase: プロジェクト `genome-battle`（ref `hfuixjjfhjjvvzcnlfhv`・東京・Free）。判定・進行はすべて `supabase/migrations/001_battle.sql` の RPC。状態が変わると Realtime Broadcast（`battle:<match_id>`）で配信
- 公開している `public/questions.json` には正解・解説を入れていない。正解と簡略版の解説はDBにあり、決着した問題だけ返す

## 問題の更新

正は問題演習アプリ側（さらにその正は `~/Documents/試験解説作成/output/data/*.json`）。

```bash
node scripts/import-questions.mjs   # questions.json・図・supabase/seed.generated.sql を再生成
```

`seed.generated.sql`（正解キー入りのため Git 管理外）を Supabase の SQL Editor で実行（upsert なので何度でも可）。

新しいプロジェクトでは、Realtime に一度クライアントが接続するまで `realtime.send` が作られない。SQL適用後にアプリを一度開いてから動作確認する。

## 動作確認

```bash
# .env.local に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
node scripts/bots.mjs 16   # ボット16人で同時にランダム対戦（競合・配信・完走の確認）
```

## 無料枠の目安（Supabase Free）

Realtime: 同時接続200・100 msg/s・月200万msg。Broadcastは「送信1＋受信者数」で数える。
8人部屋で1試合およそ400msg。
