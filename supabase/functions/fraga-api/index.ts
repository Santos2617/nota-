import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
async function hash(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
async function verifyLegacy(stored: string, password: string) {
  const [salt, expected] = (stored || '').split(':');
  if (!salt || !expected || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256',
    salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256));
  let different = 0;
  for (let i = 0; i < derived.length; i++) different |= derived[i] ^ parseInt(expected.slice(i * 2, i * 2 + 2), 16);
  return different === 0;
}

// Public routes verify credentials or return a deliberately limited validation result.
// Every administrative route checks the JWT with Auth and the role in the database.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 20000) return reply({ error: 'Pedido muito grande' }, 413);
    const body = JSON.parse(raw);
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === 'validate') {
      const code = String(body.code || '').trim();
      if (!code || code.length > 100) return reply({ found: false, status: 'NAO_ENCONTRADA' });
      const field = /^FS-\d{4}-\d+$/.test(code) ? 'numero_nota' : 'public_id';
      const { data: note, error } = await admin.from('notes')
        .select('public_id,numero_nota,data_compra,status,descricao,valor_total,public_visible_value,customers(nome),note_items(descricao,quantidade,valor_unitario,valor_total)')
        .eq(field, code).maybeSingle();
      check(error);
      if (!note) return reply({ found: false, status: 'NAO_ENCONTRADA', message: 'Nota não encontrada.' });
      const customer = note.customers as unknown as { nome: string } | null;
      return reply({ found: true, public_id: note.public_id, numero_nota: note.numero_nota,
        data_compra: note.data_compra, status: note.status, descricao: note.descricao,
        cliente_mascarado: (customer?.nome || 'Consumidor Final').split(/\s+/).map(p => p.length <= 2 ? p : p[0] + '***').join(' '),
        valor_total: note.public_visible_value ? note.valor_total : null,
        itens: note.note_items.map(item => ({ descricao: item.descricao, quantidade: item.quantidade,
          valor_unitario: note.public_visible_value ? item.valor_unitario : null,
          valor_total: note.public_visible_value ? item.valor_total : null })),
        empresa: 'FRAGA SUCATAS LTDA', validado_em: new Date().toISOString() });
    }
    if (body.action === 'login') {
      const login = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!login || !password || login.length > 254 || password.length > 1024) return reply({ error: 'Usuário ou senha inválidos.' }, 401);
      const { data: allowed, error: limitError } = await admin.rpc('allow_login', { attempt_key: await hash('login:' + login) });
      check(limitError);
      if (!allowed) return reply({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429);
      const { data: legacy, error: legacyError } = await admin.rpc('legacy_login_record', { login });
      check(legacyError);
      const { data: profile, error: lookupError } = await admin.from('profiles').select('email')
        .eq(login.includes('@') ? 'email' : 'username', login).maybeSingle();
      check(lookupError);
      const email = profile?.email || legacy?.email || (login.includes('@') ? login : 'invalid@example.invalid');
      let result = await authClient.auth.signInWithPassword({ email, password });
      if (result.error && legacy && !legacy.migrated_user_id && await verifyLegacy(legacy.password_hash, password)) {
        const reserved = await admin.rpc('prepare_legacy_login', { legacy_id: legacy.id });
        check(reserved.error);
        const created = await admin.auth.admin.createUser({ id: reserved.data, email, password, email_confirm: true,
          user_metadata: { username: legacy.username, name: legacy.name }, app_metadata: { legacy_user_id: legacy.id } });
        if (created.data.user) {
          const finished = await admin.rpc('finish_legacy_login', { legacy_id: legacy.id, auth_id: created.data.user.id });
          check(finished.error);
        }
        if (created.error) console.error('Legacy account creation:', created.error.message);
        result = await authClient.auth.signInWithPassword({ email, password });
      }
      if (result.error || !result.data.session) return reply({ error: 'Usuário ou senha inválidos.' }, 401);
      if (legacy && !legacy.migrated_user_id && await verifyLegacy(legacy.password_hash, password)) {
        const finished = await admin.rpc('finish_legacy_login', { legacy_id: legacy.id, auth_id: result.data.user.id });
        check(finished.error);
      }
      return reply({ session: result.data.session });
    }
    if (body.action === 'create-user' || body.action === 'company-search') {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
      const { data: caller, error: authError } = await admin.auth.getUser(token);
      if (authError || !caller.user) return reply({ error: 'Faça login novamente.' }, 401);
      const { data: profile, error } = await admin.from('profiles').select('role').eq('id', caller.user.id).single();
      if (error || profile.role !== 'ADMIN') return reply({ error: 'Acesso negado.' }, 403);
      if (body.action === 'company-search') {
        const { data: current, error: companyError } = await admin.from('company_settings').select('*').eq('id', 1).single();
        check(companyError);
        const cnpj = String(current.cnpj).replace(/\D/g, '');
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return reply({ error: 'A consulta externa está indisponível. Tente novamente mais tarde.' }, 503);
        const info = await response.json();
        const found = { ...current, company_name: info.razao_social || current.company_name,
          trade_name: info.nome_fantasia || current.trade_name,
          address: [info.logradouro,info.numero,info.bairro].filter(Boolean).join(', ') || current.address,
          city: info.municipio || current.city, state: info.uf || current.state, cep: info.cep || current.cep,
          phone: info.ddd_telefone_1 || current.phone, source: 'BrasilAPI', found_at: new Date().toISOString() };
        return reply({ current, online_found: found });
      }
      if (!['ADMIN', 'CLIENTE'].includes(body.role)) return reply({ error: 'Perfil inválido.' }, 400);
      const created = await admin.auth.admin.createUser({ email: String(body.email || '').trim().toLowerCase(),
        password: body.password, email_confirm: true,
        user_metadata: { username: String(body.username || '').trim().toLowerCase(), name: body.name } });
      if (created.error) return reply({ error: created.error.message }, 400);
      const updated = await admin.from('profiles').update({ role: body.role }).eq('id', created.data.user.id);
      check(updated.error);
      return reply({ success: true, id: created.data.user.id });
    }
    return reply({ error: 'Operação não encontrada.' }, 404);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Request failed');
    return reply({ error: 'Não foi possível concluir a operação. Tente novamente.' }, 500);
  }
});
