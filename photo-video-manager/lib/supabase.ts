import { createClient } from '@supabase/supabase-js';

// Supabase設定
// 本番環境では環境変数を使用してください
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// データベーステーブル型定義
export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  title: string;
  menu_name: string;
  media_url: string;
  is_video: boolean;
  likes_count: number;
  created_at: string;
  updated_at: string;
}

// ユーザー関連の操作
export const userService = {
  // ユーザープロフィール取得
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  },

  // プロフィール更新
  async updateProfile(userId: string, updates: Partial<User>) {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  },

  // ユーザー名の重複チェック
  async checkUsernameAvailability(username: string, excludeUserId?: string) {
    let query = supabase
      .from('users')
      .select('id')
      .eq('username', username);
    
    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data.length === 0;
  },
};

// 投稿関連の操作
export const postService = {
  // 投稿取得（単一）
  async getPost(postId: string) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();
    
    if (error) throw error;
    return data;
  },

  // 投稿更新
  async updatePost(postId: string, updates: Partial<Post>) {
    const { data, error } = await supabase
      .from('posts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .single();
    
    if (error) throw error;
    return data;
  },
  // ユーザーの投稿一覧取得
  async getUserPosts(userId: string) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  // ユーザーの投稿数取得
  async getUserPostsCount(userId: string) {
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (error) throw error;
    return count || 0;
  },

  // 投稿作成
  async createPost(post: Omit<Post, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        ...post,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .single();
    
    if (error) throw error;
    return data;
  },

  // 投稿削除
  async deletePost(postId: string) {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);
    
    if (error) throw error;
  },
};

// 認証関連の操作
export const authService = {
  // サインアップ
  async signUp(email: string, password: string, userData: { username: string; display_name: string }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) throw error;
    
    // ユーザープロフィールをusersテーブルに作成
    if (data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        email,
        username: userData.username,
        display_name: userData.display_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    
    return data;
  },

  // サインイン
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    return data;
  },

  // サインアウト
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // 現在のユーザー取得
  getCurrentUser() {
    return supabase.auth.getUser();
  },

  // 認証状態の監視
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};