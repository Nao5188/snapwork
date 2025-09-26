/**
 * ユーザープロフィール情報デバッグスクリプト
 * 
 * 実行方法:
 * node scripts/debugUsers.js
 * 
 * このスクリプトでデータベースの現在のユーザー情報を確認できます
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase設定
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugAllUsers() {
  console.log('🔍 Debugging user profiles...\n');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase configuration. Please check your .env file.');
    process.exit(1);
  }

  try {
    // 全ユーザーを取得
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    console.log(`📊 Found ${users?.length || 0} users in database:\n`);

    if (!users || users.length === 0) {
      console.log('🚨 No users found in the users table!');
      console.log('💡 You may need to run: node scripts/createTestUsers.js');
      return;
    }

    // 各ユーザーの詳細を表示
    users.forEach((user, index) => {
      console.log(`${index + 1}. User ID: ${user.id}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Username: ${user.username || 'N/A'}`);
      console.log(`   Display Name: ${user.display_name || 'N/A'}`);
      console.log(`   Avatar URL: ${user.avatar_url || 'N/A'}`);
      console.log(`   Created: ${user.created_at || 'N/A'}`);
      console.log('');
    });

    // 投稿データも取得
    console.log('📝 Checking posts...\n');
    
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (postsError) {
      console.error('❌ Error fetching posts:', postsError);
      return;
    }

    console.log(`📊 Found ${posts?.length || 0} posts in database:\n`);

    if (posts && posts.length > 0) {
      posts.forEach((post, index) => {
        console.log(`${index + 1}. Post ID: ${post.id}`);
        console.log(`   Title: ${post.title || 'N/A'}`);
        console.log(`   User ID: ${post.user_id || 'N/A'}`);
        console.log(`   Created: ${post.created_at || 'N/A'}`);
        
        // この投稿のユーザーがusersテーブルに存在するかチェック
        const userExists = users.find(u => u.id === post.user_id);
        if (userExists) {
          console.log(`   ✅ User profile exists: ${userExists.display_name || userExists.username}`);
        } else {
          console.log(`   ❌ User profile MISSING for user_id: ${post.user_id}`);
        }
        console.log('');
      });
    }

    // 不整合チェック
    console.log('🔍 Checking for data inconsistencies...\n');
    
    const postsWithoutUsers = posts?.filter(post => 
      !users.find(user => user.id === post.user_id)
    ) || [];

    if (postsWithoutUsers.length > 0) {
      console.log('🚨 Posts without corresponding user profiles:');
      postsWithoutUsers.forEach(post => {
        console.log(`   - Post "${post.title}" (ID: ${post.id}) by user_id: ${post.user_id}`);
      });
      console.log('');
      console.log('💡 Recommendation: Run createMissingUserProfile for these user IDs');
    } else {
      console.log('✅ All posts have corresponding user profiles');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// スクリプト実行
if (require.main === module) {
  debugAllUsers()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { debugAllUsers };