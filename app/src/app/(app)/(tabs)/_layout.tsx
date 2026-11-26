import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

type IconName = SymbolViewProps['name'];

// The selected tab gets a soft pill behind its icon only. A pill around the
// whole item squeezed the labels in the fixed-height tab bar and cut them off.
function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.iconPill, focused && { backgroundColor: theme.backgroundSelected }]}>
      <SymbolView name={name} size={22} tintColor={color} />
    </View>
  );
}

// The member's everyday screens. Detail screens (a loan, a vote, a member)
// open on the outer stack, on top of the tab bar.
export default function TabsLayout() {
  const t = useT();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.backgroundSelected,
        },
        // Each tab draws its own green header card.
        headerShown: false,
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('Home'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={{ ios: 'house', android: 'home', web: 'home' }} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: t('Members'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={{ ios: 'person.2', android: 'group', web: 'group' }} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="contributions"
        options={{
          title: t('Contributions'),
          // "Contributions" is too wide for a fifth of a phone screen.
          tabBarLabel: t('Savings'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={{ ios: 'banknote', android: 'payments', web: 'payments' }}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="governance"
        options={{
          title: t('Votes'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={{ ios: 'checkmark.square', android: 'how_to_vote', web: 'how_to_vote' }}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('More'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: { width: 52, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600' },
  item: { paddingHorizontal: 0 },
});
