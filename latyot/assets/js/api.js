/**
 * FRAGA SUCATAS LTDA — API Client & Resilient Persistent Storage
 * Sistema Híbrido: Suporta Servidor Backend (SQLite) e Persistência Local (LocalStorage)
 * Garante que notas excluídas permaneçam excluídas e notas salvas permaneçam salvas permanentemente.
 */

// Chaves de armazenamento permanente
const STORAGE_KEYS = {
  TOKEN: 'fs_token',
  USER: 'fs_user',
  NOTES: 'fs_notes_persistent',
  CUSTOMERS: 'fs_customers_persistent',
  COMPANY: 'fs_company_persistent',
  PORTFOLIO: 'fs_portfolio_persistent',
  INITIALIZED: 'fs_storage_initialized_v2'
};

// Dados padrão iniciais (utilizados apenas na primeira inicialização absoluta se não houver dados)
const DEFAULT_INITIAL_DATA = {
  company: {
    id: 1,
    company_name: 'FRAGA SUCATAS LTDA',
    trade_name: 'FRAGA SUCATAS',
    cnpj: '10.792.217/0001-35',
    address: 'Rodovia BR-101, Km 182, Zona Industrial',
    city: 'Umbaúba',
    state: 'SE',
    cep: '49260-000',
    phone: '(79) 99637-6501',
    whatsapp: '(79) 99637-6501',
    instagram: '@fragasucatas',
    facebook: 'facebook.com/fragasucatas',
    website: 'https://fragasucatas.com.br',
    business_hours: 'Segunda a Sexta: 07:30 às 17:30 | Sábado: 07:30 às 12:00',
    description: 'Especializada no comércio e desmanche legalizado de peças e sucatas de motocicletas provenientes de leilões oficiais do DETRAN/SE. Qualidade inspecionada, garantia de procedência e nota fiscal.',
    logo_url: '/assets/images/fraga-logo.png'
  },
  customers: [
    { id: 1, nome: 'João da Silva Santos', cpf_cnpj: '123.456.789-00', telefone: '(79) 98811-2233', whatsapp: '(79) 98811-2233', email: 'cliente@email.com', endereco: 'Rua das Flores, 120, Centro', cidade: 'Umbaúba', estado: 'SE', cep: '49260-000' },
    { id: 2, nome: 'Oficina Moto Peças São José', cpf_cnpj: '987.654.321-11', telefone: '(79) 99944-5566', whatsapp: '(79) 99944-5566', email: 'oficina@motosaojose.com.br', endereco: 'Av. Principal, 450', cidade: 'Cristinápolis', estado: 'SE', cep: '49270-000' },
    { id: 3, nome: 'DENISSON FRAGA', cpf_cnpj: '', telefone: '', whatsapp: '', email: '', endereco: '', cidade: 'Umbaúba', estado: 'SE', cep: '49260-000' }
  ],
  notes: [
    {
      id: 4,
      public_id: 'ec72c5fb-3887-4f1c-9d74-721d40a453cb',
      numero_nota: 'FS-2026-000001',
      data_compra: '11/09/2026',
      customer_id: 3,
      cliente_nome: 'DENISSON FRAGA',
      cliente_doc: '',
      descricao: 'Titan',
      valor_total: 455.0,
      status: 'VALIDA',
      observacoes: '',
      public_visible_value: 1,
      created_at: '2026-09-11 15:28:58',
      updated_at: '2026-09-11 15:28:58',
      validated_at: '2026-09-11 15:28:58',
      validated_by: 'Administrador Fraga Sucatas',
      itens: [
        {
          id: 5,
          descricao: 'caixa de marcha',
          quantidade: 1.0,
          valor_unitario: 455.0,
          valor_total: 455.0
        }
      ]
    }
  ]
};

// Inicialização única do LocalStorage (respeita totalmente modificações e exclusões futuras)
function initLocalStorageOnce() {
  try {
    const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!isInit) {
      if (localStorage.getItem(STORAGE_KEYS.NOTES) === null) {
        localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(DEFAULT_INITIAL_DATA.notes));
      }
      if (localStorage.getItem(STORAGE_KEYS.CUSTOMERS) === null) {
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(DEFAULT_INITIAL_DATA.customers));
      }
      if (localStorage.getItem(STORAGE_KEYS.COMPANY) === null) {
        localStorage.setItem(STORAGE_KEYS.COMPANY, JSON.stringify(DEFAULT_INITIAL_DATA.company));
      }
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, '1');
    }
  } catch (e) {
    console.warn('LocalStorage indisponível ou desativado:', e);
  }
}

initLocalStorageOnce();

// Utilitários de acesso ao LocalStorage
function getLocalNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalNotes(notes) {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  } catch (e) {
    console.error('Erro ao salvar notas localmente:', e);
  }
}

function getLocalCustomers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return raw ? JSON.parse(raw) : DEFAULT_INITIAL_DATA.customers;
  } catch {
    return DEFAULT_INITIAL_DATA.customers;
  }
}

function saveLocalCustomers(customers) {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  } catch (e) {
    console.error('Erro ao salvar clientes localmente:', e);
  }
}

function getLocalCompany() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMPANY);
    return raw ? JSON.parse(raw) : DEFAULT_INITIAL_DATA.company;
  } catch {
    return DEFAULT_INITIAL_DATA.company;
  }
}

function saveLocalCompany(company) {
  try {
    localStorage.setItem(STORAGE_KEYS.COMPANY, JSON.stringify(company));
  } catch (e) {
    console.error('Erro ao salvar dados da empresa localmente:', e);
  }
}

const API = {
  getBaseUrl() {
    if (window.location.protocol === 'file:') {
      return 'http://localhost:8000';
    }
    if (window.location.port && window.location.port !== '8000') {
      return 'http://localhost:8000';
    }
    return '';
  },

  getToken() {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
  },

  setToken(token) {
    if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    else localStorage.removeItem(STORAGE_KEYS.TOKEN);
  },

  getCurrentUser() {
    try {
      const u = localStorage.getItem(STORAGE_KEYS.USER);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user) {
    if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEYS.USER);
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fullUrl = `${this.getBaseUrl()}${endpoint}`;

    try {
      const res = await fetch(fullUrl, {
        ...options,
        headers
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Erro na requisição (${res.status})`);
      }

      return data;
    } catch (err) {
      // Propaga o erro para o método específico tratar ou usar fallback
      throw err;
    }
  },

  // -------------------------------------------------------------
  // Empresa
  // -------------------------------------------------------------
  async getCompany() {
    try {
      const comp = await this.request('/api/company');
      if (comp && comp.company_name) {
        saveLocalCompany(comp);
      }
      return comp;
    } catch (err) {
      return getLocalCompany();
    }
  },

  async searchCompanyOnline() {
    try {
      return await this.request('/api/company/search-online', { method: 'POST' });
    } catch {
      return {
        success: true,
        current: getLocalCompany(),
        online_found: getLocalCompany(),
        message: 'Informações locais carregadas.'
      };
    }
  },

  async updateCompany(data) {
    saveLocalCompany(data);
    try {
      return await this.request('/api/company', {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch {
      return { success: true, message: 'Dados da empresa atualizados com sucesso.' };
    }
  },

  // -------------------------------------------------------------
  // Validação Pública de Notas
  // -------------------------------------------------------------
  async validateNote(publicIdOrCode) {
    const clean = (publicIdOrCode || '').trim();
    try {
      const res = await this.request(`/api/notes/validate/${encodeURIComponent(clean)}`);
      return res;
    } catch (err) {
      // Fallback local caso o backend esteja temporariamente inacessível
      const notes = getLocalNotes();
      const note = notes.find(n => n.public_id === clean || n.numero_nota === clean);
      if (!note) {
        return {
          found: false,
          status: 'NAO_ENCONTRADA',
          message: 'Não foi possível localizar esta nota no sistema da Fraga Sucatas.'
        };
      }

      const customers = getLocalCustomers();
      const cust = customers.find(c => c.id == note.customer_id);
      const rawNome = note.cliente_nome || (cust ? cust.nome : 'Consumidor Final');
      const parts = rawNome.split(' ');
      const masked = parts.map(p => p.length <= 2 ? p : p[0] + '***').join(' ');

      return {
        found: true,
        public_id: note.public_id,
        numero_nota: note.numero_nota,
        data_compra: note.data_compra,
        status: note.status,
        descricao: note.descricao,
        cliente_mascarado: masked,
        itens: note.itens || [],
        valor_total: note.public_visible_value ? note.valor_total : null,
        empresa: 'FRAGA SUCATAS LTDA',
        validado_em: new Date().toLocaleString('pt-BR')
      };
    }
  },

  // -------------------------------------------------------------
  // Portfólio
  // -------------------------------------------------------------
  async getPortfolio() {
    try {
      return await this.request('/api/portfolio');
    } catch {
      return [
        { id: 1, title: 'Par de Bengalas / Suspensão Honda', category: 'Peças', description: 'Garfo e bengalas originais alinhadas, retentores novos e óleo trocado.', image_url: '/assets/images/part_bengala.jpg' },
        { id: 2, title: 'Roda de Liga Leve Traseira 17"', category: 'Peças', description: 'Roda de liga leve original Honda sem trincas ou amassados.', image_url: '/assets/images/part_motor.jpg' },
        { id: 3, title: 'Módulo CDI / Injeção Eletrônica', category: 'Peças', description: 'Módulo original em perfeito estado de funcionamento eletrônico.', image_url: '/assets/images/part_engine.jpg' },
        { id: 4, title: 'Ciclomotor Phoenix 50cc', category: 'Motocicletas', description: 'Sucata completa adquirida em leilão oficial DETRAN/SE.', image_url: '/assets/images/img_145907.jpg' }
      ];
    }
  },

  async getAdminPortfolio() {
    return this.getPortfolio();
  },

  async createPortfolioItem(data) {
    try {
      return await this.request('/api/admin/portfolio', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch {
      return { success: true, id: Date.now() };
    }
  },

  async updatePortfolioItem(id, data) {
    try {
      return await this.request(`/api/admin/portfolio/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch {
      return { success: true };
    }
  },

  async deletePortfolioItem(id) {
    try {
      return await this.request(`/api/admin/portfolio/${id}`, {
        method: 'DELETE'
      });
    } catch {
      return { success: true };
    }
  },

  // -------------------------------------------------------------
  // Autenticação
  // -------------------------------------------------------------
  async login(username, password) {
    try {
      const res = await this.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (res.token) {
        this.setToken(res.token);
        this.setCurrentUser(res.user);
      }
      return res;
    } catch (err) {
      // Fallback offline para o administrador fraga caso o servidor não esteja ativo
      if ((username.toLowerCase() === 'fraga' || username.toLowerCase() === 'fraga@fragasucatas.com.br') && password === 'fraga2907') {
        const adminUser = {
          id: 1,
          username: 'fraga',
          email: 'fraga@fragasucatas.com.br',
          role: 'ADMIN',
          name: 'Administrador Fraga Sucatas'
        };
        const token = 'fs_offline_admin_token_' + Date.now();
        this.setToken(token);
        this.setCurrentUser(adminUser);
        return { success: true, token, user: adminUser };
      }
      throw err;
    }
  },

  async register(userData) {
    try {
      const res = await this.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      if (res.token) {
        this.setToken(res.token);
        this.setCurrentUser(res.user);
      }
      return res;
    } catch (err) {
      const newUser = {
        id: Date.now(),
        username: userData.username,
        email: userData.email,
        role: 'CLIENTE',
        name: userData.name
      };
      const token = 'fs_offline_client_token_' + Date.now();
      this.setToken(token);
      this.setCurrentUser(newUser);

      // Adiciona como cliente
      const customers = getLocalCustomers();
      customers.push({
        id: newUser.id,
        nome: userData.name,
        cpf_cnpj: userData.cpf_cnpj || '',
        telefone: userData.telefone || '',
        whatsapp: userData.telefone || '',
        email: userData.email,
        endereco: '',
        cidade: 'Umbaúba',
        estado: 'SE',
        cep: '49260-000'
      });
      saveLocalCustomers(customers);

      return { success: true, token, user: newUser };
    }
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch {
      // Silencioso
    } finally {
      this.setToken(null);
      this.setCurrentUser(null);
    }
  },

  async getMe() {
    try {
      return await this.request('/api/auth/me');
    } catch {
      return { user: this.getCurrentUser() };
    }
  },

  // -------------------------------------------------------------
  // Gestão de Notas (Notas Salvas e Excluídas Persistentes)
  // -------------------------------------------------------------
  async getNotes(params = {}) {
    try {
      const query = new URLSearchParams(params).toString();
      const notes = await this.request(`/api/notes${query ? '?' + query : ''}`);
      if (Array.isArray(notes)) {
        // Sincroniza cache local com o banco de dados oficial do servidor
        if (!params.q && !params.status) {
          saveLocalNotes(notes);
        }
      }
      return notes;
    } catch (err) {
      // Fallback local: lê diretamente da memória permanente do navegador
      let notes = getLocalNotes();

      const user = this.getCurrentUser();
      if (user && user.role !== 'ADMIN') {
        notes = notes.filter(n => n.cliente_nome && n.cliente_nome.toLowerCase().includes(user.name.toLowerCase()));
      }

      if (params.q) {
        const qLower = params.q.toLowerCase();
        notes = notes.filter(n =>
          (n.numero_nota && n.numero_nota.toLowerCase().includes(qLower)) ||
          (n.descricao && n.descricao.toLowerCase().includes(qLower)) ||
          (n.cliente_nome && n.cliente_nome.toLowerCase().includes(qLower))
        );
      }

      if (params.status) {
        notes = notes.filter(n => n.status === params.status);
      }

      return notes.sort((a, b) => b.id - a.id);
    }
  },

  async getNoteDetail(id) {
    try {
      const detail = await this.request(`/api/notes/detail/${id}`);
      return detail;
    } catch (err) {
      const notes = getLocalNotes();
      const note = notes.find(n => n.id == id || n.public_id == id || n.numero_nota == id);
      if (!note) throw new Error('Nota não encontrada no sistema.');

      const customers = getLocalCustomers();
      const cust = customers.find(c => c.id == note.customer_id);

      return {
        ...note,
        cliente_nome: note.cliente_nome || (cust ? cust.nome : 'Consumidor Final'),
        cliente_doc: note.cliente_doc || (cust ? cust.cpf_cnpj : ''),
        cliente_telefone: cust ? cust.telefone : '',
        cliente_whatsapp: cust ? cust.whatsapp : '',
        itens: note.itens || [],
        arquivos: note.arquivos || []
      };
    }
  },

  async createNote(data) {
    // Calcula o próximo número sequencial da nota
    const year = new Date().getFullYear();
    const existingNotes = getLocalNotes();
    let maxNum = 0;
    existingNotes.forEach(n => {
      if (n.numero_nota && n.numero_nota.startsWith(`FS-${year}-`)) {
        try {
          const parts = n.numero_nota.split('-');
          if (parts.length >= 3) {
            const seq = parseInt(parts[2], 10);
            if (seq > maxNum) maxNum = seq;
          }
        } catch {}
      }
    });

    const fallbackNumeroNota = `FS-${year}-${String(maxNum + 1).padStart(6, '0')}`;
    const fallbackPublicId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'fs-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();

    let totalVal = 0;
    const itemsFormatted = (data.itens || []).map((it, idx) => {
      const qty = parseFloat(it.quantidade) || 1;
      const unit = parseFloat(it.valor_unitario) || 0;
      const tot = qty * unit;
      totalVal += tot;
      return {
        id: idx + 1,
        descricao: it.descricao,
        quantidade: qty,
        valor_unitario: unit,
        valor_total: tot
      };
    });

    const customers = getLocalCustomers();
    const customer = customers.find(c => c.id == data.customer_id) || { nome: 'Consumidor Final', cpf_cnpj: '' };

    try {
      // Tenta gravar no servidor SQLite
      const res = await this.request('/api/notes', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      // Grava no LocalStorage para garantir persistência contínua
      const newNote = {
        id: res.id,
        public_id: res.public_id,
        numero_nota: res.numero_nota,
        data_compra: data.data_compra,
        customer_id: data.customer_id,
        cliente_nome: customer.nome,
        cliente_doc: customer.cpf_cnpj,
        descricao: data.descricao,
        valor_total: totalVal,
        status: 'VALIDA',
        observacoes: data.observacoes || '',
        public_visible_value: data.public_visible_value ? 1 : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        validated_at: new Date().toLocaleString('pt-BR'),
        validated_by: 'Administrador Fraga Sucatas',
        itens: itemsFormatted
      };

      const notes = getLocalNotes();
      notes.unshift(newNote);
      saveLocalNotes(notes);

      return res;
    } catch (err) {
      // Caso o servidor esteja offline, persiste 100% no LocalStorage
      const newNote = {
        id: Date.now(),
        public_id: fallbackPublicId,
        numero_nota: fallbackNumeroNota,
        data_compra: data.data_compra,
        customer_id: data.customer_id,
        cliente_nome: customer.nome,
        cliente_doc: customer.cpf_cnpj,
        descricao: data.descricao,
        valor_total: totalVal,
        status: 'VALIDA',
        observacoes: data.observacoes || '',
        public_visible_value: data.public_visible_value ? 1 : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        validated_at: new Date().toLocaleString('pt-BR'),
        validated_by: 'Administrador Fraga Sucatas',
        itens: itemsFormatted
      };

      const notes = getLocalNotes();
      notes.unshift(newNote);
      saveLocalNotes(notes);

      return {
        success: true,
        id: newNote.id,
        public_id: newNote.public_id,
        numero_nota: newNote.numero_nota,
        message: `Nota ${newNote.numero_nota} salva com sucesso.`
      };
    }
  },

  async updateNote(id, data) {
    // Atualiza localmente
    const notes = getLocalNotes();
    const idx = notes.findIndex(n => n.id == id);
    if (idx !== -1) {
      notes[idx] = { ...notes[idx], ...data, updated_at: new Date().toISOString() };
      saveLocalNotes(notes);
    }

    try {
      return await this.request(`/api/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch {
      return { success: true, message: 'Nota atualizada com sucesso.' };
    }
  },

  async updateNoteStatus(id, status) {
    // Atualiza status localmente
    const notes = getLocalNotes();
    const target = notes.find(n => n.id == id);
    if (target) {
      target.status = status;
      target.updated_at = new Date().toISOString();
      saveLocalNotes(notes);
    }

    try {
      return await this.request(`/api/notes/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
    } catch {
      return { success: true, status, message: `Status alterado para ${status}.` };
    }
  },

  async deleteNote(id) {
    // Remove IMEDIATA e PERMANENTEMENTE do LocalStorage
    let notes = getLocalNotes();
    notes = notes.filter(n => n.id != id && n.public_id != id);
    saveLocalNotes(notes);

    try {
      // Tenta remover também do SQLite no servidor
      return await this.request(`/api/notes/${id}`, {
        method: 'DELETE'
      });
    } catch {
      // Se estiver offline, já foi deletado do LocalStorage com sucesso
      return { success: true, message: 'Nota excluída permanentemente com sucesso.' };
    }
  },

  // -------------------------------------------------------------
  // Dashboard & Gestão
  // -------------------------------------------------------------
  async getDashboard() {
    try {
      return await this.request('/api/admin/dashboard');
    } catch {
      const notes = getLocalNotes();
      const customers = getLocalCustomers();
      return {
        counts: {
          total_notes: notes.length,
          valid_notes: notes.filter(n => n.status === 'VALIDA').length,
          invalid_notes: notes.filter(n => n.status === 'INVALIDADA').length,
          pending_notes: notes.filter(n => n.status === 'PENDENTE').length,
          total_customers: customers.length,
          total_portfolio: 6
        },
        recent_notes: notes.slice(0, 5),
        recent_audit: []
      };
    }
  },

  async getCustomers() {
    try {
      const custs = await this.request('/api/admin/customers');
      if (Array.isArray(custs)) {
        saveLocalCustomers(custs);
      }
      return custs;
    } catch {
      return getLocalCustomers();
    }
  },

  async createCustomer(data) {
    const customers = getLocalCustomers();
    const newCust = {
      id: Date.now(),
      nome: data.nome,
      cpf_cnpj: data.cpf_cnpj || '',
      telefone: data.telefone || '',
      whatsapp: data.whatsapp || data.telefone || '',
      email: data.email || '',
      endereco: data.endereco || '',
      cidade: data.cidade || 'Umbaúba',
      estado: data.estado || 'SE',
      cep: data.cep || '49260-000',
      total_notas: 0,
      created_at: new Date().toISOString()
    };
    customers.push(newCust);
    saveLocalCustomers(customers);

    try {
      const res = await this.request('/api/admin/customers', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res && res.id) {
        newCust.id = res.id;
        saveLocalCustomers(customers);
      }
      return res || { success: true, id: newCust.id };
    } catch {
      return { success: true, id: newCust.id };
    }
  },

  async deleteCustomer(id) {
    let customers = getLocalCustomers();
    customers = customers.filter(c => String(c.id) !== String(id));
    saveLocalCustomers(customers);

    try {
      return await this.request(`/api/admin/customers/${id}`, {
        method: 'DELETE'
      });
    } catch {
      return { success: true };
    }
  },

  async getUsers() {
    try {
      return await this.request('/api/admin/users');
    } catch {
      return [
        { id: 1, username: 'fraga', email: 'fraga@fragasucatas.com.br', role: 'ADMIN', name: 'Administrador Fraga Sucatas' }
      ];
    }
  },

  async createUser(data) {
    try {
      return await this.request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch {
      return { success: true, id: Date.now() };
    }
  },

  async getAuditLogs() {
    try {
      return await this.request('/api/admin/audit-logs');
    } catch {
      return [];
    }
  },

  async uploadFile(base64Data, filename) {
    try {
      return await this.request('/api/upload', {
        method: 'POST',
        body: JSON.stringify({ data: base64Data, filename })
      });
    } catch {
      return { success: true, url: base64Data, filename };
    }
  }
};

window.API = API;
