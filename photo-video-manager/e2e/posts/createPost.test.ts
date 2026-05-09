import { device, element, by, expect as detoxExpect } from 'detox';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'TestPass1!';

async function loginWithTestAccount() {
  await element(by.id('login-email-input')).typeText(TEST_EMAIL);
  await element(by.id('login-password-input')).typeText(TEST_PASSWORD);
  await element(by.id('login-submit-button')).tap();
}

async function navigateToCreatePost() {
  // ホームタブ（カメラ）から投稿作成画面へ移動
  await element(by.text('カメラ')).tap();
}

describe('投稿作成フロー', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginWithTestAccount();
    await navigateToCreatePost();
  });

  it('投稿作成画面が表示される', async () => {
    await detoxExpect(element(by.id('create-title-input'))).toBeVisible();
    await detoxExpect(element(by.id('create-submit-button'))).toBeVisible();
    await detoxExpect(element(by.id('create-add-media-button'))).toBeVisible();
  });

  it('タイトルを入力できる', async () => {
    await element(by.id('create-title-input')).typeText('テスト投稿タイトル');
    await detoxExpect(element(by.id('create-title-input'))).toHaveText('テスト投稿タイトル');
    // クリア
    await element(by.id('create-title-input')).clearText();
  });

  it('メディアなしで投稿するとエラーが表示される', async () => {
    await element(by.id('create-submit-button')).tap();
    // メディア未選択エラーアラートが出るはず
    await detoxExpect(element(by.text('入力エラー'))).toBeVisible();
    await element(by.text('OK')).tap();
  });
});
