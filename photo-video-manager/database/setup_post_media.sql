-- ======================================
-- Post Media テーブル追加スクリプト
-- ======================================
-- このスクリプトは既存のデータベースに post_media テーブルを追加します
-- Supabase SQL Editor で実行してください

-- Post media table (投稿の複数メディア管理)
CREATE TABLE IF NOT EXISTS post_media (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT NOT NULL,
  is_video BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_media_display_order ON post_media(display_order);

-- Row Level Security
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid errors on re-run)
DROP POLICY IF EXISTS "Users can view all post media" ON post_media;
DROP POLICY IF EXISTS "Users can insert own post media" ON post_media;
DROP POLICY IF EXISTS "Users can update own post media" ON post_media;
DROP POLICY IF EXISTS "Users can delete own post media" ON post_media;

-- Post media table policies
CREATE POLICY "Users can view all post media" ON post_media
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own post media" ON post_media
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = post_media.post_id
      AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own post media" ON post_media
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = post_media.post_id
      AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own post media" ON post_media
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = post_media.post_id
      AND posts.user_id = auth.uid()
    )
  );

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ post_media table created successfully!';
  RAISE NOTICE 'You can now use multiple media per post.';
END $$;
