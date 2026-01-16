-- ============================================
-- 他ユーザーのプロフィール閲覧を許可するRLSポリシー修正
-- ============================================
-- 実行日: 2026-01-14
-- 目的: 投稿履歴画面で他ユーザーのアバターを表示可能にする
-- ============================================

-- 既存のSELECTポリシーを削除
DROP POLICY IF EXISTS "Users can view own profile" ON users;

-- 新しいポリシー: 認証済みユーザーは全ユーザーのプロフィールを閲覧可能
-- （投稿フィードで他ユーザーの情報を表示するため）
CREATE POLICY "Authenticated users can view all profiles" ON users
  FOR SELECT USING (auth.role() = 'authenticated');

-- 確認用クエリ（実行後に削除可能）
-- SELECT * FROM pg_policies WHERE tablename = 'users';
