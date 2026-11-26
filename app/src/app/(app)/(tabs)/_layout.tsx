import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

type IconName = SymbolViewProps['name'];

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <SymbolView name={name} size={24} tintColor={color} />;
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
        tabBarActiveBackgroundColor: theme.backgroundSelected,
        tabBarItemStyle: { borderRadius: 14, marginHorizontal: 2, marginVertical: 4 },
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
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'house', android: 'home', web: 'home' }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: t('Members'),
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'person.2', android: 'group', web: 'group' }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contributions"
        options={{
          title: t('Contributions'),
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'banknote', android: 'payments', web: 'payments' }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="governance"
        options={{
          title: t('Votes'),
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'checkmark.square', android: 'how_to_vote', web: 'how_to_vote' }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('More'),
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
