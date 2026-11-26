import { ThemedView } from '@/components/themed-view';
import { GroupRulesView } from '@/components/group-rules-view';
import { useMembership } from '@/lib/membership-context';

/** Info → Group Rules for the member's own group. */
export default function GroupRulesScreen() {
  const { group } = useMembership();
  if (!group) return <ThemedView style={{ flex: 1 }} />;
  return <GroupRulesView groupId={group.id} currency={group.currency} />;
}
