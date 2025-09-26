// 欠落しているユーザープロフィールを修正するスクリプト
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // service roleが必要
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function fixMissingUserProfiles() {
  try {
    console.log('🔍 Checking for posts without corresponding user profiles...');
    
    // すべての投稿とuser_idを取得
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, user_id, title, created_at')
      .order('created_at', { ascending: false });

    if (postsError) {
      console.error('❌ Error fetching posts:', postsError);
      return;
    }

    console.log(`📊 Found ${posts.length} posts`);

    // ユニークなuser_idを取得
    const userIds = [...new Set(posts.map(post => post.user_id))];
    console.log(`👥 Unique users: ${userIds.length}`);

    // 既存のユーザープロフィールを取得
    const { data: existingUsers, error: usersError } = await supabase
      .from('users')
      .select('id, username, display_name, email')
      .in('id', userIds);

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    console.log(`✅ Found ${existingUsers.length} existing user profiles`);

    // 欠落しているuser_idを特定
    const existingUserIds = new Set(existingUsers.map(user => user.id));
    const missingUserIds = userIds.filter(userId => !existingUserIds.has(userId));

    console.log(`❌ Missing profiles for ${missingUserIds.length} users:`);
    missingUserIds.forEach(userId => {
      const userPosts = posts.filter(post => post.user_id === userId);
      console.log(`  - User ID: ${userId} (${userPosts.length} posts)`);
      userPosts.forEach(post => {
        console.log(`    * "${post.title}" (${post.created_at})`);
      });
    });

    // 各欠落ユーザーのauth情報を取得してプロフィールを作成
    for (const userId of missingUserIds) {
      console.log(`\n🔧 Processing user: ${userId}`);
      
      try {
        // auth.usersからユーザー情報を取得
        const { data: authData } = await supabase.auth.admin.getUserById(userId);
        const authUser = authData.user;

        if (!authUser) {
          console.log(`❌ No auth record found for ${userId}`);
          continue;
        }

        console.log(`📧 Auth user found: ${authUser.email}`);

        // ユーザープロフィールを作成
        const newProfile = {
          id: userId,
          email: authUser.email || `${userId}@unknown.com`,
          username: authUser.email ? authUser.email.split('@')[0] : `user_${userId.slice(-6)}`,
          display_name: authUser.email ? authUser.email.split('@')[0] : `User ${userId.slice(-4)}`,
          created_at: authUser.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log(`📝 Creating profile:`, newProfile);

        const { data: createdUser, error: createError } = await supabase
          .from('users')
          .insert(newProfile)
          .select()
          .single();

        if (createError) {
          console.error(`❌ Error creating profile for ${userId}:`, createError);
        } else {
          console.log(`✅ Created profile:`, createdUser);
        }
      } catch (error) {
        console.error(`❌ Error processing user ${userId}:`, error);
      }
    }

    console.log('\n✅ Process completed');
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

// スクリプト実行
if (require.main === module) {
  fixMissingUserProfiles().then(() => {
    console.log('Done');
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fixMissingUserProfiles };