import { withSupabase } from '@supabase/server';

export const GET = withSupabase({ auth: 'user' }, async (_request, context) => {
  const { data, error } = await context.supabase
    .from('profiles')
    .select('id, full_name, first_name, location, bio, interests, public_profile, onboarding_complete')
    .eq('id', context.userClaims!.id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Profile not found' }, { status: 404 });
  return Response.json(data);
});
