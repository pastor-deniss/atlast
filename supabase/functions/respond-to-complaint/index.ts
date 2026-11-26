// respondToComplaint. Group Admin only: marks a member's complaint as being
// looked into, resolved or rejected, with a response the member reads. The
// update and its audit_events row happen together in
// respond_to_member_complaint(), which also stops an admin answering their
// own complaint.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  complaint_id: string;
  status: 'in_review' | 'resolved' | 'rejected';
  response?: string;
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

    const response = (payload.response ?? '').trim();
    if (!payload.complaint_id) return Response.json({ error: 'complaint_id is required' }, { status: 400 });
    if (!['in_review', 'resolved', 'rejected'].includes(payload.status)) {
      return Response.json({ error: 'Invalid status.' }, { status: 400 });
    }
    if (response.length > 2000) {
      return Response.json({ error: 'Keep the response to 2000 characters.' }, { status: 400 });
    }

    const { data: complaint, error } = await supabaseAdmin.rpc('respond_to_member_complaint', {
      p_complaint_id: payload.complaint_id,
      p_admin_id: userClaims!.id,
      p_status: payload.status,
      p_response: response,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ complaint });
  }),
};
