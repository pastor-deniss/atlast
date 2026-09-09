// reportContribution (ticket 13). RLS deliberately has no client-facing
// INSERT policy on `transactions` (ticket 12) — this is the one legitimate
// write path. Enforces ticket 09's invariant: amount must be an exact
// multiple of the group's share_value; shares_earned is computed here, not
// trusted from the client.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface ReportContributionPayload {
  group_id: string;
  amount: number;
  reference: string;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    let body: ReportContributionPayload;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { group_id, amount, reference } = body;
    if (!group_id || !reference || !reference.trim()) {
      return Response.json({ error: 'group_id and reference are required' }, { status: 400 });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    // Defense in depth beyond RLS visibility: confirm active membership.
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userClaims!.id)
      .eq('group_id', group_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership) {
      return Response.json(
        { error: 'You are not an active member of this group.' },
        { status: 403 }
      );
    }

    const { data: group, error: groupError } = await supabaseAdmin
      .from('groups')
      .select('share_value')
      .eq('id', group_id)
      .single();
    if (groupError || !group) {
      return Response.json({ error: 'Group not found.' }, { status: 404 });
    }

    if (amount % group.share_value !== 0) {
      return Response.json(
        {
          error: `Amount must be a multiple of the group's share value (${group.share_value}).`,
        },
        { status: 400 }
      );
    }
    const sharesEarned = amount / group.share_value;

    const { data: transaction, error: insertError } = await supabaseAdmin
      .from('transactions')
      .insert({
        group_id,
        member_id: userClaims!.id,
        type: 'contribution',
        amount,
        shares_earned: sharesEarned,
        status: 'posted',
        reference: reference.trim(),
        created_by: userClaims!.id,
      })
      .select('id, amount, shares_earned, reference, status, created_at')
      .single();

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({ transaction });
  }),
};
