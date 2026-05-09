import { Tabs } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/HapticTab';
import { useAppTheme } from '@/lib/ThemeContext';
import { cameraCaptureService } from '@/lib/cameraCapture';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

type AppColors = ReturnType<typeof useAppTheme>['colors'];

interface TabItemOptions {
  title?: string;
  tabBarIcon?: (props: { color: string; focused: boolean; size: number }) => React.ReactNode;
}

interface AnimatedTabItemProps {
  isFocused: boolean;
  options: TabItemOptions;
  onPress: () => void;
  colors: AppColors;
}

interface AnimatedCenterTabProps {
  isFocused: boolean;
  isRecording: boolean;
  onPress: () => void;
  onLongPress: () => void;
  colors: AppColors;
  options: TabItemOptions;
}

function AnimatedTabItem({ isFocused, options, onPress, colors }: AnimatedTabItemProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      friction: 8,
      tension: 200,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 200,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}
      accessibilityRole="button"
      accessibilityLabel={options.title}
    >
      <Animated.View
        style={[
          styles.tabIconWrapper,
          isFocused && { backgroundColor: colors.surface2 },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {options.tabBarIcon?.({
          color: isFocused ? colors.tabIconActive : colors.tabIconInactive,
          focused: isFocused,
          size: 24,
        })}
      </Animated.View>
    </Pressable>
  );
}

function AnimatedCenterTab({ isFocused, isRecording, onPress, onLongPress, colors, options }: AnimatedCenterTabProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      friction: 8,
      tension: 200,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 200,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.centerTabWrapper}
      accessibilityRole="button"
      accessibilityLabel={options.title}
    >
      <Animated.View
        style={[
          styles.centerTabButton,
          { backgroundColor: isRecording ? '#FF3B30' : colors.primary },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons
          name={isRecording ? 'stop' : (isFocused ? 'camera' : 'camera-outline')}
          size={28}
          color={colors.primaryText}
        />
      </Animated.View>
    </Pressable>
  );
}

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const unsubscribe = cameraCaptureService.subscribeRecording(setIsRecording);
    return unsubscribe;
  }, []);

  return (
    <View style={[styles.tabBarOuter, { paddingBottom: insets.bottom + 8 }]}>
      <View style={[styles.tabBarContainer, { backgroundColor: colors.tabBar, borderColor: colors.tabBarBorder, borderWidth: 1 }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const isCenterTab = index === 1;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (isCenterTab) {
            const handleCenterPress = () => {
              if (isFocused) {
                cameraCaptureService.trigger();
              } else {
                onPress();
              }
            };
            const handleCenterLongPress = () => {
              if (isFocused) {
                cameraCaptureService.triggerShowExposure();
              }
            };
            return (
              <AnimatedCenterTab
                key={route.key}
                isFocused={isFocused}
                isRecording={isRecording}
                onPress={handleCenterPress}
                onLongPress={handleCenterLongPress}
                colors={colors}
                options={options}
              />
            );
          }

          return (
            <AnimatedTabItem
              key={route.key}
              isFocused={isFocused}
              options={options}
              onPress={onPress}
              colors={colors}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
      }}>
      <Tabs.Screen
        name="history"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'カメラ',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'camera' : 'camera-outline'}
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'プロフィール',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapperActive: {
    backgroundColor: '#f5f5f5',
  },
  centerTabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
  },
  centerTabButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#444444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});
