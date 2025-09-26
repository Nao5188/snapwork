# Supabase手動設定ガイド

Photo Video Managerアプリ用のSupabaseプロジェクトを手動で設定する詳細な手順です。

## 📋 事前準備

- インターネット接続
- Webブラウザ（Chrome、Firefox、Safari等）
- GitHubアカウント（推奨）またはメールアドレス

---

## 🚀 ステップ1: Supabaseアカウント作成

### 1.1 Supabaseサイトにアクセス
1. Webブラウザで https://supabase.com にアクセス
2. 画面右上の **「Start your project」** ボタンをクリック

### 1.2 アカウント作成
1. **GitHubでサインアップ（推奨）**
   - 「Continue with GitHub」をクリック
   - GitHubアカウントでログイン
   - Supabaseへのアクセス許可

2. **メールでサインアップ**
   - 「Sign up with email」をクリック
   - メールアドレスとパスワードを入力
   - 認証メールを確認してアカウント有効化

---

## 🏗️ ステップ2: 新しいプロジェクト作成

### 2.1 プロジェクト作成開始
1. ダッシュボードで **「New project」** ボタンをクリック
2. Organization（組織）を選択
   - 初回の場合は自動的に個人組織が選択されます

### 2.2 プロジェクト詳細設定
以下の項目を正確に入力してください：

| 項目 | 設定値 | 説明 |
|------|--------|------|
| **Project name** | `photo-video-manager` | プロジェクト名（必須） |
| **Database password** | `強力なパスワード` | 12文字以上の複雑なパスワード |
| **Region** | `Asia Northeast 1 (Tokyo)` | 日本に最も近いサーバー |
| **Pricing plan** | `Free tier` | 無料プラン（開発用） |

### 2.3 パスワード要件
データベースパスワードは以下の条件を満たす必要があります：
- ✅ 12文字以上
- ✅ 大文字・小文字を含む
- ✅ 数字を含む
- ✅ 記号を含む
- ❌ 辞書に載っている単語は避ける

**例**: `PhotoApp2024!Secure#`

### 2.4 プロジェクト作成実行
1. **「Create new project」** をクリック
2. プロジェクト作成完了まで **2-3分** 待機
3. 「Project is ready」の表示を確認

---

## 💾 ステップ3: データベーススキーマ実行

### 3.1 SQL Editorにアクセス
1. 左側のメニューから **「SQL Editor」** をクリック
2. 新しいクエリエディタが開くことを確認

### 3.2 スキーマコードの準備
1. プロジェクトの `database/schema.sql` ファイルを開く
2. ファイル内容を **全て選択してコピー**（Ctrl+A → Ctrl+C）

### 3.3 SQLクエリ実行
1. SQL Editorの大きなテキストエリアに **貼り付け**（Ctrl+V）
2. 右下の **「Run」** ボタンをクリック
3. 実行完了まで待機（通常30秒程度）

### 3.4 実行結果の確認
成功した場合、以下のような結果が表示されます：
```
✅ Success. No rows returned
✅ Extension "uuid-ossp" created
✅ Table "users" created
✅ Table "posts" created
✅ Table "media_library" created
✅ 3 rows affected (sample data)
```

エラーが発生した場合：
- 赤色のエラーメッセージを確認
- スキーマコードが正しくコピーされているか確認
- 再度「Run」ボタンをクリック

---

## 🔑 ステップ4: API設定値取得

### 4.1 API設定ページにアクセス
1. 左側のメニューから **「Settings」** をクリック
2. サブメニューから **「API」** を選択

### 4.2 必要な値をコピー
以下の2つの値をメモ帳などに保存してください：

#### Project URL
```
https://abcdefgh12345678.supabase.co
```
- 「Configuration」セクションの **「URL」** 欄
- 「Copy」ボタンをクリックしてコピー

#### API Key (anon public)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（長い文字列）
```
- 「Project API keys」セクションの **「anon public」** 欄
- 「Copy」ボタンをクリックしてコピー

⚠️ **重要**: `service_role`キーは**絶対にアプリで使用しないでください**（セキュリティリスク）

---

## 📝 ステップ5: 環境変数ファイル設定

### 5.1 .env.localファイルを開く
プロジェクトルートの `.env.local` ファイルを編集します。

### 5.2 設定値を入力
```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here
```

### 5.3 設定完了
以下は記入例です。実際の値はリポジトリにコミットせず、ローカルの `.env.local` だけに保存してください：
1. **Project URL**: `https://your-project-id.supabase.co`
2. **API Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
3. **Database Password**: `REDACTED_DATABASE_PASSWORD`
4. ファイルを **保存**（Ctrl+S）

---

## 🔐 ステップ6: 認証設定（オプション）

開発を簡単にするため、以下の設定を調整します：

### 6.1 Authentication設定
1. 左側メニューから **「Authentication」** をクリック
2. **「Settings」** タブを選択

### 6.2 開発用設定の調整
| 設定項目 | 推奨値 | 説明 |
|----------|--------|------|
| **Enable email confirmations** | `OFF` | 開発時はメール確認をスキップ |
| **Enable phone confirmations** | `OFF` | 電話番号確認をスキップ |
| **Enable signup** | `ON` | 新規アカウント作成を許可 |

---

## ✅ ステップ7: 設定完了確認

### 7.1 データベーステーブル確認
1. 左側メニューから **「Table Editor」** をクリック
2. 以下のテーブルが作成されていることを確認：
   - ✅ `users` テーブル
   - ✅ `posts` テーブル 
   - ✅ `media_library` テーブル

### 7.2 サンプルデータ確認
1. `users` テーブルをクリック
2. 1件のサンプルユーザーが存在することを確認
3. `posts` テーブルをクリック
4. 6件のサンプル投稿が存在することを確認

### 7.3 アプリ接続テスト
```bash
# プロジェクトディレクトリで実行
npm start
```
- アプリが正常に起動することを確認
- エラーが発生しないことを確認

---

## 🚨 トラブルシューティング

### よくあるエラーと解決方法

#### エラー1: 「Project creation failed」
**原因**: プロジェクト名の重複またはネットワークエラー
**解決策**: 
- 異なるプロジェクト名を使用
- インターネット接続を確認
- しばらく時間をおいて再試行

#### エラー2: 「SQL execution failed」
**原因**: スキーマコードのコピーミス
**解決策**:
- `database/schema.sql` を再度コピー
- 空白文字やBOM文字を削除
- エディタで文字エンコーディングをUTF-8に設定

#### エラー3: 「Invalid API key」
**原因**: APIキーのコピーミスまたは古いキー
**解決策**:
- Supabase > Settings > API でキーを再コピー
- `.env.local` ファイルの余計なスペースを削除
- アプリを再起動（npm start）

#### エラー4: 「Connection timeout」
**原因**: ネットワークまたはRegion設定の問題
**解決策**:
- Wi-Fi/ネットワーク接続を確認
- 別のRegion（Asia Southeast等）を試す
- VPNを使用している場合は無効にする

---

## 📞 サポート情報

### 公式ドキュメント
- [Supabase Documentation](https://supabase.com/docs)
- [Getting Started Guide](https://supabase.com/docs/guides/getting-started)

### コミュニティサポート
- [Discord](https://discord.supabase.com/)
- [GitHub Discussions](https://github.com/supabase/supabase/discussions)

---

## 🎯 次のステップ

設定完了後は以下を実行してください：

1. **アプリケーションのテスト**
   ```bash
   npm start
   ```

2. **ログイン機能のテスト**
   - 新規アカウント作成
   - ログイン/ログアウト

3. **データベース操作のテスト**
   - プロフィール編集
   - 投稿表示

4. **本番環境への準備**
   - 環境変数の分離
   - セキュリティ設定の強化

---

**🎉 お疲れさまでした！Supabaseのセットアップが完了しました。**