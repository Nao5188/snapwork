# スタッフ用機能実装状況確認

## 📋 必要な機能一覧と実装状況

### ✅ 1. カメラ即起動
**実装状況**: **完了**
- **場所**: `app/(tabs)/index.tsx`
- **詳細**: 
  - カメラタブが中央に配置
  - アプリ起動後すぐにカメラ画面にアクセス可能
  - カメラ権限取得とカメラビュー表示
  - フロント/リアカメラ切り替え
  - フラッシュ設定（オン/オフ/オート）

---

### ❌ 2. 写真・動画投稿（複数枚可）
**実装状況**: **未実装**
- **現在の状況**: 
  - ✅ 写真撮影機能: 実装済み
  - ✅ 動画録画機能: 実装済み
  - ✅ メディアライブラリ保存: 実装済み
  - ❌ 投稿画面: **未実装**
  - ❌ 複数枚選択: **未実装**
  - ❌ 投稿データベース連携: **未実装**

**必要な実装**:
```typescript
// 必要なファイル
- app/post/create.tsx (投稿作成画面)
- components/MediaSelector.tsx (複数メディア選択)
- lib/postService.ts (投稿API)
```

---

### ❌ 3. 撮影日・カットなどのメニュー名の入力欄
**実装状況**: **未実装**
- **現在の状況**: ダミーデータのみ表示
- **必要な機能**:
  - 撮影日時の手動設定
  - メニュー名入力フォーム
  - カテゴリ選択（前菜、メイン、デザート等）
  - タイトル入力
  - 説明文入力

**必要な実装**:
```typescript
interface PostForm {
  title: string;
  menuName: string;
  category: 'appetizer' | 'main' | 'dessert' | 'drink';
  description: string;
  shootingDate: Date;
  mediaFiles: MediaFile[];
}
```

---

### ❌ 4. 投稿の編集・削除（一定期間内）
**実装状況**: **部分実装**
- **現在の実装**: 
  - ✅ UI上の編集・削除ボタン: `app/(tabs)/history.tsx`
  - ✅ 削除機能: ローカル状態のみ（ダミー）
  - ❌ 編集画面: 「実装中」メッセージのみ
  - ❌ 一定期間制限: 未実装
  - ❌ データベース連携: 未実装

**必要な実装**:
```typescript
// 編集・削除制限ロジック
const canEditPost = (postDate: Date): boolean => {
  const daysSincePost = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSincePost <= 7; // 7日間以内のみ編集可能
};
```

---

## 🚀 実装優先度と推奨順序

### Priority 1 (高): 投稿機能の基本実装
1. **投稿作成画面の実装**
   - メディア選択UI
   - フォーム入力（タイトル、メニュー名、撮影日）
   - Supabaseとの連携

2. **データベース連携**
   - 投稿保存機能
   - 画像アップロード機能

### Priority 2 (中): 複数メディア対応
3. **複数枚選択機能**
   - カメラロールからの選択
   - 最大5枚まで選択可能

4. **メディア管理機能**
   - サムネイル表示
   - 並び替え機能

### Priority 3 (低): 高度な編集機能
5. **投稿編集画面**
   - 既存投稿の修正
   - メディアの追加・削除

6. **期間制限機能**
   - 投稿から7日間のみ編集可能
   - 期間経過後は閲覧のみ

---

## 📂 必要な新規ファイル

### 投稿関連
```
app/
├── post/
│   ├── create.tsx          # 投稿作成画面
│   ├── edit/[id].tsx       # 投稿編集画面
│   └── _layout.tsx         # 投稿関連レイアウト
│
components/
├── MediaSelector.tsx       # 複数メディア選択
├── PostForm.tsx           # 投稿フォーム
├── MediaUpload.tsx        # メディアアップロード
└── PostCard.tsx           # 投稿カード表示
│
lib/
├── mediaUpload.ts         # 画像アップロード処理
├── postValidation.ts      # 投稿データ検証
└── dateUtils.ts           # 日付関連ユーティリティ
```

### 型定義の拡張
```typescript
// types/post.ts
export interface CreatePostData {
  title: string;
  menuName: string;
  category: PostCategory;
  description?: string;
  shootingDate: Date;
  mediaFiles: File[];
}

export type PostCategory = 
  | 'appetizer' 
  | 'main' 
  | 'dessert' 
  | 'drink' 
  | 'other';
```

---

## 🔧 技術的な実装ポイント

### 1. メディアアップロード
```typescript
// Supabase Storage設定
const uploadMedia = async (file: File, postId: string) => {
  const fileName = `${postId}/${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage
    .from('post-media')
    .upload(fileName, file);
  
  if (error) throw error;
  return data.path;
};
```

### 2. 複数メディア選択
```typescript
// Expo ImagePicker設定
const selectMultipleMedia = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsMultipleSelection: true,
    selectionLimit: 5,
    quality: 0.8,
  });
  
  return result.assets || [];
};
```

### 3. 編集期限チェック
```typescript
const POST_EDIT_LIMIT_DAYS = 7;

const canEditPost = (createdAt: string): boolean => {
  const postDate = new Date(createdAt);
  const daysSince = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince <= POST_EDIT_LIMIT_DAYS;
};
```

---

## ✅ 次に実装すべき機能

### 即座に実装可能
1. **投稿作成画面の基本UI**
2. **フォーム入力の検証**
3. **撮影日時の選択**

### データベース設定後に実装
4. **Supabase Storage設定**
5. **投稿データの保存**
6. **投稿一覧の取得**

### 高度な機能
7. **画像リサイズ・圧縮**
8. **オフライン対応**
9. **プッシュ通知**

---

## 🎯 完成度

| 機能 | 実装率 | 状態 |
|------|--------|------|
| カメラ即起動 | 100% | ✅ 完了 |
| 写真・動画投稿 | 30% | 🔄 進行中 |
| メニュー名入力 | 10% | ❌ 未着手 |
| 編集・削除 | 40% | 🔄 部分実装 |

**総合完成度**: **45%**

スタッフが実際に使用するためには、投稿機能の実装が最優先です。