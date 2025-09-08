import { createClient } from '@supabase/supabase-js';
import { storageService } from './storage';

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

  // 表示名の重複チェック
  async checkDisplayNameAvailability(displayName: string, excludeUserId?: string) {
    let query = supabase
      .from('users')
      .select('id')
      .eq('display_name', displayName);
    
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
    // まず投稿が存在し、現在のユーザーが所有者かチェック
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('認証が必要です');
    }

    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single();

    if (!post) {
      throw new Error('投稿が見つかりません');
    }

    if (post.user_id !== user.id) {
      throw new Error('この投稿を編集する権限がありません');
    }

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
    console.log('Creating post:', post);
    
    const { data, error } = await supabase
      .from('posts')
      .insert({
        ...post,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) {
      console.error('Post creation error:', error);
      throw error;
    }
    
    console.log('Post created successfully:', data);
    return data;
  },

  // 投稿削除
  async deletePost(postId: string) {
    // まず投稿が存在し、現在のユーザーが所有者かチェック
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('認証が必要です');
    }

    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single();

    if (!post) {
      throw new Error('投稿が見つかりません');
    }

    if (post.user_id !== user.id) {
      throw new Error('この投稿を削除する権限がありません');
    }

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);
    
    if (error) throw error;
  },
};

// メディアライブラリ関連の操作
export const mediaLibraryService = {
  // メディアをライブラリに追加
  async addMedia(media: {
    user_id: string;
    filename: string;
    file_path: string;
    file_size?: number;
    mime_type?: string;
    is_video: boolean;
    duration?: number;
    width?: number;
    height?: number;
  }) {
    const { data, error } = await supabase
      .from('media_library')
      .insert({
        ...media,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // ユーザーのメディア一覧取得
  async getUserMedia(userId: string) {
    const { data, error } = await supabase
      .from('media_library')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  // メディア削除
  async deleteMedia(mediaId: string) {
    const { error } = await supabase
      .from('media_library')
      .delete()
      .eq('id', mediaId);
    
    if (error) throw error;
  },
};

// 認証関連の操作
export const authService = {
  // サインアップ
  async signUp(email: string, password: string, userData: { username: string; display_name: string }) {
    // まず既存ユーザーをチェック（usersテーブル）
    const { data: existingUsers } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      throw new Error('User already registered');
    }

    // ユーザー名の重複チェック（念のため二重チェック）
    const { data: existingUsername } = await supabase
      .from('users')
      .select('username')
      .eq('username', userData.username)
      .limit(1);

    if (existingUsername && existingUsername.length > 0) {
      throw new Error('Username already exists');
    }

    // 表示名の重複チェック（念のため二重チェック）
    const { data: existingDisplayName } = await supabase
      .from('users')
      .select('display_name')
      .eq('display_name', userData.display_name)
      .limit(1);

    if (existingDisplayName && existingDisplayName.length > 0) {
      throw new Error('Display name already exists');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) throw error;

    // data.userがnullの場合や、既存ユーザーの場合の追加チェック
    if (!data.user) {
      throw new Error('User already registered');
    }

    // data.user.identitiesが空の場合、既存ユーザーの可能性
    if (data.user.identities && data.user.identities.length === 0) {
      throw new Error('User already registered');
    }
    
    // ユーザープロフィールをusersテーブルに作成
    try {
      const { error: insertError } = await supabase.from('users').insert({
        id: data.user.id,
        email,
        username: userData.username,
        display_name: userData.display_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      if (insertError) {
        console.error('User profile creation error:', insertError);
        throw insertError;
      }
    } catch (profileError) {
      console.error('Failed to create user profile:', profileError);
      throw profileError;
    }
    
    return data;
  },

  // サインイン
  async signIn(email: string, password: string, rememberMe: boolean = false) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    // ログイン時にusersテーブルにプロフィールが存在するか確認し、なければ作成
    if (data.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .single();
      
      if (!profile) {
        try {
          await supabase.from('users').insert({
            id: data.user.id,
            email: data.user.email || '',
            username: data.user.email?.split('@')[0] || 'user',
            display_name: data.user.email?.split('@')[0] || 'User',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (profileError) {
          console.error('Failed to create user profile on signin:', profileError);
        }
      }

      // Remember Me設定を保存
      try {
        await storageService.setRememberMe(email, rememberMe);
      } catch (storageError) {
        console.error('Failed to save remember me setting:', storageError);
      }
    }
    
    return data;
  },

  // サインアウト
  async signOut() {
    // Remember Me設定をクリア
    try {
      await storageService.clearRememberMe();
    } catch (storageError) {
      console.error('Failed to clear remember me setting:', storageError);
    }
    
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

  // 自動ログインを試行
  async attemptAutoLogin() {
    try {
      const rememberMeData = await storageService.getRememberMe();
      
      if (!rememberMeData || !rememberMeData.autoLoginEnabled) {
        return { success: false, reason: 'Auto login not enabled' };
      }

      // Supabaseの現在のセッションを確認
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        // セッションが無効の場合はRemember Me設定をクリア
        await storageService.clearRememberMe();
        return { success: false, reason: 'No valid session' };
      }

      return { success: true, user, email: rememberMeData.email };
    } catch (error) {
      console.error('Auto login attempt failed:', error);
      return { success: false, reason: 'Auto login failed', error };
    }
  },
};