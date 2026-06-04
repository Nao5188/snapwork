import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageService as localStorageService } from './storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.error('[Supabase] 環境変数が設定されていません。.envファイルにEXPO_PUBLIC_SUPABASE_URLとEXPO_PUBLIC_SUPABASE_ANON_KEYを設定してください。');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

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
  store_id?: string | null;
  title: string;
  menu_name: string;
  media_url: string;
  is_video: boolean;
  likes_count: number;
  review_status?: 'pending' | 'approved' | 'revision_requested' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface PostMedia {
  id: string;
  post_id: string;
  media_url: string;
  is_video: boolean;
  display_order: number;
  created_at: string;
}

export interface Store {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface StoreMember {
  id: string;
  store_id: string;
  user_id: string;
  role: 'owner' | 'staff';
  created_at: string;
  store?: Store;
}

// ファイルアップロード関連の操作
export const fileStorageService = {
  // アバター画像をアップロード
  async uploadAvatar(userId: string, imageUri: string) {
    try {
      // ファイル拡張子を取得
      const fileExtension = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      // ユーザーIDをフォルダとして使用し、RLSポリシーと一致させる
      const fileName = `${userId}/avatar_${Date.now()}.${fileExtension}`;

      // fetchを使用してローカルファイルを読み込み、blobに変換
      const response = await fetch(imageUri);

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      // Blobを取得
      const blob = await response.blob();

      // React Native用のBlob処理
      // FileReaderを使用してBlobをArrayBufferに変換
      const fileReaderPromise = new Promise<ArrayBuffer>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          if (fileReader.result instanceof ArrayBuffer) {
            resolve(fileReader.result);
          } else {
            reject(new Error('FileReader did not return ArrayBuffer'));
          }
        };
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsArrayBuffer(blob);
      });

      const arrayBuffer = await fileReaderPromise;
      const uint8Array = new Uint8Array(arrayBuffer);

      // Supabase Storageにアップロード
      const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, uint8Array, {
          contentType: blob.type || `image/${fileExtension}`,
          upsert: true
        });

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      // 公開URLを取得
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      throw error;
    }
  },

  // 古いアバター画像を削除
  async deleteAvatar(avatarUrl: string) {
    try {
      if (!avatarUrl || avatarUrl.startsWith('file://') || avatarUrl.includes('placeholder')) {
        return; // ローカルファイルやプレースホルダーは削除しない
      }

      // URLから Supabase Storage のパスを抽出
      // 形式: https://xxx.supabase.co/storage/v1/object/public/avatars/userId/filename.ext
      const url = new URL(avatarUrl);
      const publicPathPrefix = '/storage/v1/object/public/avatars/';
      const filePath = url.pathname.startsWith(publicPathPrefix)
        ? url.pathname.slice(publicPathPrefix.length)
        : url.pathname.split('/').slice(-2).join('/');

      console.log('Deleting old avatar:', filePath);

      const { error } = await supabase.storage
        .from('avatars')
        .remove([filePath]);

      if (error) {
        console.error('Delete error:', error);
        // 削除エラーは致命的でないので続行
      }
    } catch (error) {
      console.error('Failed to delete avatar:', error);
      // 削除エラーは致命的でないので続行
    }
  },

  // 投稿画像をアップロード
  async uploadPostImage(userId: string, imageUri: string, postId?: string): Promise<string> {
    try {
      // すでに公開URLの場合はそのまま返す
      if (imageUri.startsWith('https://') || imageUri.startsWith('http://')) {
        return imageUri;
      }

      // ファイル拡張子を取得
      const fileExtension = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      // ユーザーIDをフォルダとして使用
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const fileName = `${userId}/${postId || 'temp'}_${timestamp}_${randomStr}.${fileExtension}`;

      // fetchを使用してローカルファイルを読み込み、blobに変換
      const response = await fetch(imageUri);

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      // Blobを取得
      const blob = await response.blob();

      // FileReaderを使用してBlobをArrayBufferに変換
      const fileReaderPromise = new Promise<ArrayBuffer>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          if (fileReader.result instanceof ArrayBuffer) {
            resolve(fileReader.result);
          } else {
            reject(new Error('FileReader did not return ArrayBuffer'));
          }
        };
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsArrayBuffer(blob);
      });

      const arrayBuffer = await fileReaderPromise;
      const uint8Array = new Uint8Array(arrayBuffer);

      // Supabase Storageにアップロード (posts バケットを使用)
      const videoExtensions = ['mp4', 'mov', 'avi', 'webm', 'm4v'];
      const isVideoFile = videoExtensions.includes(fileExtension.toLowerCase());
      const contentType = blob.type || (isVideoFile ? `video/${fileExtension}` : `image/${fileExtension}`);

      const { error } = await supabase.storage
        .from('posts')
        .upload(fileName, uint8Array, {
          contentType,
          upsert: true
        });

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      // 公開URLを取得
      const { data: publicUrlData } = supabase.storage
        .from('posts')
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (error) {
      console.error('Failed to upload post image:', error);
      throw error;
    }
  },
};

// ユーザー関連の操作
const generateInviteCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

export const storeService = {
  async hasMembership(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('store_members')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          return true;
        }
        throw error;
      }

      return (data ?? []).length > 0;
    } catch (error) {
      const storeError = error as { code?: string; message?: string };
      if (
        storeError.code === '42P01' ||
        storeError.code === 'PGRST205' ||
        storeError.message?.includes('store_members')
      ) {
        return true;
      }

      console.warn('Failed to check store membership:', error);
      return true;
    }
  },

  async getMyMemberships(userId: string): Promise<StoreMember[]> {
    const { data, error } = await supabase
      .from('store_members')
      .select('id, store_id, user_id, role, created_at, store:stores(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as StoreMember[];
  },

  async getActiveStoreId(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('store_members')
      .select('store_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return null;
      }
      throw error;
    }

    return data?.store_id ?? null;
  },

  async createStore(userId: string, name: string): Promise<Store> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteCode = generateInviteCode();
      const { data, error } = await supabase.rpc('create_store_with_owner', {
        p_store_name: name,
        p_invite_code: inviteCode,
      });

      if (!error && data) {
        return data as Store;
      }

      if (error?.code !== '23505') {
        throw error;
      }
    }

    throw new Error('招待コードの生成に失敗しました。もう一度お試しください。');
  },

  async joinStore(userId: string, inviteCode: string): Promise<StoreMember> {
    const { data, error } = await supabase.rpc('join_store_by_invite_code', {
      p_invite_code: inviteCode,
    });

    if (error) throw error;
    return data as StoreMember;
  },
};

export const userService = {
  async ensureProfile(user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, any> | null;
  }, userData?: { username?: string; display_name?: string }) {
    const metadata = user.user_metadata ?? {};
    const email = user.email ?? '';
    const emailName = email.includes('@') ? email.split('@')[0] : '';
    const rawUsername = userData?.username || metadata.username || emailName || `user_${user.id.slice(0, 8)}`;
    const sanitizedUsername = rawUsername
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 42);
    const username = sanitizedUsername.length >= 3
      ? sanitizedUsername
      : `user_${user.id.slice(0, 8)}`;
    const displayName = userData?.display_name ||
      metadata.display_name ||
      metadata.name ||
      emailName ||
      'ユーザー';

    const { data: existingProfile, error: checkError } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, email')
      .eq('id', user.id)
      .maybeSingle();

    if (checkError) {
      throw checkError;
    }

    if (existingProfile) {
      return existingProfile;
    }

    const { data, error } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email,
        username,
        display_name: displayName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, username, display_name, avatar_url, email')
      .single();

    if (error) throw error;
    return data;
  },

  // ユーザープロフィール取得
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Profile fetch error:', error);
      throw error;
    }

    return data;
  },

  // プロフィール更新
  async updateProfile(userId: string, updates: Partial<User>) {
    // 既存のプロフィールを取得
    const { data: currentProfile } = await supabase
      .from('users')
      .select('avatar_url')
      .eq('id', userId)
      .single();

    // アバターURLがローカルファイルパスの場合、自動的にSupabase Storageにアップロード
    let finalUpdates = { ...updates };
    if (updates.avatar_url && updates.avatar_url.startsWith('file://')) {
      try {
        console.log('Auto-uploading local avatar to Supabase Storage:', updates.avatar_url);
        const publicUrl = await fileStorageService.uploadAvatar(userId, updates.avatar_url);
        finalUpdates.avatar_url = publicUrl;
        
        // 古い画像を削除（もしあれば）
        if (currentProfile?.avatar_url && !currentProfile.avatar_url.startsWith('file://') && !currentProfile.avatar_url.includes('placeholder')) {
          try {
            await fileStorageService.deleteAvatar(currentProfile.avatar_url);
          } catch (deleteError) {
            console.warn('Failed to delete old avatar:', deleteError);
          }
        }
      } catch (uploadError) {
        console.warn('Failed to auto-upload avatar, using original URL:', uploadError);
        // アップロードに失敗した場合は元のURLを使用
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update({
        ...finalUpdates,
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
    return (data ?? []).length === 0;
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
    return (data ?? []).length === 0;
  },

  // 欠落しているユーザープロフィールを作成（通常のアプリ内では使用しない）
  async createMissingUserProfile(userId: string, email?: string) {
    try {
      console.log(`🔍 Checking for existing profile for user: ${userId}`);
      
      // 既存プロフィールをチェック（完全なデータを取得）
      const { data: existingProfile, error: checkError } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, email')
        .eq('id', userId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116は行が見つからないエラー
        console.error('Error checking for existing profile:', checkError);
        throw checkError;
      }

      if (existingProfile) {
        console.log(`✅ Profile already exists for ${userId}:`, existingProfile);
        return existingProfile; // 既に存在する場合はそのまま返す
      }

      console.log(`❌ No profile found for ${userId}. RLS prevents profile creation from client.`);
      console.log(`⚠️  Please run the fixMissingUserProfiles.js script with service role key.`);
      
      // RLSポリシーにより通常のクライアントからは作成できないため、nullを返す
      return null;
    } catch (error) {
      console.error('❌ Failed to create missing user profile:', error);
      return null;
    }
  },

  // 既存のローカル画像を一括でSupabase Storageに移行
  async migrateLocalAvatarsToStorage() {
    try {
      console.log('Starting avatar migration to Supabase Storage...');
      
      // ローカルファイルパスを持つユーザーを取得
      const { data: usersWithLocalAvatars, error } = await supabase
        .from('users')
        .select('id, avatar_url, username')
        .like('avatar_url', 'file://%');

      if (error) {
        console.error('Failed to fetch users with local avatars:', error);
        return { success: false, error };
      }

      if (!usersWithLocalAvatars || usersWithLocalAvatars.length === 0) {
        console.log('No users with local avatars found');
        return { success: true, migrated: 0 };
      }

      console.log(`Found ${usersWithLocalAvatars.length} users with local avatars`);
      
      let successCount = 0;
      let errorCount = 0;

      for (const user of usersWithLocalAvatars) {
        try {
          console.log(`Migrating avatar for user ${user.username} (${user.id})`);
          
          // ローカル画像をアップロード
          const publicUrl = await fileStorageService.uploadAvatar(user.id, user.avatar_url);
          
          // データベースを更新
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              avatar_url: publicUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

          if (updateError) {
            console.error(`Failed to update user ${user.id}:`, updateError);
            errorCount++;
          } else {
            console.log(`Successfully migrated avatar for user ${user.username}`);
            successCount++;
          }
        } catch (migrationError) {
          console.error(`Failed to migrate avatar for user ${user.id}:`, migrationError);
          errorCount++;
        }
      }

      console.log(`Migration completed: ${successCount} success, ${errorCount} errors`);
      return { 
        success: true, 
        migrated: successCount, 
        errors: errorCount,
        total: usersWithLocalAvatars.length 
      };
    } catch (error) {
      console.error('Avatar migration failed:', error);
      return { success: false, error };
    }
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

    const { error } = await supabase
      .from('posts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    if (error) throw error;
  },
  // ユーザーの投稿一覧取得
  async getUserPosts(userId: string, storeId?: string | null) {
    const activeStoreId = storeId ?? await storeService.getActiveStoreId(userId);

    if (!activeStoreId) {
      return [];
    }

    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .eq('store_id', activeStoreId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  // ユーザーの投稿数取得
  async getUserPostsCount(userId: string, storeId?: string | null) {
    const activeStoreId = storeId ?? await storeService.getActiveStoreId(userId);

    if (!activeStoreId) {
      return 0;
    }

    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('store_id', activeStoreId);
    
    if (error) throw error;
    return count || 0;
  },

  async getUserApprovedPostsCount(userId: string, storeId?: string | null) {
    const activeStoreId = storeId ?? await storeService.getActiveStoreId(userId);

    if (!activeStoreId) {
      return 0;
    }

    const { count, error } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('store_id', activeStoreId)
      .eq('review_status', 'approved');

    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204' || error.message.includes('review_status')) {
        console.warn('review_status column not available, returning 0 approved posts:', error.message);
        return 0;
      }

      throw error;
    }

    return count || 0;
  },

  // 投稿作成
  async createPost(post: Omit<Post, 'id' | 'created_at' | 'updated_at'>) {
    const storeId = post.store_id ?? await storeService.getActiveStoreId(post.user_id);

    if (!storeId) {
      throw new Error('所属店舗が見つかりません。店舗を作成または参加してから投稿してください。');
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        ...post,
        store_id: storeId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Post creation error:', error);
      throw error;
    }

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

  // 投稿のメディアを取得
  async getPostMedia(postId: string) {
    try {
      const { data, error } = await supabase
        .from('post_media')
        .select('*')
        .eq('post_id', postId)
        .order('display_order', { ascending: true });

      if (error) {
        // post_mediaテーブルが存在しない場合は空配列を返す
        console.warn('post_media table not found, returning empty array:', error.message);
        return [];
      }
      return data || [];
    } catch (error) {
      console.warn('Error accessing post_media table:', error);
      return [];
    }
  },

  // 投稿のメディアを設定（既存を削除して新規追加）
  async setPostMedia(postId: string, mediaItems: {
    media_url: string;
    is_video: boolean;
    display_order: number;
  }[]) {
    try {
      console.log(`=== SETTING POST MEDIA FOR ${postId} ===`);
      console.log('Media items to insert:', mediaItems);

      // まず既存のメディアを削除
      console.log('Deleting existing media...');
      const { error: deleteError } = await supabase
        .from('post_media')
        .delete()
        .eq('post_id', postId);

      if (deleteError) {
        console.warn('Error deleting post_media, table may not exist:', deleteError.message);
        // テーブルが存在しない場合は処理を続行
        if (!deleteError.message.includes('does not exist') && !deleteError.message.includes('not found')) {
          throw deleteError;
        }
      }

      // 新しいメディアを追加
      if (mediaItems.length > 0) {
        const { data, error: insertError } = await supabase
          .from('post_media')
          .insert(
            mediaItems.map(item => ({
              post_id: postId,
              ...item,
              created_at: new Date().toISOString(),
            }))
          )
          .select();

        if (insertError) {
          console.warn('Error inserting post_media, table may not exist:', insertError.message);
          // テーブルが存在しない場合は空配列を返す
          if (insertError.message.includes('does not exist') || insertError.message.includes('not found')) {
            return [];
          }
          throw insertError;
        }
        return data;
      }

      return [];
    } catch (error) {
      console.warn('Error in setPostMedia:', error);
      return [];
    }
  },

  // 複数メディア対応の投稿取得
  async getPostWithMedia(postId: string) {
    const [post, mediaItems] = await Promise.all([
      this.getPost(postId),
      this.getPostMedia(postId)
    ]);

    return {
      ...post,
      mediaItems
    };
  },

  // 複数メディア対応のユーザー投稿一覧取得
  async getUserPostsWithMedia(userId: string) {
    const posts = await this.getUserPosts(userId);

    // 各投稿のメディアを取得
    const postsWithMedia = await Promise.all(
      posts.map(async (post) => {
        const mediaItems = await this.getPostMedia(post.id);
        return {
          ...post,
          mediaItems
        };
      })
    );

    return postsWithMedia;
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
  async signUp(email: string, password: string, userData: { username: string; display_name: string }, emailRedirectTo?: string) {
    // まず既存ユーザーをチェック（usersテーブル）
    const { data: existingUsers } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      throw new Error('User already registered');
    }

    // display_name重複チェックはUI層（login.tsx）で実施済みのためここでは省略

    // サインアップ時にmetadataにユーザー情報を渡す
    // Database Triggerがこの情報を使ってプロフィールを自動作成
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          username: userData.username,
          display_name: userData.display_name,
        }
      }
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

    // Database Triggerがプロフィールを自動作成する
    // トリガーが SECURITY DEFINER で設定されているため、
    // auth.users への INSERT と同時にプロフィールが作成される
    // 開発環境でトリガー未適用の場合に備え、セッションがある場合はクライアント側でも補完する
    try {
      await userService.ensureProfile(data.user, userData);
    } catch (profileError) {
      console.warn('Failed to ensure user profile after signup:', profileError);
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
    
    // ログイン時にusersテーブルにプロフィールが存在するか確認
    if (data.user) {
      const { data: profile, error: profileCheckError } = await supabase
        .from('users')
        .select('id, username, display_name, email')
        .eq('id', data.user.id)
        .single();
      
      if (profileCheckError && profileCheckError.code !== 'PGRST116') {
        console.error('Error checking profile:', profileCheckError);
      }

      if (!profile) {
        try {
          await userService.ensureProfile(data.user);
        } catch (profileCreateError) {
          console.error('Failed to create missing signed-in profile:', profileCreateError);
          throw new Error('ユーザープロフィールが見つかりません。アカウントが正しく作成されていない可能性があります。');
        }
      }

      // Remember Me設定を保存
      try {
        await localStorageService.setRememberMe(email, rememberMe);
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
      await localStorageService.clearRememberMe();
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

  // パスワードリセットメールを送信
  async resetPassword(email: string, redirectTo: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  },

  // パスワードを更新
  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  // 自動ログインを試行
  async attemptAutoLogin() {
    try {
      const rememberMeData = await localStorageService.getRememberMe();
      
      if (!rememberMeData || !rememberMeData.autoLoginEnabled) {
        return { success: false, reason: 'Auto login not enabled' };
      }

      // Supabaseの現在のセッションを確認
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        // セッションが無効またはリフレッシュトークン切れの場合はセッションとRemember Me設定をクリア
        await supabase.auth.signOut();
        await localStorageService.clearRememberMe();
        return { success: false, reason: 'No valid session' };
      }

      return { success: true, user, email: rememberMeData.email };
    } catch (error) {
      console.error('Auto login attempt failed:', error);
      return { success: false, reason: 'Auto login failed', error };
    }
  },
};
