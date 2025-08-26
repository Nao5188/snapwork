import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { postService } from '@/lib/supabase';

const { width } = Dimensions.get('window');

interface MediaItem {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  fileName: string;
}

type PostCategory = 'appetizer' | 'main' | 'dessert' | 'drink' | 'other';

const categories = [
  { key: 'appetizer', label: '前菜', icon: 'restaurant-outline' },
  { key: 'main', label: 'メイン', icon: 'nutrition-outline' },
  { key: 'dessert', label: 'デザート', icon: 'ice-cream-outline' },
  { key: 'drink', label: 'ドリンク', icon: 'wine-outline' },
  { key: 'other', label: 'その他', icon: 'ellipsis-horizontal-outline' },
];

export default function CreatePostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [formData, setFormData] = useState({
    title: '',
    menuName: '',
    description: '',
    category: 'main' as PostCategory,
    shootingDate: new Date(),
  });

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // カメラから直接来た場合の画像を追加
    if (params.imageUri) {
      const newMediaItem: MediaItem = {
        id: Date.now().toString(),
        uri: params.imageUri as string,
        type: 'photo',
        fileName: `photo_${Date.now()}.jpg`,
      };
      setMediaItems([newMediaItem]);
    }
  }, [params.imageUri]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCategorySelect = (category: PostCategory) => {
    setFormData(prev => ({ ...prev, category }));
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFormData(prev => ({ ...prev, shootingDate: selectedDate }));
    }
  };

  const selectMediaFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: 5 - mediaItems.length,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newMediaItems: MediaItem[] = result.assets.map((asset, index) => ({
          id: `${Date.now()}_${index}`,
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'photo',
          fileName: asset.fileName || `media_${Date.now()}_${index}`,
        }));

        setMediaItems(prev => [...prev, ...newMediaItems].slice(0, 5));
      }
    } catch (error) {
      console.error('Error selecting media:', error);
      Alert.alert('エラー', 'メディアの選択に失敗しました。');
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const newMediaItem: MediaItem = {
          id: Date.now().toString(),
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'photo',
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
        };

        setMediaItems(prev => [newMediaItem, ...prev].slice(0, 5));
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('エラー', '撮影に失敗しました。');
    }
  };

  const removeMediaItem = (id: string) => {
    setMediaItems(prev => prev.filter(item => item.id !== id));
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('入力エラー', 'タイトルを入力してください。');
      return false;
    }
    if (!formData.menuName.trim()) {
      Alert.alert('入力エラー', 'メニュー名を入力してください。');
      return false;
    }
    if (mediaItems.length === 0) {
      Alert.alert('入力エラー', '少なくとも1つのメディアを追加してください。');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // TODO: Supabaseにデータを保存
      const postData = {
        ...formData,
        mediaItems,
        userId: 'current-user-id', // 実際のユーザーIDに置き換え
      };

      // ダミーの保存処理（実際はSupabaseを使用）
      console.log('Saving post:', postData);
      
      // 投稿データをSupabaseに保存
      // const savedPost = await postService.createPost({
      //   title: formData.title,
      //   menu_name: formData.menuName,
      //   media_url: mediaItems[0].uri, // メイン画像
      //   is_video: mediaItems[0].type === 'video',
      //   user_id: 'current-user-id',
      //   likes_count: 0,
      // });

      Alert.alert(
        '投稿完了',
        '投稿が正常に作成されました。',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('エラー', '投稿の作成に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const renderMediaItem = ({ item }: { item: MediaItem }) => (
    <View style={styles.mediaItem}>
      <Image
        source={{ uri: item.uri }}
        style={styles.mediaImage}
        contentFit="cover"
      />
      {item.type === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={16} color="white" />
        </View>
      )}
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeMediaItem(item.id)}
      >
        <Ionicons name="close-circle" size={20} color="red" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#262626" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>新しい投稿</Text>
          <TouchableOpacity 
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? '投稿中...' : '投稿'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Media Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>メディア ({mediaItems.length}/5)</Text>
            
            <FlatList
              data={mediaItems}
              renderItem={renderMediaItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaList}
              ListFooterComponent={
                mediaItems.length < 5 ? (
                  <View style={styles.mediaActions}>
                    <TouchableOpacity style={styles.mediaActionButton} onPress={takePhoto}>
                      <Ionicons name="camera" size={24} color="#666" />
                      <Text style={styles.mediaActionText}>撮影</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mediaActionButton} onPress={selectMediaFromLibrary}>
                      <Ionicons name="images" size={24} color="#666" />
                      <Text style={styles.mediaActionText}>選択</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          </View>

          {/* Post Form */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>投稿内容</Text>
            
            {/* Title */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>タイトル *</Text>
              <TextInput
                style={styles.input}
                value={formData.title}
                onChangeText={(text) => handleInputChange('title', text)}
                placeholder="投稿のタイトルを入力"
                maxLength={100}
              />
            </View>

            {/* Menu Name */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>メニュー名 *</Text>
              <TextInput
                style={styles.input}
                value={formData.menuName}
                onChangeText={(text) => handleInputChange('menuName', text)}
                placeholder="料理名・商品名を入力"
                maxLength={50}
              />
            </View>

            {/* Category */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>カテゴリ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryContainer}>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.key}
                      style={[
                        styles.categoryButton,
                        formData.category === category.key && styles.categoryButtonActive
                      ]}
                      onPress={() => handleCategorySelect(category.key as PostCategory)}
                    >
                      <Ionicons 
                        name={category.icon as any} 
                        size={20} 
                        color={formData.category === category.key ? '#fff' : '#666'} 
                      />
                      <Text style={[
                        styles.categoryButtonText,
                        formData.category === category.key && styles.categoryButtonTextActive
                      ]}>
                        {category.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Shooting Date */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>撮影日時</Text>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#666" />
                <Text style={styles.dateButtonText}>
                  {formData.shootingDate.toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Description */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>説明（任意）</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => handleInputChange('description', text)}
                placeholder="料理の特徴や材料などを入力"
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>
          </View>
        </ScrollView>

        {/* Date Picker Modal */}
        {showDatePicker && (
          <DateTimePicker
            value={formData.shootingDate}
            mode="datetime"
            display="default"
            onChange={handleDateChange}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
  },
  submitButton: {
    backgroundColor: '#0095f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  submitButtonDisabled: {
    backgroundColor: '#b3b3b3',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 16,
  },
  mediaList: {
    paddingRight: 16,
  },
  mediaItem: {
    width: 80,
    height: 80,
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  videoIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ffffff',
    borderRadius: 10,
  },
  mediaActions: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaActionButton: {
    width: 80,
    height: 80,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaActionText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#262626',
    backgroundColor: '#fafafa',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoryContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    gap: 4,
  },
  categoryButtonActive: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  categoryButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#ffffff',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderRadius: 8,
    backgroundColor: '#fafafa',
    gap: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#262626',
  },
});