# テスト用ユーザー作成スクリプト

開発・テスト用のユーザーアカウントを一括作成するスクリプトです。

## 事前準備

### 1. 環境変数の設定

`.env` ファイルに以下を追加してください：

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**重要**: `SUPABASE_SERVICE_ROLE_KEY` はSupabaseダッシュボードの「Settings > API」から取得できます。これは管理者権限が必要です。

### 2. 依存関係のインストール

```bash
npm install dotenv
```

## 使用方法

### スクリプトの実行

```bash
node scripts/createTestUsers.js
```

## 作成されるテストユーザー

| 用途 | メールアドレス | パスワード | ユーザー名 | 表示名 |
|------|---------------|-----------|----------|--------|
| テスト1 | test1@example.com | test123456 | testuser1 | テストユーザー1 |
| テスト2 | test2@example.com | test123456 | testuser2 | テストユーザー2 |
| テスト3 | test3@example.com | test123456 | testuser3 | テストユーザー3 |
| デモ | demo@example.com | demo123456 | demouser | デモユーザー |
| 管理者 | admin@example.com | admin123456 | admin | 管理者 |

## 機能

- ✅ 重複チェック（既存ユーザーはスキップ）
- ✅ メール確認の自動完了
- ✅ Supabase Authとusersテーブルへの同時登録
- ✅ エラーハンドリング
- ✅ 進捗表示

## トラブルシューティング

### エラー: "Missing Supabase configuration"
- `.env` ファイルが正しく設定されているか確認
- `SUPABASE_SERVICE_ROLE_KEY` が設定されているか確認

### エラー: "Auth creation failed"
- Supabase プロジェクトの認証設定を確認
- サービスロールキーが正しいか確認

### エラー: "Profile creation failed"  
- usersテーブルが正しく作成されているか確認
- テーブルの制約（ユニーク制約など）を確認

## セキュリティ注意事項

⚠️ **本番環境では使用しないでください**

- このスクリプトは開発・テスト環境専用です
- サービスロールキーは厳重に管理してください
- テスト用ユーザーは定期的に削除することを推奨します

## 削除方法

テストユーザーを削除する場合：

1. Supabaseダッシュボードの「Authentication > Users」から手動削除
2. または、usersテーブルから直接削除（CASCADE設定があれば関連データも削除されます）