// submitComplaint. Any active member files a complaint about their own
// records; it is visible only to them and the group's admins.
import { withSupabase } from 'jsr:@supabase/server@^1';

const CATEGORIES = ['missing_contribution', 'wrong_amount', 'loan', 'other'];

interface Payload {
  group_id: string;
  category: string;
  transaction_id?: string | null;
  subject: string;
  details: string;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    let payload: Payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const subject = (payload.subject ?? '').trim();
    const details = (payload.details ?? '').trim();
    if (!payload.group_id) return Response.json({ error: 'group_id is required' }, { status: 400 });
    if (!CATEGORIES.includes(payload.category)) {
      return Response.json({ error: 'Choose what the complaint is about.' }, { status: 400 });
    }
    if (!subject || subject.length > 120) {
      return Response.json({ error: 'Enter a title of up to 120 characters.' }, { status: 400 });
    }
    if (!details || details.length > 2000) {
      return Response.json({ error: 'Describe the problem in up to 2000 characters.' }, { status: 400 });
    }

    const { data: complaint, error } = await supabaseAdmin.rpc('submit_member_complaint', {
      p_group_id: payload.group_id,
      p_member_id: userClaims!.id,
      p_category: payload.category,
      p_transaction_id: payload.transaction_id ?? null,
      p_subject: subject,
      p_details: details,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ complaint });
  }),
};
