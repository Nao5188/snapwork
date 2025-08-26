# Database Setup Guide

## Supabaseプロジェクトの作成と設定

### 1. Supabaseアカウント作成
1. [Supabase](https://supabase.com)にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインアップ

### 2. 新しいプロジェクトの作成
1. 「New project」をクリック
2. Organization（組織）を選択または作成
3. プロジェクト情報を入力：
   - Project name: `photo-video-manager`
   - Database password: 強力なパスワードを設定
   - Region: 最寄りのリージョンを選択（Asia Northeast 1 (Tokyo)推奨）
4. 「Create new project」をクリック

### 3. データベーススキーマの実行
1. Supabaseダッシュボードで左メニューから「SQL Editor」を選択
2. `schema.sql`ファイルの内容をコピー&ペースト
3. 「Run」ボタンをクリックしてスキーマを実行

### 4. 環境変数の設定
1. Supabaseダッシュボードで「Settings」→「API」を選択
2. 以下の値をコピー：
   - Project URL
   - anon public key
3. プロジェクトルートに`.env.local`ファイルを作成
4. `.env.example`を参考に設定値を入力

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 5. 認証設定（オプション）
1. 「Authentication」→「Settings」を選択
2. 「Email confirmations」をオフにする（開発時）
3. 「User signups」をオンにする

## データベーステーブル構成

### users (ユーザー情報)
- `id`: UUID (Primary Key, auth.users参照)
- `username`: VARCHAR(50) (Unique, 3文字以上)
- `display_name`: VARCHAR(100)
- `avatar_url`: TEXT (Optional)
- `email`: VARCHAR(255)
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### posts (投稿情報)
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key → users.id)
- `title`: VARCHAR(200)
- `menu_name`: VARCHAR(100)
- `media_url`: TEXT
- `is_video`: BOOLEAN
- `likes_count`: INTEGER
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### media_library (メディアライブラリ)
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key → users.id)
- `filename`: VARCHAR(255)
- `file_path`: TEXT
- `file_size`: BIGINT
- `mime_type`: VARCHAR(100)
- `is_video`: BOOLEAN
- `duration`: INTEGER (動画の場合)
- `width`: INTEGER
- `height`: INTEGER
- `created_at`: TIMESTAMP

## セキュリティ

- Row Level Security (RLS) が有効
- ユーザーは自分のデータのみアクセス可能
- 投稿は全ユーザーが閲覧可能（スタッフ専用アプリのため）

## 使用方法

アプリケーションコードで：

```typescript
import { supabase, userService, postService } from '@/lib/supabase';

// プロフィール取得
const profile = await userService.getProfile(userId);

// プロフィール更新
await userService.updateProfile(userId, { 
  display_name: '新しい表示名',
  username: 'new_username'
});

// 投稿一覧取得
const posts = await postService.getUserPosts(userId);
```