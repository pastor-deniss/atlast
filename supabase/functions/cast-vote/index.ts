// castVote (ticket 13/18). Thin wrapper over cast_vote, which checks the
// motion is still open and re-tallies inside one transaction before
// inserting -- the same atomic check-then-write pattern as
// castLoanReviewDecision, so two members voting simultaneously right at the
// threshold can't both succeed past resolution.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  motion_id: string;
  choice: 'approve' | 'decline';
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    let body: Payload;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { motion_id, choice } = body;
    if (!motion_id || (choice !== 'approve' && choice !== 'decline')) {
      return Response.json(
        { error: 'motion_id and a choice of approve or decline are required' },
        { status: 400 }
      );
    }

    const { data: vote, error } = await supabaseAdmin.rpc('cast_vote', {
      p_motion_id: motion_id,
      p_voter_id: userClaims!.id,
      p_choice: choice,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ vote });
  }),
};
