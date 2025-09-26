// かわしまさんの欠落しているプロフィールを修正するスクリプト
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.local' });

// Service Role Keyが必要ですが、現在.env.localにありません
// 代わりにAnonキーで試行しますが、RLSにより失敗する可能性があります
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

console.log('⚠️  Note: Using Anon Key instead of Service Role Key. RLS may prevent writes.');

async function fixKawashimaProfile() {
  try {
    const kawashimaUserId = '2765ca9f-7c10-40d4-8a59-c4684c94952d';
    
    console.log('🔍 Checking for existing profile for Kawashima...');
    
    // 既存プロフィールをチェック
    const { data: existingProfile, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('id', kawashimaUserId)
      .single();

    if (existingProfile) {
      console.log('✅ Profile already exists:', existingProfile);
      return;
    }

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking profile:', checkError);
      return;
    }

    console.log('❌ No profile found. Creating new profile for Kawashima...');

    // auth.usersからユーザー情報を取得
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(kawashimaUserId);
    
    if (authError) {
      console.error('❌ Error fetching auth user:', authError);
      return;
    }

    const authUser = authData.user;
    if (!authUser) {
      console.error('❌ No auth record found for this user ID');
      return;
    }

    console.log('📧 Auth user found:', {
      id: authUser.id,
      email: authUser.email,
      created_at: authUser.created_at
    });

    // かわしまさんのプロフィールを作成
    const kawashimaProfile = {
      id: kawashimaUserId,
      email: authUser.email || 'kawashima@example.com',
      username: 'かわしま', // 正しいユーザー名
      display_name: 'かわしま', // 正しい表示名
      created_at: authUser.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('📝 Creating profile with correct data:', kawashimaProfile);

    const { data: createdProfile, error: createError } = await supabase
      .from('users')
      .insert(kawashimaProfile)
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating profile:', createError);
      return;
    }

    console.log('✅ Successfully created Kawashima profile:', createdProfile);
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

// スクリプト実行
if (require.main === module) {
  fixKawashimaProfile().then(() => {
    console.log('✅ Done');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fixKawashimaProfile };