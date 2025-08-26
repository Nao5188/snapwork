-- Photo Video Manager Database Schema
-- Supabaseで実行するSQL

-- Enable Row Level Security (RLS)
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (スタッフユーザー情報)
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL CHECK (length(username) >= 3),
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Posts table (投稿情報)
CREATE TABLE posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(200) NOT NULL,
  menu_name VARCHAR(100) NOT NULL,
  media_url TEXT NOT NULL,
  is_video BOOLEAN DEFAULT FALSE,
  likes_count INTEGER DEFAULT 0 CHECK (likes_count >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media library table (メディアライブラリ管理)
CREATE TABLE media_library (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  is_video BOOLEAN DEFAULT FALSE,
  duration INTEGER, -- 動画の場合の長さ（秒）
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_media_library_user_id ON media_library(user_id);
CREATE INDEX idx_media_library_created_at ON media_library(created_at DESC);
CREATE INDEX idx_users_username ON users(username);

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Posts table policies
CREATE POLICY "Users can view all posts" ON posts
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own posts" ON posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts" ON posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON posts
  FOR DELETE USING (auth.uid() = user_id);

-- Media library table policies
CREATE POLICY "Users can view own media" ON media_library
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media" ON media_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media" ON media_library
  FOR DELETE USING (auth.uid() = user_id);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at 
  BEFORE UPDATE ON posts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data (開発用)
-- 本番環境では削除してください
INSERT INTO users (id, username, display_name, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'staff_user', 'スタッフユーザー', 'staff@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO posts (user_id, title, menu_name, media_url, is_video, likes_count) VALUES
  ('00000000-0000-0000-0000-000000000001', '本日のパスタ', 'カルボナーラ', 'https://via.placeholder.com/400x400/FFB6C1/000000?text=Pasta', false, 42),
  ('00000000-0000-0000-0000-000000000001', 'デザート', 'ティラミス', 'https://via.placeholder.com/400x400/98FB98/000000?text=Dessert', false, 38),
  ('00000000-0000-0000-0000-000000000001', 'サラダ', 'シーザーサラダ', 'https://via.placeholder.com/400x400/87CEEB/000000?text=Video', true, 25),
  ('00000000-0000-0000-0000-000000000001', 'スープ', 'コーンスープ', 'https://via.placeholder.com/400x400/DDA0DD/000000?text=Soup', false, 31),
  ('00000000-0000-0000-0000-000000000001', 'メイン', 'ステーキ', 'https://via.placeholder.com/400x400/F0E68C/000000?text=Steak', false, 67),
  ('00000000-0000-0000-0000-000000000001', 'ドリンク', 'コーヒー', 'https://via.placeholder.com/400x400/D2691E/000000?text=Coffee', false, 18)
ON CONFLICT DO NOTHING;