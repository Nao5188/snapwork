-- ============================================
-- ユーザープロフィール自動作成トリガー
-- ============================================
-- 目的: auth.users に新規ユーザーが作成された時に
--       自動的に public.users テーブルにプロフィールを作成
-- ============================================
--
-- Supabase SQL Editor で実行してください
-- ============================================

-- 1. 既存のトリガーと関数を削除（再実行可能にするため）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. プロフィール自動作成関数
-- ※ EXCEPTION句は意図的に削除
-- 理由: 失敗時はAuth登録ごと失敗させ、不整合状態を防ぐ
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    username,
    display_name,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    -- usernameはmetadataから取得、なければemail/IDから生成
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      CASE
        WHEN NEW.email IS NOT NULL
          THEN LOWER(SPLIT_PART(NEW.email, '@', 1)) || '_' || SUBSTRING(NEW.id::text, 1, 8)
        ELSE 'user_' || SUBSTRING(NEW.id::text, 1, 8)
      END
    ),
    -- display_nameはmetadataから取得、なければemail/@前またはデフォルト
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      CASE
        WHEN NEW.email IS NOT NULL
          THEN SPLIT_PART(NEW.email, '@', 1)
        ELSE 'User'
      END
    ),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- 3. auth.users テーブルへのトリガーを作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. 確認用: 作成されたトリガーを表示
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
