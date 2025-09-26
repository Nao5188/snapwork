/**
 * テスト用ユーザー作成スクリプト
 * 
 * 実行方法:
 * node scripts/createTestUsers.js
 * 
 * 事前準備:
 * 1. .env ファイルにSupabase設定を追加
 * 2. npm install @supabase/supabase-js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase設定
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // サービスロールキーが必要
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// テスト用ユーザーデータ
const testUsers = [
  {
    email: 'test1@example.com',
    password: 'test123456',
    username: 'testuser1',
    display_name: 'テストユーザー1'
  },
  {
    email: 'test2@example.com',
    password: 'test123456',
    username: 'testuser2',
    display_name: 'テストユーザー2'
  },
  {
    email: 'test3@example.com',
    password: 'test123456',
    username: 'testuser3',
    display_name: 'テストユーザー3'
  },
  {
    email: 'demo@example.com',
    password: 'demo123456',
    username: 'demouser',
    display_name: 'デモユーザー'
  },
  {
    email: 'admin@example.com',
    password: 'admin123456',
    username: 'admin',
    display_name: '管理者'
  }
];

async function createTestUser(userData) {
  try {
    console.log(`Creating user: ${userData.email}...`);

    // 既存ユーザーをチェック
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', userData.email)
      .single();

    if (existingUser) {
      console.log(`✅ User ${userData.email} already exists, skipping...`);
      return;
    }

    // Supabase Auth でユーザー作成
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true // メール確認をスキップ
    });

    if (authError) {
      console.error(`❌ Auth creation failed for ${userData.email}:`, authError.message);
      return;
    }

    if (!authData.user) {
      console.error(`❌ No user returned for ${userData.email}`);
      return;
    }

    // usersテーブルにプロフィール情報を追加
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: userData.email,
        username: userData.username,
        display_name: userData.display_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error(`❌ Profile creation failed for ${userData.email}:`, profileError.message);
      return;
    }

    console.log(`✅ Successfully created user: ${userData.email}`);
    console.log(`   Username: ${userData.username}`);
    console.log(`   Display Name: ${userData.display_name}`);

  } catch (error) {
    console.error(`❌ Unexpected error creating user ${userData.email}:`, error.message);
  }
}

async function createAllTestUsers() {
  console.log('🚀 Creating test users...\n');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration. Please check your .env file:');
    console.error('   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
    process.exit(1);
  }

  for (const userData of testUsers) {
    await createTestUser(userData);
    console.log(''); // 空行を追加
  }

  console.log('🎉 Test user creation completed!');
  console.log('\n📋 Test User Credentials:');
  console.log('========================');
  testUsers.forEach((user, index) => {
    console.log(`${index + 1}. Email: ${user.email}`);
    console.log(`   Password: ${user.password}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Display Name: ${user.display_name}`);
    console.log('');
  });

  console.log('💡 You can now login with any of these credentials in your app!');
}

// スクリプト実行
if (require.main === module) {
  createAllTestUsers()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createTestUser, testUsers };