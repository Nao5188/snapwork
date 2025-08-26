import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface Post {
  id: string;
  title: string;
  menuName: string;
  mediaUri: string;
  isVideo: boolean;
  likesCount: number;
  createdAt: Date;
  shootingDate: Date;
  description?: string;
}

interface PostCardProps {
  post: Post;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export default function PostCard({ 
  post, 
  onPress, 
  onEdit, 
  onDelete, 
  showActions = false 
}: PostCardProps) {
  const formatDate = (date: Date) => {
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  };

  const formatTime = (date: Date) => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const canEdit = () => {
    const daysSincePost = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSincePost <= 7; // 7日間以内のみ編集可能
  };

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Media */}
      <View style={styles.mediaContainer}>
        <Image
          source={{ uri: post.mediaUri }}
          style={styles.mediaImage}
          contentFit="cover"
        />
        {post.isVideo && (
          <View style={styles.videoIndicator}>
            <Ionicons name="play" size={20} color="white" />
          </View>
        )}
      </View>
      
      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{post.title}</Text>
          <Text style={styles.date}>
            {formatDate(post.shootingDate)} {formatTime(post.createdAt)}
          </Text>
        </View>
        
        <Text style={styles.menuName}>{post.menuName}</Text>
        
        {post.description && (
          <Text style={styles.description} numberOfLines={2}>
            {post.description}
          </Text>
        )}
        
        <View style={styles.footer}>
          <View style={styles.likesContainer}>
            <Ionicons name="heart-outline" size={16} color="#ff3b30" />
            <Text style={styles.likesCount}>{post.likesCount}</Text>
          </View>
          
          {showActions && (
            <View style={styles.actions}>
              {canEdit() && (
                <>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEdit?.();
                    }}
                  >
                    <Ionicons name="create-outline" size={16} color="#666" />
                    <Text style={styles.actionText}>編集</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onDelete?.();
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ff4444" />
                    <Text style={[styles.actionText, { color: '#ff4444' }]}>削除</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mediaContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  videoIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    flex: 1,
    marginRight: 8,
  },
  date: {
    fontSize: 12,
    color: '#8e8e8e',
    fontWeight: '500',
  },
  menuName: {
    fontSize: 14,
    color: '#0095f6',
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
  },
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likesCount: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
});