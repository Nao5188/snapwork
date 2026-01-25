import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// 軽いタップフィードバック（ボタンタップ時）
export const lightTap = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

// 中程度のフィードバック（重要なアクション）
export const mediumTap = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
};

// 強いフィードバック（削除等の重要アクション）
export const heavyTap = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
};

// 成功フィードバック
export const successFeedback = () => {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
};

// エラーフィードバック
export const errorFeedback = () => {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
};

// 警告フィードバック
export const warningFeedback = () => {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
};

// 選択フィードバック（リスト選択等）
export const selectionFeedback = () => {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync();
  }
};
