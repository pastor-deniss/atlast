import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { useSession } from '@/lib/auth/session-context';
import { supabase } from '@/lib/supabase';

export type Membership = {
  id: string;
  group_id: string;
  role: 'member' | 'group_admin' | 'treasurer';
  status: 'pending' | 'active' | 'declined' | 'exited';
  applied_at: string;
  decided_at: string | null;
  application_note: string | null;
};

export type Group = {
  id: string;
  name: string;
  description: string | null;
  country: string;
  currency: string;
  contribution_frequency: string;
  contribution_amount: number;
  share_value: number;
};

type MembershipContextValue = {
  membership: Membership | null;
  group: Group | null;
  loading: boolean;
  refetch: () => Promise<void>;
};

const MembershipContext = createContext<MembershipContextValue>({
  membership: null,
  group: null,
  loading: true,
  refetch: async () => {},
});

// V1 tests only the single-group flow (ticket 06) -- so "the current
// membership" is just the most recently applied-to row for this user, even
// though the schema itself allows many.
export function MembershipProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!session) {
      setMembership(null);
      setGroup(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('memberships')
      .select(
        'id, group_id, role, status, applied_at, decided_at, application_note, groups(id, name, description, country, currency, contribution_frequency, contribution_amount, share_value)'
      )
      .eq('user_id', session.user.id)
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const { groups, ...rest } = data as unknown as Membership & { groups: Group };
      setMembership(rest);
      setGroup(groups);
    } else {
      setMembership(null);
      setGroup(null);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <MembershipContext.Provider value={{ membership, group, loading, refetch }}>
      {children}
    </MembershipContext.Provider>
  );
}

export function useMembership() {
  return useContext(MembershipContext);
}
