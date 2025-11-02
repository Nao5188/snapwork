/**
 * ローカルファイルパスのアバター画像をSupabase Storageに移行するスクリプト
 *
 * 使用方法:
 * node scripts/migrateAvatarsToStorage.js
 *
 * 注意: このスクリプトは一度だけ実行してください
 */

const { createClient } = require('@supabase/supabase-js');

// 環境変数から取得（または直接指定）
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';

if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseServiceRoleKey === 'YOUR_SERVICE_ROLE_KEY') {
  console.error('❌ エラー: 環境変数が設定されていません');
  console.error('   EXPO_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください');
  process.exit(1);
}

// サービスロールキーを使用してクライアントを作成（RLSをバイパス）
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function migrateAvatars() {
  console.log('🔄 アバター画像の移行を開始します...\n');

  try {
    // ローカルファイルパスを持つユーザーを取得
    const { data: usersWithLocalAvatars, error: fetchError } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, email')
      .like('avatar_url', 'file://%');

    if (fetchError) {
      throw fetchError;
    }

    if (!usersWithLocalAvatars || usersWithLocalAvatars.length === 0) {
      console.log('✅ ローカルアバターを持つユーザーは見つかりませんでした');
      return;
    }

    console.log(`📊 ${usersWithLocalAvatars.length}人のユーザーにローカルアバターが見つかりました\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const user of usersWithLocalAvatars) {
      console.log(`\n👤 処理中: ${user.username || user.display_name} (${user.id})`);
      console.log(`   現在のURL: ${user.avatar_url}`);

      try {
        // ローカルファイルは移行できないため、プレースホルダーURLに置き換える
        const placeholderUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username || 'User')}&size=200&background=4A90E2&color=fff&bold=true`;

        console.log(`   新しいURL: ${placeholderUrl}`);

        // データベースを更新
        const { error: updateError } = await supabase
          .from('users')
          .update({
            avatar_url: placeholderUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) {
          throw updateError;
        }

        console.log(`   ✅ 成功: プレースホルダーURLに更新しました`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ エラー:`, error.message);
        errorCount++;
        errors.push({
          userId: user.id,
          username: user.username,
          error: error.message
        });
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 移行結果:');
    console.log(`   ✅ 成功: ${successCount}件`);
    console.log(`   ❌ 失敗: ${errorCount}件`);
    console.log(`   📊 合計: ${usersWithLocalAvatars.length}件`);

    if (errors.length > 0) {
      console.log('\n⚠️  エラー詳細:');
      errors.forEach(err => {
        console.log(`   - User: ${err.username} (${err.userId})`);
        console.log(`     Error: ${err.error}`);
      });
    }

    console.log('='.repeat(60) + '\n');

    if (successCount > 0) {
      console.log('🎉 移行が完了しました！');
      console.log('📝 注意: ユーザーは次回ログイン時にプロフィール画面から');
      console.log('   アバター画像を再アップロードする必要があります。');
    }

  } catch (error) {
    console.error('❌ 移行中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
console.log('='.repeat(60));
console.log('🚀 アバター画像移行スクリプト');
console.log('='.repeat(60) + '\n');

migrateAvatars()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 予期しないエラー:', error);
    process.exit(1);
  });
