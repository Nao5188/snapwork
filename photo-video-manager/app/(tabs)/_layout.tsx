import { Tabs } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/HapticTab';
import { useAppTheme } from '@/lib/ThemeContext';
import { cameraCaptureService } from '@/lib/cameraCapture';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

type AppColors = ReturnType<typeof useAppTheme>['colors'];

const NAV_ACCENT = '#2563EB';
const NAV_ACCENT_SOFT = '#EEF4FF';

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
  const pressAnim = useRef(new Animated.Value(0)).current;
  const activeBackground = colors.tabBar === '#1a1a1a' ? 'rgba(37,99,235,0.18)' : NAV_ACCENT_SOFT;
  const activeColor = colors.tabBar === '#1a1a1a' ? '#8DB4FF' : NAV_ACCENT;

  const handlePressIn = () => {
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 70,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressAnim, {
      toValue: 0,
      duration: 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
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
          styles.tabPill,
          isFocused && { backgroundColor: activeBackground },
          {
            opacity: pressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.72],
            }),
            transform: [{
              translateY: pressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1.5],
              }),
            }],
          },
        ]}
      >
        {options.tabBarIcon?.({
          color: isFocused ? activeColor : colors.tabIconInactive,
          focused: isFocused,
          size: 22,
        })}
        <Text
          style={[
            styles.tabLabel,
            { color: isFocused ? activeColor : colors.tabIconInactive },
          ]}
          numberOfLines={1}
        >
          {options.title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function AnimatedCenterTab({ isFocused, isRecording, onPress, onLongPress, colors, options }: AnimatedCenterTabProps) {
  const pressAnim = useRef(new Animated.Value(0)).current;
  const activeColor = colors.tabBar === '#1a1a1a' ? '#8DB4FF' : NAV_ACCENT;

  const handlePressIn = () => {
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 70,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressAnim, {
      toValue: 0,
      duration: 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
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
          styles.centerTabContent,
          {
            opacity: pressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.84],
            }),
            transform: [{
              translateY: pressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 2],
              }),
            }],
          },
        ]}
      >
        <View
          style={[
            styles.centerTabButton,
            {
              backgroundColor: isRecording ? '#EF4444' : activeColor,
              borderColor: colors.tabBar,
            },
          ]}
        >
          <Ionicons
            name={isRecording ? 'stop' : (isFocused ? 'camera' : 'camera-outline')}
            size={26}
            color="#FFFFFF"
          />
        </View>
        <Text
          style={[
            styles.centerTabLabel,
            { color: isRecording ? '#EF4444' : activeColor },
          ]}
          numberOfLines={1}
        >
          {isRecording ? 'REC' : options.title}
        </Text>
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
    <View
      style={[
        styles.tabBarOuter,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
        },
      ]}
    >
      <View style={styles.tabBarContainer}>
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
    paddingHorizontal: 0,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 22,
    paddingTop: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  tabPill: {
    minWidth: 74,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  centerTabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginTop: -24,
  },
  centerTabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  centerTabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  centerTabLabel: {
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
});
