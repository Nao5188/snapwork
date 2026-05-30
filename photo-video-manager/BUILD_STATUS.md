# EAS Build 作業状況

## 現在の状態

### Developmentビルド（進行中）
- **Build ID**: 90294410-0cc6-4ea9-9bc5-73472cc4e54b
- **Status**: in queue（Free tierのため完了まで約70分）
- **Build number**: 12
- **完了後の作業**:
  1. メール or Expoダッシュボードでインストールリンクを確認
  2. iPhoneのSafariでリンクを開いてインストール
  3. PCで `npm start` を実行
  4. iPhoneでアプリを開く → 開発サーバーに接続される

### Productionビルド（完了済み）
- **Build ID**: f67951e1-a57f-4f0c-914c-8148d3d690d7
- **Build number**: 11
- **完了時刻**: 2026/3/24 2:49:15
- **Status**: finished ✅
- **次のステップ**: App Store Connect へ Submit（未実施）

---

## 未解決の問題

### 写真撮影エラー
- **症状**: 撮影するとポップアップ「写真の撮影に失敗しました」が表示される
- **対処済み**:
  - `enableShutterSound: true` を削除
  - エラー詳細をポップアップに表示するよう変更
- **次のステップ**: devビルドインストール後に撮影して、エラーの詳細メッセージを確認する

---

## メモ

- Expo Go は使用不可（react-native-vision-camera がカスタムネイティブモジュールのため）
- Development Build = アプリ独自の「開発用Expo Go」
- ネイティブコード変更時のみ再ビルドが必要、通常のコード変更は `npm start` で即反映
