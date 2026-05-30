# バグ調査レポート

調査日: 2026-03-26

---

## 概要

| 重大度 | 件数 |
|--------|------|
| 🔴 高  | 4件  |
| 🟡 中  | 4件  |
| 🟢 低  | 5件  |
| **合計** | **13件** |

---

## 🔴 重大度：高

### BUG-001 `forEach(async)` でエラーがcatchされない
- **ファイル:** `app/(tabs)/profile.tsx:125`
- **問題:** `videoPosts.forEach(async (post) => { ... })` の形式では、内部のPromiseエラーがcatchされない。サムネイル生成失敗時に画面が永遠にローディング状態のままになる可能性がある。
- **対策:** `Promise.allSettled()` を使って全て await する。

```ts
// NG
videoPosts.forEach(async (post) => { ... });

// OK
await Promise.allSettled(videoPosts.map(async (post) => { ... }));
```

---

### BUG-002 重複ナビゲーションの競合状態
- **ファイル:** `app/_layout.tsx:163`
- **問題:** 複数の認証イベント（`SIGNED_IN` 等）が連続実行された場合、`router.replace('/(tabs)/history')` が複数回呼ばれ、ナビゲーションスタックが壊れる可能性がある。
- **対策:** ナビゲーション済みフラグ（`hasNavigated.current`）を導入し、一度だけ遷移するよう制御する。

```ts
const hasNavigated = useRef(false);

if (event === 'SIGNED_IN' && !hasNavigated.current) {
  hasNavigated.current = true;
  router.replace('/(tabs)/history');
}
```

---

### BUG-003 `data.user` のnull参照リスク
- **ファイル:** `app/post/edit/[id].tsx:144`
- **問題:** `authService.getCurrentUser()` の戻り値 `data.user` が null の場合に早期returnしているが、その後の処理で `data.user.id` を参照する箇所があり、null参照エラーが発生するリスクがある。
- **対策:** early returnの後に続く処理で `data.user` が存在することを保証するか、変数に代入してから使う。

```ts
const { data: { user } } = await authService.getCurrentUser();
if (!user) { router.back(); return; }
setCurrentUserId(user.id); // user が存在することが保証される
```

---

### BUG-004 `useFocusEffect` の依存配列による再生成ループ
- **ファイル:** `app/(tabs)/history.tsx:251`
- **問題:** `loadPosts` が `useCallback` で定義されているが、依存配列に含まれる値が変化するたびに `loadPosts` が再生成され、`useFocusEffect` が再実行されるループが発生する可能性がある。
- **対策:** `loadPosts` の依存配列を最小限にし、不要な依存を取り除く。

---

## 🟡 重大度：中

### BUG-005 AndroidでURIスキームが不正になる可能性
- **ファイル:** `app/(tabs)/index.tsx:161, 199`
- **問題:** iOSでは `file://${photo.path}` と明示的にスキームを付与しているが、Androidでは `photo.path` をそのまま使用しており、スキームなしのパスになる場合がある。
- **対策:** プラットフォームに関わらずURIスキームを正規化する。

```ts
const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
```

---

### BUG-006 Stale Closure による古い `currentUserId` 参照
- **ファイル:** `app/post/edit/[id].tsx:179`
- **問題:** `currentUserId` はstateであり、非同期処理のタイミングによってはstateの更新前の古い値（stale closure）が参照される可能性がある。
- **対策:** stateではなくrefを使うか、関数の引数として値を渡す。

---

### BUG-007 アンマウント後の state 更新
- **ファイル:** `app/gallery.tsx:89`
- **問題:** `loadMediaAssets()` は非同期処理であり、画面がアンマウントされた後に `setMediaAssets()` が呼ばれる場合がある。これにより React の Warning が発生し、メモリリークの原因になる。
- **対策:** `useEffect` 内で `isMounted` フラグを管理し、アンマウント後の state 更新を防ぐ。

```ts
useEffect(() => {
  let isMounted = true;
  const load = async () => {
    const data = await mediaLibraryService.getUserMedia(user.id);
    if (isMounted) setMediaAssets(data || []);
  };
  load();
  return () => { isMounted = false; };
}, []);
```

---

### BUG-008 `post_media` が空の場合のフォールバック処理が曖昧
- **ファイル:** `app/(tabs)/history.tsx:180`
- **問題:** `postMediaItems` が空の場合、以前に構築した `mediaItems`（`media_0` フォールバック）がそのまま使われるが、このロジックが不明瞭でデータの不整合が起きやすい。
- **対策:** フォールバックの優先順位を明示的にコメントで記載し、ロジックを整理する。

---

## 🟢 重大度：低

### BUG-009 `accessPrivileges` フィールドの存在チェックなし
- **ファイル:** `app/gallery.tsx:103`
- **問題:** `result.accessPrivileges === 'limited'` のチェックで、iOSの将来バージョンでフィールドが廃止された場合にエラーが発生する可能性がある。
- **対策:** オプショナルチェーンを使用する。

```ts
const granted = result.granted || result?.accessPrivileges === 'limited';
```

---

### BUG-010 `any[]` 型の過度な使用
- **ファイル:** `app/(tabs)/history.tsx:121`
- **問題:** `new Map<string, any[]>()` のように `any` 型が多用されており、型安全性が損なわれている。実行時エラーの発見が遅れる可能性がある。
- **対策:** `PostMedia` 等の具体的な型を定義して使用する。

---

### BUG-011 Android外部ストレージの `file://` URIアクセス権問題
- **ファイル:** `app/post/edit/[id].tsx:336`
- **問題:** Android の外部ストレージ由来の `file://` URI はアプリのサンドボックス外であり、アクセス権エラーが発生する場合がある。
- **対策:** `content://` スキームを優先し、`file://` の場合は権限チェックを実施する。

---

### BUG-012 画面回転時のアニメーション状態リセット漏れ
- **ファイル:** `app/login.tsx:47`
- **問題:** `Animated.Value` は `useRef` で初期化されているが、画面回転時に `Dimensions` が変化してもアニメーションが再実行されない。レイアウトがずれる可能性がある。
- **対策:** `Dimensions.addEventListener` を使って回転検知し、アニメーションをリセットする。

---

### BUG-013 `expo-av` の非推奨警告
- **ファイル:** `components/PostCard.tsx`
- **問題:** `expo-av` の `Video` コンポーネントは Expo SDK 54 で非推奨となり、将来のバージョンで削除される予定。
- **対策:** `expo-video` パッケージへの移行を計画する。

```ts
// 現在（非推奨）
import { Video } from 'expo-av';

// 推奨
import { VideoView } from 'expo-video';
```

---

## 対応優先順位

```
即時対応    → BUG-001, BUG-002, BUG-003
次スプリント → BUG-004, BUG-005, BUG-006, BUG-007
余裕があれば → BUG-008, BUG-009, BUG-010, BUG-011, BUG-012, BUG-013
```
