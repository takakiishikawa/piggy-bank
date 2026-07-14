@AGENTS.md

# piggy-bank — CLAUDE.md

## プロジェクト概要
節約・家計管理アプリ。日々の支出を把握し、賢い節約習慣を身につけるためのツール。
- 支出記録（カテゴリ別）
- 月次レポート、予算設定
- Google API 連携（カレンダー / Gmail からの自動取り込み等、`googleapis` 利用）

## 技術スタック
- Framework: **Next.js 16 (App Router) + React 19 + TypeScript 6**
- Styling: **Tailwind CSS v4** + `@takaki/go-design-system`
- Auth: Supabase Auth（Google OAuth）
- DB: Supabase (Postgres + RLS)
- Deploy: Vercel
- AI: `@anthropic-ai/sdk`
- 外部API: `googleapis`（Google サービス連携）

## 開発コマンド
```bash
npm install       # 依存関係インストール
npm run dev       # 開発サーバー (localhost:3000)
npm run build     # 本番ビルド
npm run lint      # ESLint
```

## 重要なルール
1. **`@takaki/go-design-system` を最優先** — UIコンポーネントだけでなくレイアウト・ページテンプレート・トークン・ユーティリティ・Hooks すべて DS から取る（詳細は次セクション）
2. **Server Components優先** — `'use client'` は必要箇所のみ
3. **型安全** — `any` 型は使用しない
4. **AI SDK** — `@anthropic-ai/sdk` のみ使用（`openai` / `ai` / `@ai-sdk/*` は禁止）
5. **DB変更は Supabase migration で** — 直 SQL は禁止。RLS は全テーブル必須
6. **Google API のスコープは最小権限** — 取得した OAuth トークンは Supabase で暗号化保存

## go-design-system の使い方

### エントリで必須の import
```tsx
// app/layout.tsx か app/globals.css 経由で
import "@takaki/go-design-system/tokens.css"
import "@takaki/go-design-system/globals.css"
```

### 提供される要素（直importせず DS から取る）
- **UIコンポーネント**: Button, Card, Badge, Dialog, Sheet, Tabs, Sidebar, DataTable, Calendar, Chart 等（shadcn/ui 準拠）
- **レイアウト**: `AppLayout`, `PageHeader`
- **ページテンプレート**: `DashboardPage`, `LoginPage`, `ConceptPage`, `SettingsPage`, `AppSidebar` / `AppSwitcher` / `UserMenu`（sidebar-01）
- **Feedback**: `Banner`, `EmptyState`, `Spinner`, `Toaster` + `toast()`
- **Form 補助**: `FormActions`, `DatePicker`
- **ユーティリティ**: `cn()`（`clsx` + `tailwind-merge` を抽象化）
- **Hooks**: `useIsMobile()`

### 設計指針
- ページ単位（ダッシュボード／ログイン／設定／コンセプト等）は **まず DS のテンプレートで作れないか確認** してから自前実装する
- ボタン色や spacing は `tokens.css` の CSS 変数（`--color-primary`, `--spacing-*` 等）で上書き。コンポーネント内 hardcode は避ける
- Radix UI / sonner / next-themes / clsx 等は **DS 経由のラッパー** で使う（直 import は禁止）

## パッケージ規則
| Layer | 内容 |
|-------|------|
| Foundation | next, react, typescript, tailwindcss, `@takaki/go-design-system` |
| Layer 1 (DS吸収) | Radix UI 等は直接importしない（DS経由で使う） |
| Layer 2 (全go共通) | `@supabase/*`, zod, date-fns, react-hook-form, `@vercel/analytics` |
| Layer 3 (機能) | `@dnd-kit/*`, react-dropzone, recharts, `googleapis` 等 |
| Layer 4 (固有) | このプロダクト専用ライブラリのみ |
| 禁止 | `openai`, `ai`, `@ai-sdk/*` |

## 技術スタックの更新方針
- **Goシリーズ間でバージョンを揃える**: Next.js / React / TypeScript / Tailwind は Foundation。go-design-system を先に上げ、各 Go アプリを追従
- patch / minor: 随時 `npm update` で適用
- major: 公式 migration guide を確認してから手動で追従。CHANGELOG を読む
- deprecated 警告が出たライブラリは積極的に置き換え
- `npm outdated` を月1で確認
- `googleapis` は破壊的変更が多いので CHANGELOG を必ず読む

## セキュリティ
- **RLS必須**: Supabase の全テーブルに RLS を設定。`auth.uid()` で本人レコードのみアクセス可
- **環境変数**: `.env.local` のみで管理。`NEXT_PUBLIC_*` プレフィックス以外をクライアントに露出しない（service_role キー、Google OAuth client secret は絶対に NEXT_PUBLIC_ にしない）
- **依存の脆弱性**: `npm audit` を定期実行。high 以上は即解決
- **API key / OAuth Token**: Server Components / Route Handlers でのみ参照。Client Components に渡さない。Google access/refresh token は Supabase で暗号化（pgsodium 等）して保存
- **入力バリデーション**: 外部入力は zod でバリデート。Supabase クライアント経由のみ（生SQL禁止）
- **ログ**: 機密情報（トークン、メアド、金額の個人識別が可能な形）をログ出力しない
- **OAuth リダイレクト URL**: Supabase ダッシュボード / Google Cloud Console で本番ドメインのみ許可
