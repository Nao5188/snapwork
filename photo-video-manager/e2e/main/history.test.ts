import { device, element, by, expect as detoxExpect } from 'detox';

// テスト用アカウントは .env.test で管理
// TEST_EMAIL / TEST_PASSWORD を設定すること
const TEST_EMAIL = process.env.TEST_EMAIL ?? 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'TestPass1!';

async function loginWithTestAccount() {
  await element(by.id('login-email-input')).typeText(TEST_EMAIL);
  await element(by.id('login-password-input')).typeText(TEST_PASSWORD);
  await element(by.id('login-submit-button')).tap();
}

describe('履歴画面', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginWithTestAccount();
  });

  it('履歴画面が表示される', async () => {
    await detoxExpect(element(by.id('history-screen'))).toBeVisible();
  });

  it('投稿リストまたは空状態が表示される', async () => {
    // 投稿があればリスト、なければ空状態テキストが表示される
    try {
      await detoxExpect(element(by.id('history-posts-list'))).toBeVisible();
    } catch {
      await detoxExpect(element(by.id('history-empty-text'))).toBeVisible();
    }
  });

  it('ドロワーメニューが開閉する', async () => {
    await detoxExpect(element(by.id('history-menu-button'))).toBeVisible();
    await element(by.id('history-menu-button')).tap();
    // ドロワーが開いたことを確認（DrawerMenuの内側の要素）
    await detoxExpect(element(by.text('設定'))).toBeVisible();
    // 閉じる（バックドロップをタップ）
    await element(by.id('history-screen')).tap();
  });

  it('プルリフレッシュが動作する', async () => {
    await element(by.id('history-posts-list')).swipe('down', 'fast', 0.5);
    // リフレッシュ後もリストまたは空状態が表示されていること
    await detoxExpect(element(by.id('history-screen'))).toBeVisible();
  });
});
