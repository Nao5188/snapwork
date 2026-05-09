import { device, element, by, expect as detoxExpect } from 'detox';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'TestPass1!';

async function loginWithTestAccount() {
  await element(by.id('login-email-input')).typeText(TEST_EMAIL);
  await element(by.id('login-password-input')).typeText(TEST_PASSWORD);
  await element(by.id('login-submit-button')).tap();
}

async function navigateToProfile() {
  // プロフィールタブに移動
  await element(by.text('プロフィール')).tap();
}

describe('プロフィール画面', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginWithTestAccount();
    await navigateToProfile();
  });

  it('プロフィール画面が表示される', async () => {
    await detoxExpect(element(by.id('profile-screen'))).toBeVisible();
  });

  it('表示名が表示される', async () => {
    await detoxExpect(element(by.id('profile-displayname'))).toBeVisible();
  });

  it('プロフィール編集ボタンが表示され、タップするとモーダルが開く', async () => {
    await detoxExpect(element(by.id('profile-edit-button'))).toBeVisible();
    await element(by.id('profile-edit-button')).tap();
    await detoxExpect(element(by.text('プロフィール編集'))).toBeVisible();
    // モーダルを閉じる
    await element(by.text('キャンセル')).tap();
  });

  it('ログアウトボタンをタップするとアラートが表示される', async () => {
    await detoxExpect(element(by.id('profile-logout-button'))).toBeVisible();
    await element(by.id('profile-logout-button')).tap();
    await detoxExpect(element(by.text('ログアウト'))).toBeVisible();
    // キャンセルしてテストを継続
    await element(by.text('キャンセル')).tap();
  });
});
