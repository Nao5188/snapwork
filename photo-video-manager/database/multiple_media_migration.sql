-- 複数メディア対応のための追加テーブル
-- Supabaseで実行するSQL

-- Post media table (投稿のメディアファイル管理)
CREATE TABLE IF NOT EXISTS post_media (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT NOT NULL,
  is_video BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_media_display_order ON post_media(post_id, display_order);

-- Row Level Security (RLS) Policies
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;

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

-- 既存投稿データを新しいテーブルに移行
INSERT INTO post_media (post_id, media_url, is_video, display_order)
SELECT id, media_url, is_video, 0
FROM posts
WHERE media_url IS NOT NULL AND media_url != ''
ON CONFLICT DO NOTHING;