import { device, element, by, expect as detoxExpect } from 'detox';

describe('ログイン画面', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('ログイン画面が正しく表示される', async () => {
    await detoxExpect(element(by.id('login-email-input'))).toBeVisible();
    await detoxExpect(element(by.id('login-password-input'))).toBeVisible();
    await detoxExpect(element(by.id('login-submit-button'))).toBeVisible();
    await detoxExpect(element(by.id('login-signup-button'))).toBeVisible();
  });

  it('空フォームを送信するとエラーが表示される', async () => {
    await element(by.id('login-submit-button')).tap();
    // エラー表示を確認（メールアドレス入力フォームにエラー状態）
    await detoxExpect(element(by.id('login-email-input'))).toBeVisible();
  });

  it('不正なメール形式でエラーが出る', async () => {
    await element(by.id('login-email-input')).typeText('invalid-email');
    await element(by.id('login-password-input')).typeText('Password1!');
    await element(by.id('login-submit-button')).tap();
    // エラーメッセージが表示されるはず
    await detoxExpect(element(by.text('正しいメールアドレスを入力してください'))).toBeVisible();
  });

  it('新規アカウント作成ボタンでサインアップフォームに切り替わる', async () => {
    await element(by.id('login-signup-button')).tap();
    // 利用規約ダイアログが出るので「同意する」をタップ
    await detoxExpect(element(by.text('利用規約への同意'))).toBeVisible();
    await element(by.text('同意する')).tap();
    // サインアップフォームに切り替わったことを確認
    await detoxExpect(element(by.id('login-displayname-input'))).toBeVisible();
    await detoxExpect(element(by.id('login-confirm-password-input'))).toBeVisible();
  });

  it('サインアップフォームからログインフォームに戻る', async () => {
    await element(by.id('login-signup-button')).tap();
    await detoxExpect(element(by.text('利用規約への同意'))).toBeVisible();
    await element(by.text('同意する')).tap();
    await detoxExpect(element(by.id('login-displayname-input'))).toBeVisible();

    // 「既にアカウントをお持ちの方」ボタンをタップ（同じtestID）
    await element(by.id('login-signup-button')).tap();
    // ログインフォームに戻ったことを確認
    await detoxExpect(element(by.id('login-email-input'))).toBeVisible();
    await detoxExpect(element(by.id('login-displayname-input'))).not.toBeVisible();
  });

  it('パスワードをお忘れの方でリセットフォームに切り替わる', async () => {
    await detoxExpect(element(by.id('login-forgot-password'))).toBeVisible();
    await element(by.id('login-forgot-password')).tap();
    // パスワードリセット用のメールアドレス入力が表示されるはず
    await detoxExpect(element(by.text('リセットメールを送信'))).toBeVisible();
  });
});
