/** Fraga Sucatas 2.0 - shared Supabase data, with no offline write fallback. */
const API = {
  client: null,
  user: null,
  ready: null,
  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const config = window.FRAGA_SUPABASE;
      if (!config?.url || !config?.publishableKey || !window.supabase) {
        throw new Error('Não foi possível conectar ao sistema. Atualize a página.');
      }
      this.client = window.supabase.createClient(config.url, config.publishableKey);
      const { data, error } = await this.client.auth.getSession();
      this.check(error);
      if (data.session) await this.loadUser();
      this.client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          this.user = null;
          document.getElementById('print-area-container')?.replaceChildren();
          document.querySelectorAll('.app-view').forEach(view => { view.style.display = 'none'; });
          document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
          if (window.appRouter) {
            window.appRouter.navigate('#/login');
            window.appRouter.handleRoute();
          }
        }
      });
    })();
    return this.ready;
  },
  check(error) {
    if (!error) return;
    if (error.code === 'email_address_not_authorized' || /email address not authorized/i.test(error.message || '')) {
      throw new Error('O cadastro por e-mail ainda não está disponível. Solicite sua conta ao administrador.');
    }
    if (error.code === 'over_email_send_rate_limit') throw new Error('O envio de e-mails está temporariamente limitado. Tente mais tarde ou fale com o administrador.');
    if (error.code === '23503') throw new Error('Este cadastro possui notas vinculadas e não pode ser excluído.');
    if (error.code === '23505') throw new Error('Já existe um cadastro com esses dados.');
    if (error.code === '42501') throw new Error('Você não tem permissão para esta operação.');
    if (/fetch|network/i.test(error.message || '')) throw new Error('Sem conexão com o banco. A alteração não foi salva.');
    throw new Error(error.message || 'Não foi possível concluir a operação.');
  },
  getCurrentUser() { return this.user; },
  async loadUser() {
    const { data: auth, error: authError } = await this.client.auth.getUser();
    this.check(authError);
    if (!auth.user) { this.user = null; return null; }
    const { data, error } = await this.client.from('profiles').select('*').eq('id', auth.user.id).single();
    this.check(error);
    this.user = data;
    return data;
  },
  async edge(action, payload = {}) {
    const { data, error } = await this.client.functions.invoke('fraga-api', { body: { action, ...payload } });
    if (error) {
      let message;
      if (error.context?.json) {
        try { message = (await error.context.json()).error; } catch {}
      }
      throw new Error(message || 'Não foi possível conectar ao servidor. Tente novamente.');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async login(username, password) {
    const res = await this.edge('login', { username, password });
    const { error } = await this.client.auth.setSession(res.session);
    this.check(error);
    return { success: true, user: await this.loadUser() };
  },
  async register(data) {
    const { data: result, error } = await this.client.auth.signUp({
      email: data.email.trim().toLowerCase(), password: data.password,
      options: { emailRedirectTo: window.location.origin + '/#/login',
        data: { username: data.username.trim().toLowerCase(), name: data.name,
          cpf_cnpj: data.cpf_cnpj, telefone: data.telefone } }
    });
    this.check(error);
    if (!result.session) return { success: true, confirmationRequired: true };
    return { success: true, user: await this.loadUser() };
  },
  async logout() {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    this.check(error);
    this.user = null;
  },
  async getMe() { return { user: await this.loadUser() }; },
  async getCompany() {
    const { data, error } = await this.client.from('company_settings').select('*').eq('id', 1).single();
    this.check(error);
    return data;
  },
  async updateCompany(data) {
    const { data: saved, error } = await this.client.from('company_settings')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', 1).select('id').single();
    this.check(error);
    return { success: true, id: saved.id };
  },
  async searchCompanyOnline() {
    return this.edge('company-search');
  },
  async validateNote(code) {
    let value = String(code || '').trim();
    try { value = decodeURIComponent(value); } catch {}
    if (value.includes('validar-nota/')) value = value.split('validar-nota/')[1].split(/[?#]/)[0];
    return this.edge('validate', { code: value });
  },
  async changePassword(currentPassword, password) {
    if (password.length < 12) throw new Error('Use uma senha com pelo menos 12 caracteres.');
    const verified = await this.client.auth.signInWithPassword({ email: this.user.email, password: currentPassword });
    if (verified.error) throw new Error('A senha atual está incorreta.');
    const { error } = await this.client.auth.updateUser({ password });
    this.check(error);
    const revoked = await this.client.auth.signOut({ scope: 'others' });
    this.check(revoked.error);
    return { success: true };
  },
  noteFields: '*,customers(nome,cpf_cnpj,telefone,whatsapp,endereco,cidade,estado,cep)',
  formatNote(note) {
    const c = note.customers || {};
    return { ...note, cliente_nome: c.nome || 'Consumidor Final', cliente_doc: c.cpf_cnpj || '',
      cliente_telefone: c.telefone || '', cliente_whatsapp: c.whatsapp || '',
      cliente_endereco: c.endereco || '', cliente_cidade: c.cidade || '',
      cliente_estado: c.estado || '', cliente_cep: c.cep || '',
      itens: note.note_items || [], arquivos: note.note_files || [] };
  },
  async getNotes(params = {}) {
    let query = this.client.from('notes').select(this.noteFields).order('id', { ascending: false });
    if (params.status) query = query.eq('status', params.status);
    const rows = await this.allRows(query);
    let result = rows.map(n => this.formatNote(n));
    if (params.q) {
      const term = params.q.toLocaleLowerCase('pt-BR');
      result = result.filter(n => [n.numero_nota,n.descricao,n.cliente_nome]
        .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term)));
    }
    return result;
  },
  async getNoteDetail(id) {
    const field = /^\d+$/.test(String(id)) ? 'id' : 'public_id';
    const { data, error } = await this.client.from('notes')
      .select(this.noteFields + ',note_items(*),note_files(*)').eq(field, id).single();
    this.check(error);
    return this.formatNote(data);
  },
  async createNote(data) {
    const { data: result, error } = await this.client.rpc('save_note', { payload: data });
    this.check(error);
    return result;
  },
  async updateNote(id, data) {
    const current = await this.getNoteDetail(id);
    const { data: result, error } = await this.client.rpc('save_note', {
      payload: { ...current, ...data }, note_id_input: Number(id)
    });
    this.check(error);
    return result;
  },
  async updateNoteStatus(id, status) {
    const { error } = await this.client.from('notes').update({ status, updated_at: new Date().toISOString() })
      .eq('id', id).select('id').single();
    this.check(error);
    return { success: true, status };
  },
  async deleteNote(id) { return this.remove('notes', id); },
  async allRows(query) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await query.range(offset, offset + 499);
      this.check(error);
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  },
  async remove(table, id) {
    const { error } = await this.client.from(table).delete().eq('id', id).select('id').single();
    this.check(error);
    return { success: true };
  },
  async insert(table, data) {
    const { data: saved, error } = await this.client.from(table).insert(data).select('id').single();
    this.check(error);
    return { success: true, id: saved.id };
  },
  async getCustomers() {
    const rows = await this.allRows(this.client.from('customers').select('*,notes(count)').order('id'));
    return rows.map(c => ({ ...c, total_notas: c.notes?.[0]?.count || 0 }));
  },
  async createCustomer(data) { return this.insert('customers', data); },
  async deleteCustomer(id) { return this.remove('customers', id); },
  async getUsers() { return this.allRows(this.client.from('profiles').select('*').order('created_at')); },
  async createUser(data) { return this.edge('create-user', data); },
  getBrowserData() {
    return {
      customers: JSON.parse(localStorage.getItem('fs_customers_persistent') || '[]'),
      notes: JSON.parse(localStorage.getItem('fs_notes_persistent') || '[]')
    };
  },
  async importBrowserData(payload) {
    const { data, error } = await this.client.rpc('import_browser_data', { payload });
    this.check(error);
    return data;
  },
  async getAuditLogs() {
    const { data, error } = await this.client.from('audit_logs').select('*').order('id', { ascending: false }).limit(200);
    this.check(error);
    return data;
  },
  async getPortfolio() {
    return this.allRows(this.client.from('portfolio_items').select('*').eq('published', true).order('display_order').order('id'));
  },
  async getAdminPortfolio() {
    return this.allRows(this.client.from('portfolio_items').select('*').order('display_order').order('id'));
  },
  async createPortfolioItem(data) { return this.insert('portfolio_items', data); },
  async updatePortfolioItem(id, data) {
    const { error } = await this.client.from('portfolio_items').update(data).eq('id', id).select('id').single();
    this.check(error);
    return { success: true };
  },
  async deletePortfolioItem(id) { return this.remove('portfolio_items', id); },
  async count(table, status) {
    let query = this.client.from(table).select('id', { count: 'exact', head: true });
    if (status) query = query.eq('status', status);
    const { count, error } = await query;
    this.check(error);
    return count;
  },
  async getDashboard() {
    const results = await Promise.all([
      this.count('notes'), this.count('notes','VALIDA'), this.count('notes','INVALIDADA'),
      this.count('notes','PENDENTE'), this.count('customers'), this.count('portfolio_items'),
      this.client.from('notes').select(this.noteFields).order('id',{ascending:false}).limit(5),
      this.client.from('audit_logs').select('*').order('id',{ascending:false}).limit(5)
    ]);
    this.check(results[6].error); this.check(results[7].error);
    return { counts: { total_notes: results[0], valid_notes: results[1], invalid_notes: results[2],
      pending_notes: results[3], total_customers: results[4], total_portfolio: results[5] },
      recent_notes: results[6].data.map(n => this.formatNote(n)), recent_audit: results[7].data };
  },
  async uploadFile(base64Data, filename) {
    const response = await fetch(base64Data);
    const blob = await response.blob();
    const ext = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[blob.type];
    if (!ext || blob.size > 5242880) throw new Error('Use uma imagem JPG, PNG ou WebP de até 5 MB.');
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await this.client.storage.from('company-images').upload(path, blob, { contentType: blob.type });
    this.check(error);
    const { data } = this.client.storage.from('company-images').getPublicUrl(path);
    return { success: true, url: data.publicUrl, filename };
  }
};
window.API = API;
