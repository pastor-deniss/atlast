// supabase.functions.invoke() returns `data: null` and a generic
// "Edge Function returned a non-2xx status code" error whenever a function
// responds with 4xx/5xx. The function's own `{ error: "..." }` message is
// still in the response body (error.context), so read it from there to show
// the member something useful, e.g. "This payment reference has already been
// recorded."
export async function functionErrorMessage(error: unknown): Promise<string | null> {
  if (!error) return null;
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // Body wasn't JSON; fall through to the generic message.
    }
  }
  return (error as { message?: string }).message ?? 'Something went wrong. Please try again.';
}
