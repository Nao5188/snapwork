# EAS Build 作業状況

最終更新: 2026-08-16

## iOS Production

- App version: `1.0.0`
- Build number: `54`
- Build ID: `b4de23c9-7d93-4c42-ba38-09c021e5dcf0`
- Commit: `911d444` (`Prepare SalonCloud production release`)
- Build status: `FINISHED`
- Submission ID: `b8c1073d-f4b2-4082-a908-5aa42146d327`
- Submission status: App Store Connectへのアップロード完了、Apple側で処理中

## 次の作業

1. App Store ConnectのTestFlightでBuild 54の処理完了を確認する。
2. TestFlightで投稿、動画サムネイル、認証、カメラ、ダウンロードを確認する。
3. App Store ConnectでBuild 54をリリース対象バージョンへ設定する。
4. リリースノートと審査情報を確認し、App Reviewへ提出する。

## 検証結果

- `npx expo-doctor`: 17/17 checks passed
- `npx tsc --noEmit`: passed
- `npm run lint`: passed
- iOS Expo export: passed
- EAS production環境変数: Supabase URLとanon keyを確認済み
- Supabase Storage: `posts`と`avatars`はprivate、孤立ファイルなし
- 動画サムネイル: 24/27。過去3件はアプリの自動修復対象

## 既知事項

- `npm audit --omit=dev`は27件を報告する。残りの自動修正にはExpo 57への破壊的更新が含まれるため、今回のリリースには含めない。
- Expo Goは`react-native-vision-camera`を利用できないため、実機確認にはTestFlightまたはDevelopment Buildを使用する。
