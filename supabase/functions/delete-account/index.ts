import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

Deno.serve(async (req) => {
  console.log('Function called, method:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  console.log('Auth header present:', !!authHeader);
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    console.log('User found:', !!user, 'Error:', userError?.message);
    if (userError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!
    );

    const { data: tripData } = await adminClient.from('trips').select('id').eq('user_id', user.id).single();
    console.log('Trip found:', !!tripData);

    if (tripData) {
      await adminClient.from('events').delete().eq('trip_id', tripData.id);
      console.log('Events deleted');
    }

    await adminClient.from('trips').delete().eq('user_id', user.id);
    console.log('Trip deleted');

    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    console.log('User deleted, error:', error?.message);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });

  } catch (e) {
    console.log('Caught error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});