-- ユーザープロフィール作成のためのDatabase Function
-- これをSupabase SQL Editorで実行してください

CREATE OR REPLACE FUNCTION create_user_profile(
  user_id uuid,
  user_email text,
  user_username text,
  user_display_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- これにより関数は作成者の権限で実行され、RLSを回避できます
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- ユーザープロフィールを作成
  INSERT INTO public.users (
    id,
    email,
    username,
    display_name,
    created_at,
    updated_at
  ) VALUES (
    user_id,
    user_email,
    user_username,
    user_display_name,
    now(),
    now()
  ) RETURNING to_json(users.*) INTO result;
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- エラー情報を返す
    RETURN json_build_object(
      'error', true,
      'message', SQLERRM,
      'code', SQLSTATE
    );
END;
$$;

-- この関数に対してanon roleに実行権限を付与
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text) TO authenticated;