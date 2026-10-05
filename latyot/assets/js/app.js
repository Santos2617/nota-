/**
 * FRAGA SUCATAS LTDA — Controlador Principal da Aplicação
 */

let appScanner = null;
let currentCompany = null;

// Inicialização Global
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await API.init();
  } catch (err) {
    UI.showToast(err.message, 'error', 8000);
  }
  await loadCompanyData();
  initRouter();
  initGlobalEventListeners();
  window.appRouter.handleRoute();
  const refresh = () => {
    if (document.visibilityState !== 'visible' || document.querySelector('.modal-overlay.active') ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const route = window.location.hash;
    if (['#/admin', '#/admin/notas', '#/admin/clientes', '#/admin/portfolio', '#/cliente', '#/portfolio'].includes(route)) {
      window.appRouter.handleRoute();
    }
  };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
});

// Carrega Dados Oficiais da Empresa
async function loadCompanyData() {
  try {
    currentCompany = await API.getCompany();
    applyCompanyToUI(currentCompany);
  } catch (err) {
    console.error('Erro ao carregar dados da empresa:', err);
  }
}

function applyCompanyToUI(comp) {
  if (!comp) return;

  // Atualiza Textos
  document.querySelectorAll('.company-name-text').forEach(el => el.textContent = comp.company_name || 'FRAGA SUCATAS LTDA');
  document.querySelectorAll('.company-trade-text').forEach(el => el.textContent = comp.trade_name || 'FRAGA SUCATAS');
  document.querySelectorAll('.company-cnpj-text').forEach(el => el.textContent = comp.cnpj || '10.792.217/0001-35');
  document.querySelectorAll('.company-phone-text').forEach(el => el.textContent = comp.phone || '(79) 99637-6501');
  document.querySelectorAll('.company-whatsapp-text').forEach(el => el.textContent = comp.whatsapp || '(79) 99637-6501');
  document.querySelectorAll('.company-address-text').forEach(el => el.textContent = `${comp.address || ''}, ${comp.city || 'Umbaúba'} - ${comp.state || 'SE'}`);
  document.querySelectorAll('.company-hours-text').forEach(el => el.textContent = comp.business_hours || 'Seg - Sex: 07:30 às 17:30');
  document.querySelectorAll('.company-instagram-text').forEach(el => el.textContent = comp.instagram || '@fragasucatas');

  // WhatsApp Link
  const rawZap = (comp.whatsapp || '79996376501').replace(/\D/g, '');
  const zapUrl = `https://wa.me/55${rawZap}?text=${encodeURIComponent('Olá! Vim através do site da Fraga Sucatas e gostaria de informações.')}`;
  document.querySelectorAll('.btn-whatsapp-direct').forEach(el => el.href = zapUrl);

  // Logo Oficial (Mantendo Proporções e Imagem Oficial Fornecida)
  const logoSrc = comp.logo_url || '/assets/images/fraga-logo.png';
  document.querySelectorAll('.official-fraga-logo').forEach(img => {
    img.src = logoSrc;
  });
}

// Configuração de Rotas SPA
function initRouter() {
  const routes = {
    '#/': renderHomeView,
    '#/validar-nota': () => renderValidatorView(),
    '#/validar-nota/:id': (id) => renderValidatorView(id),
    '#/portfolio': renderPortfolioView,
    '#/sobre': renderAboutView,
    '#/contato': renderContactView,
    '#/login': renderLoginView,
    '#/cadastro': renderRegisterView,
    '#/cliente': renderCustomerView,
    '#/admin': renderAdminDashboard,
    '#/admin/notas': renderAdminNotes,
    '#/admin/clientes': renderAdminCustomers,
    '#/admin/portfolio': renderAdminPortfolio,
    '#/admin/empresa': renderAdminCompany,
    '#/admin/usuarios': renderAdminUsers,
    '#/admin/auditoria': renderAdminAudit
  };

  window.appRouter = new Router(routes, '#/');
}

// -------------------------------------------------------------
// Visualizações Públicas
// -------------------------------------------------------------
async function renderHomeView() {
  document.getElementById('view-home').style.display = 'block';
  await loadHomePortfolioPreview();
}

async function loadHomePortfolioPreview() {
  const container = document.getElementById('home-portfolio-grid');
  if (!container) return;

  try {
    const items = await API.getPortfolio();
    const previewItems = items.slice(0, 3);
    
    container.innerHTML = previewItems.map(item => `
      <div class="portfolio-card">
        <div class="portfolio-img-wrap">
          <img src="${UI.escapeHTML(item.image_url)}" alt="${UI.escapeHTML(item.title)}" class="portfolio-img" loading="lazy" />
          <span class="portfolio-category-tag">${UI.escapeHTML(item.category)}</span>
        </div>
        <div class="portfolio-content">
          <h3>${UI.escapeHTML(item.title)}</h3>
          <p>${UI.escapeHTML(item.description)}</p>
          <a href="#/portfolio" class="btn btn-gold-outline btn-sm">Ver Detalhes</a>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.warn('Erro ao carregar prévia do portfólio:', err);
  }
}

// Validador de Notas
async function renderValidatorView(preloadedId = null) {
  document.getElementById('view-validator').style.display = 'block';

  // Se veio ID pela URL, dispara validação diretamente
  if (preloadedId) {
    const codeInput = document.getElementById('manual-note-code');
    if (codeInput) codeInput.value = preloadedId;
    await executeValidation(preloadedId);
  } else {
    // Inicializa scanner se na aba de câmera
    initCameraScanner();
  }
}

function initCameraScanner() {
  const video = document.getElementById('scanner-video');
  const canvas = document.getElementById('scanner-canvas');
  if (!video || !canvas) return;

  if (appScanner) {
    appScanner.stop();
  }

  appScanner = new QRScanner(video, canvas, async (scannedCode) => {
    UI.showToast('QR Code lido com sucesso!', 'success');
    window.location.hash = `#/validar-nota/${encodeURIComponent(scannedCode)}`;
  });

  const tabCamera = document.getElementById('tab-btn-camera');
  if (tabCamera && tabCamera.classList.contains('active')) {
    appScanner.start().catch(() => {});
  }
}

async function executeValidation(codeOrId) {
  if (!codeOrId || !codeOrId.trim()) {
    UI.showToast('Informe o código da nota ou código de validação.', 'warning');
    return;
  }

  const resultContainer = document.getElementById('validation-result-container');
  resultContainer.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="gold-badge" style="font-size: 1rem; padding: 10px 24px;">
        <span class="spinner" style="display:inline-block; animation: spin 1s linear infinite;">⏳</span>
        Consultando dados oficiais no servidor da Fraga Sucatas...
      </div>
    </div>
  `;

  try {
    const data = await API.validateNote(codeOrId);
    renderValidationResult(data);
  } catch (err) {
    renderValidationNotFound(codeOrId);
  }
}

function renderValidationResult(data) {
  const container = document.getElementById('validation-result-container');
  const isValid = data.status === 'VALIDA';

  let statusBadge = `
    <span class="validation-status-badge badge-valid">
      ✓ NOTA VÁLIDA
    </span>
  `;
  let statusMessage = "Esta nota consta como válida no sistema da Fraga Sucatas.";
  let badgeStyle = "border-color: var(--status-valid-border);";

  if (!isValid) {
    statusBadge = `
      <span class="validation-status-badge badge-invalid">
        ⚠ NOTA INVALIDADA
      </span>
    `;
    statusMessage = "Esta nota não está atualmente válida no sistema da Fraga Sucatas.";
    badgeStyle = "border-color: var(--status-invalid-border);";
  }

  const itemsHtml = (data.itens || []).map(it => `
    <tr>
      <td><strong>${UI.escapeHTML(it.descricao)}</strong></td>
      <td style="text-align: center;">${it.quantidade}</td>
      ${data.valor_total ? `<td style="text-align: right;">${UI.formatBRL(it.valor_unitario)}</td><td style="text-align: right; font-weight: bold;">${UI.formatBRL(it.valor_total)}</td>` : ''}
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="validation-card" style="${badgeStyle}">
      <div class="validation-header">
        <div style="display: flex; align-items: center; gap: 14px;">
          <img src="${currentCompany?.logo_url || '/assets/images/fraga-logo.png'}" class="brand-logo-img" alt="Logo Fraga Sucatas" />
          <div>
            <h4 style="font-size: 1.15rem; margin-bottom: 2px;">FRAGA SUCATAS LTDA</h4>
            <span style="font-size: 0.78rem; color: var(--gold-light); font-weight: 600;">CONSULTA PÚBLICA OFICIAL</span>
          </div>
        </div>
        ${statusBadge}
      </div>

      <div class="validation-body">
        <div class="note-official-box">
          <div class="note-meta-grid">
            <div class="note-meta-item">
              <label>Número da Nota</label>
              <span class="gold-text" style="font-size: 1.35rem; font-weight: 800;">${data.numero_nota}</span>
            </div>
            <div class="note-meta-item">
              <label>Data da Compra</label>
              <span>${data.data_compra}</span>
            </div>
            <div class="note-meta-item">
              <label>Cliente</label>
              <span>${UI.escapeHTML(data.cliente_mascarado)}</span>
            </div>
            <div class="note-meta-item">
              <label>Código de Validação</label>
              <span style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${data.public_id}</span>
            </div>
          </div>

          ${data.descricao ? `
            <div style="margin-bottom: 18px; padding: 12px; background: rgba(0,0,0,0.25); border-radius: 8px;">
              <label style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Resumo da Operação</label>
              <p style="font-size: 0.92rem; color: var(--text-main);">${UI.escapeHTML(data.descricao)}</p>
            </div>
          ` : ''}

          <table class="note-items-table">
            <thead>
              <tr>
                <th>Peça / Produto</th>
                <th style="text-align: center;">Qtd</th>
                ${data.valor_total ? '<th style="text-align: right;">Unitário</th><th style="text-align: right;">Total</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              ${data.valor_total ? `
                <tr style="background: rgba(212, 175, 55, 0.08); font-weight: 800;">
                  <td colspan="3" style="text-align: right; color: var(--gold-light);">VALOR TOTAL:</td>
                  <td style="text-align: right; color: var(--gold-light); font-size: 1.1rem;">${UI.formatBRL(data.valor_total)}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <div style="margin-top: 16px; padding: 12px 16px; background: rgba(212, 175, 55, 0.06); border-left: 3px solid var(--gold-primary); border-radius: 6px; font-size: 0.8rem; line-height: 1.5; color: var(--text-muted); text-align: justify;">
            <strong style="color: var(--gold-light);">Obs:</strong> Os veículos leiloados na condição de SUCATAS APROVEITÁVEIS, sendo classificadas como sucatas aproveitáveis e sucatas aproveitáveis com motor inservível, baixados no Registro Nacional de Veículos Automotores (RENAVAM), não podem ser registrados ou licenciados e absolutamente proibida a sua circulação em via pública, destinando-se exclusivamente para DESMONTE e REAPROVEITAMENTO comercial de suas peças e partes metálicas.
          </div>
        </div>

        <div class="validation-footer-stamp">
          <div class="authenticity-text">
            <span>🛡️</span>
            <strong>${statusMessage}</strong>
          </div>
          <div style="display: flex; gap: 10px;">
            <button onclick="window.printDoc('${data.public_id}', true)" class="btn btn-secondary btn-sm">
              🖨️ Imprimir Certificado
            </button>
            <button onclick="resetValidationForm()" class="btn btn-gold-outline btn-sm">
              Nova Consulta
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderValidationNotFound(code) {
  const container = document.getElementById('validation-result-container');
  container.innerHTML = `
    <div class="validation-card" style="border-color: rgba(239, 68, 68, 0.4);">
      <div class="validation-header">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${currentCompany?.logo_url || '/assets/images/fraga-logo.png'}" class="brand-logo-img" alt="Logo" />
          <h4 style="font-size: 1.1rem;">FRAGA SUCATAS LTDA</h4>
        </div>
        <span class="validation-status-badge badge-notfound">
          ✕ NOTA NÃO ENCONTRADA
        </span>
      </div>
      <div class="validation-body" style="text-align: center; padding: 40px 24px;">
        <div style="font-size: 3rem; margin-bottom: 14px;">🔍</div>
        <h3 style="margin-bottom: 8px;">Código não localizado</h3>
        <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 24px;">
          Não foi possível localizar nenhuma nota de compra correspondente ao identificador "<strong>${UI.escapeHTML(code)}</strong>" no banco de dados oficial da Fraga Sucatas.
        </p>
        <button onclick="resetValidationForm()" class="btn btn-primary">
          Tentar Outro Código
        </button>
      </div>
    </div>
  `;
}

function resetValidationForm() {
  const resultContainer = document.getElementById('validation-result-container');
  if (resultContainer) resultContainer.innerHTML = '';
  const input = document.getElementById('manual-note-code');
  if (input) {
    input.value = '';
    input.focus();
  }
  window.location.hash = '#/validar-nota';
  initCameraScanner();
}

// Portfólio Completo
async function renderPortfolioView() {
  document.getElementById('view-portfolio').style.display = 'block';
  const container = document.getElementById('full-portfolio-grid');
  if (!container) return;

  container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Carregando peças e lotes do portfólio...</div>';

  try {
    const items = await API.getPortfolio();
    window.allPortfolioItems = items;
    filterPortfolio('Todas');
  } catch (err) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ef4444;">Erro ao carregar portfólio.</div>';
  }
}

function filterPortfolio(category) {
  const container = document.getElementById('full-portfolio-grid');
  if (!container || !window.allPortfolioItems) return;

  document.querySelectorAll('.filter-btn').forEach(b => {
    if (b.getAttribute('data-cat') === category) b.classList.add('active');
    else b.classList.remove('active');
  });

  const filtered = category === 'Todas' 
    ? window.allPortfolioItems 
    : window.allPortfolioItems.filter(i => i.category.toLowerCase() === category.toLowerCase());

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted);">Nenhum item cadastrado nesta categoria no momento.</div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="portfolio-card">
      <div class="portfolio-img-wrap">
        <img src="${UI.escapeHTML(item.image_url)}" alt="${UI.escapeHTML(item.title)}" class="portfolio-img" loading="lazy" />
        <span class="portfolio-category-tag">${UI.escapeHTML(item.category)}</span>
      </div>
      <div class="portfolio-content">
        <h3>${UI.escapeHTML(item.title)}</h3>
        <p>${UI.escapeHTML(item.description)}</p>
        <div style="margin-top: auto; display: flex; gap: 8px;">
          <a href="https://wa.me/55${(currentCompany?.whatsapp || '79996376501').replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Tenho interesse no item do portfólio: ${item.title}`)}" target="_blank" class="btn btn-primary btn-sm" style="flex: 1;">
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  `).join('');
}

function renderAboutView() {
  document.getElementById('view-about').style.display = 'block';
}

function renderContactView() {
  document.getElementById('view-contact').style.display = 'block';
}

function renderLoginView() {
  document.getElementById('view-login').style.display = 'block';
}

function renderRegisterView() {
  document.getElementById('view-register').style.display = 'block';
}

// -------------------------------------------------------------
// Área do Cliente
// -------------------------------------------------------------
async function renderCustomerView() {
  document.getElementById('view-customer').style.display = 'block';
  const user = API.getCurrentUser();
  const nameSlot = document.getElementById('client-welcome-name');
  if (nameSlot && user) nameSlot.textContent = user.name;

  const notesList = document.getElementById('customer-notes-list');
  notesList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px;">Buscando suas compras...</td></tr>';

  try {
    const notes = await API.getNotes();
    if (notes.length === 0) {
      notesList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px; color: var(--text-muted);">Você ainda não possui compras registradas no sistema.</td></tr>';
      return;
    }

    notesList.innerHTML = notes.map(n => `
      <tr>
        <td><strong class="gold-text">${n.numero_nota}</strong></td>
        <td>${n.data_compra}</td>
        <td>${UI.escapeHTML(n.descricao)}</td>
        <td><strong>${UI.formatBRL(n.valor_total)}</strong></td>
        <td>
          <span class="validation-status-badge ${n.status === 'VALIDA' ? 'badge-valid' : 'badge-invalid'}" style="font-size: 0.72rem; padding: 4px 10px;">
            ${n.status}
          </span>
        </td>
        <td>
          <button onclick="openNoteDetailModal(${n.id})" class="btn btn-secondary btn-sm">
            Ver QR & Detalhes
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    notesList.innerHTML = `<tr><td colspan="5" style="color: #ef4444; text-align:center;">Erro: ${err.message}</td></tr>`;
  }
}

// -------------------------------------------------------------
// Painel Administrativo
// -------------------------------------------------------------
function showAdminSection(sectionId) {
  document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
  const target = document.getElementById(sectionId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.classList.remove('active');
  });
}

async function renderAdminDashboard() {
  document.getElementById('view-admin').style.display = 'block';
  showAdminSection('admin-sec-dashboard');
  document.getElementById('nav-admin-dashboard')?.classList.add('active');

  try {
    const data = await API.getDashboard();
    document.getElementById('kpi-total-notes').textContent = data.counts.total_notes;
    document.getElementById('kpi-valid-notes').textContent = data.counts.valid_notes;
    document.getElementById('kpi-invalid-notes').textContent = data.counts.invalid_notes;
    document.getElementById('kpi-pending-notes').textContent = data.counts.pending_notes;
    document.getElementById('kpi-customers').textContent = data.counts.total_customers;
    document.getElementById('kpi-portfolio').textContent = data.counts.total_portfolio;

    // Notas Recentes
    const recTable = document.getElementById('admin-recent-notes-body');
    if (recTable) {
      recTable.innerHTML = data.recent_notes.map(n => `
        <tr>
          <td><strong class="gold-text">${n.numero_nota}</strong></td>
          <td>${UI.escapeHTML(n.cliente_nome || 'Consumidor')}</td>
          <td>${n.data_compra}</td>
          <td>${UI.formatBRL(n.valor_total)}</td>
          <td>
            <span class="validation-status-badge ${n.status === 'VALIDA' ? 'badge-valid' : 'badge-invalid'}" style="font-size: 0.72rem; padding: 4px 10px;">
              ${n.status}
            </span>
          </td>
          <td>
            <button onclick="openNoteDetailModal(${n.id})" class="btn btn-secondary btn-sm">Gerenciar</button>
          </td>
        </tr>
      `).join('');
    }

    // Auditoria Recente
    const auditFeed = document.getElementById('admin-recent-audit-body');
    if (auditFeed) {
      auditFeed.innerHTML = data.recent_audit.map(a => `
        <div style="padding: 10px; border-bottom: 1px solid var(--border-light); font-size: 0.85rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: var(--gold-light);">${a.action}</strong>
            <span style="color: var(--text-dim); font-size: 0.75rem;">${UI.formatDateTime(a.created_at)}</span>
          </div>
          <p style="color: var(--text-main); margin-bottom: 2px;">${UI.escapeHTML(a.details)}</p>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Por: ${UI.escapeHTML(a.user_name)} (${a.user_role}) • IP: ${a.ip_address}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Erro dashboard:', err);
  }
}

async function renderAdminNotes() {
  document.getElementById('view-admin').style.display = 'block';
  showAdminSection('admin-sec-notas');
  document.getElementById('nav-admin-notas')?.classList.add('active');
  await loadAdminNotesList();
}

async function loadAdminNotesList() {
  const searchInput = document.getElementById('admin-notes-search');
  const statusSelect = document.getElementById('admin-notes-filter-status');
  const params = {};
  if (searchInput && searchInput.value) params.q = searchInput.value;
  if (statusSelect && statusSelect.value) params.status = statusSelect.value;

  const tbody = document.getElementById('admin-notes-table-body');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Carregando notas...</td></tr>';

  try {
    const notes = await API.getNotes(params);
    if (notes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-muted);">Nenhuma nota localizada com os filtros informados.</td></tr>';
      return;
    }

    tbody.innerHTML = notes.map(n => `
      <tr>
        <td><strong class="gold-text">${n.numero_nota}</strong></td>
        <td>${UI.escapeHTML(n.cliente_nome || 'Consumidor')}</td>
        <td>${n.data_compra}</td>
        <td><strong>${UI.formatBRL(n.valor_total)}</strong></td>
        <td>
          <select onchange="handleAdminQuickStatusChange(${n.id}, this.value)" class="form-control" style="padding: 4px 8px; font-size: 0.8rem; width: auto; background: var(--bg-card-elevated);">
            <option value="VALIDA" ${n.status === 'VALIDA' ? 'selected' : ''}>VALIDA</option>
            <option value="INVALIDADA" ${n.status === 'INVALIDADA' ? 'selected' : ''}>INVALIDADA</option>
            <option value="PENDENTE" ${n.status === 'PENDENTE' ? 'selected' : ''}>PENDENTE</option>
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button onclick="openNoteDetailModal(${n.id})" class="btn btn-secondary btn-sm" title="Visualizar Nota e QR">QR / Ver</button>
            <button onclick="QR.download('${n.public_id}', '${n.numero_nota}')" class="btn btn-gold-outline btn-sm" title="Baixar QR Code PNG">Baixar QR</button>
            <button onclick="window.printDoc('${n.public_id}')" class="btn btn-secondary btn-sm" title="Imprimir Nota">Imprimir</button>
            <button onclick="deleteNoteConfirm(${n.id}, '${n.numero_nota}')" class="btn btn-danger btn-sm" title="Excluir Nota">✕</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align:center;">Erro: ${err.message}</td></tr>`;
  }
}

async function handleAdminQuickStatusChange(noteId, newStatus) {
  try {
    await API.updateNoteStatus(noteId, newStatus);
    UI.showToast(`Status alterado para ${newStatus}.`, 'success');
  } catch (err) {
    UI.showToast(err.message, 'error');
    await loadAdminNotesList();
  }
}

async function deleteNoteConfirm(id, numero) {
  if (confirm(`Atenção: Deseja realmente excluir permanentemente a nota ${numero}? Esta ação será gravada na trilha de auditoria.`)) {
    try {
      await API.deleteNote(id);
      UI.showToast(`Nota ${numero} excluída com sucesso.`, 'success');
      await loadAdminNotesList();
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }
}

// Visualizador de Detalhes da Nota & QR Code
async function openNoteDetailModal(id) {
  UI.openModal('modal-note-detail');
  const body = document.getElementById('modal-note-detail-body');
  body.innerHTML = '<div style="text-align:center; padding: 40px;">Carregando detalhes...</div>';

  try {
    const note = await API.getNoteDetail(id);
    const qrContainerId = `qr-modal-${note.id}`;

    body.innerHTML = `
      <div style="display: grid; grid-template-columns: 1.8fr 1fr; gap: 24px;">
        <div>
          <div class="note-meta-grid">
            <div class="note-meta-item">
              <label>Número da Nota</label>
              <span class="gold-text" style="font-size: 1.4rem;">${note.numero_nota}</span>
            </div>
            <div class="note-meta-item">
              <label>Status Atual</label>
              <span class="validation-status-badge ${note.status === 'VALIDA' ? 'badge-valid' : 'badge-invalid'}">
                ${note.status}
              </span>
            </div>
            <div class="note-meta-item">
              <label>Data da Compra</label>
              <span>${note.data_compra}</span>
            </div>
            <div class="note-meta-item">
              <label>Cliente</label>
              <span>${UI.escapeHTML(note.cliente_nome || 'Consumidor Final')} (${UI.escapeHTML(note.cliente_doc || '')})</span>
            </div>
          </div>

          <div style="margin: 16px 0;">
            <label style="font-size: 0.78rem; color: var(--text-dim); text-transform: uppercase; font-weight: bold;">Descrição Geral</label>
            <p style="font-size: 0.95rem;">${UI.escapeHTML(note.descricao || '-')}</p>
          </div>

          <table class="note-items-table">
            <thead>
              <tr>
                <th>Item / Peça</th>
                <th style="text-align: center;">Qtd</th>
                <th style="text-align: right;">Unitário</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${(note.itens || []).map(it => `
                <tr>
                  <td>${UI.escapeHTML(it.descricao)}</td>
                  <td style="text-align: center;">${it.quantidade}</td>
                  <td style="text-align: right;">${UI.formatBRL(it.valor_unitario)}</td>
                  <td style="text-align: right; font-weight: bold;">${UI.formatBRL(it.valor_total)}</td>
                </tr>
              `).join('')}
              <tr style="background: rgba(212, 175, 55, 0.08); font-weight: 800;">
                <td colspan="3" style="text-align: right; color: var(--gold-light);">VALOR TOTAL:</td>
                <td style="text-align: right; color: var(--gold-light); font-size: 1.15rem;">${UI.formatBRL(note.valor_total)}</td>
              </tr>
            </tbody>
          </table>

          ${note.observacoes ? `
            <div style="margin-top: 16px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px;">
              <strong style="font-size: 0.78rem; color: var(--gold-light); text-transform: uppercase;">Observações Internas:</strong>
              <p style="font-size: 0.88rem; color: var(--text-muted); margin-top: 4px;">${UI.escapeHTML(note.observacoes)}</p>
            </div>
          ` : ''}

          <div style="margin-top: 16px; padding: 12px 16px; background: rgba(212, 175, 55, 0.06); border-left: 3px solid var(--gold-primary); border-radius: 6px; font-size: 0.78rem; line-height: 1.5; color: var(--text-muted); text-align: justify;">
            <strong style="color: var(--gold-light);">Obs:</strong> Os veículos leiloados na condição de SUCATAS APROVEITÁVEIS, sendo classificadas como sucatas aproveitáveis e sucatas aproveitáveis com motor inservível, baixados no Registro Nacional de Veículos Automotores (RENAVAM), não podem ser registrados ou licenciados e absolutamente proibida a sua circulação em via pública, destinando-se exclusivamente para DESMONTE e REAPROVEITAMENTO comercial de suas peças e partes metálicas.
          </div>
        </div>

        <div style="background: var(--bg-card-elevated); border: 1px solid var(--gold-border); border-radius: 12px; padding: 20px; text-align: center; display: flex; flex-direction: column; align-items: center;">
          <h4 style="font-size: 0.92rem; text-transform: uppercase; color: var(--gold-light); margin-bottom: 12px;">QR Code de Validação</h4>
          <div id="${qrContainerId}" style="background: #ffffff; padding: 10px; border-radius: 8px; margin-bottom: 12px;"></div>
          <div style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 16px; word-break: break-all;">
            <strong>Token Seguro:</strong><br/>${note.public_id}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <button onclick="QR.download('${note.public_id}', '${note.numero_nota}')" class="btn btn-primary btn-sm">
              ⬇ Baixar QR Code PNG
            </button>
            <button onclick="QR.copyLink('${note.public_id}')" class="btn btn-secondary btn-sm">
              🔗 Copiar Link de Validação
            </button>
            <button onclick="window.open(QR.getValidationUrl('${note.public_id}'), '_blank')" class="btn btn-gold-outline btn-sm">
              ↗ Abrir Página Pública
            </button>
            <button onclick="window.printDoc('${note.public_id}')" class="btn btn-secondary btn-sm">
              🖨️ Imprimir Nota Completa
            </button>
          </div>
        </div>
      </div>
    `;

    // Renderiza o QR Code com a biblioteca
    setTimeout(() => {
      const el = document.getElementById(qrContainerId);
      QR.render(el, note.public_id, 180);
    }, 50);

  } catch (err) {
    body.innerHTML = `<div style="color: #ef4444; padding: 20px;">Erro ao carregar detalhes: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// Ferramenta de Busca Online de Informações da Loja (Requisito 2)
// -------------------------------------------------------------
async function renderAdminCompany() {
  document.getElementById('view-admin').style.display = 'block';
  showAdminSection('admin-sec-empresa');
  document.getElementById('nav-admin-empresa')?.classList.add('active');

  const comp = await API.getCompany();
  const form = document.getElementById('admin-company-form');
  if (!form || !comp) return;

  form.elements['company_name'].value = comp.company_name || '';
  form.elements['trade_name'].value = comp.trade_name || '';
  form.elements['cnpj'].value = comp.cnpj || '';
  form.elements['address'].value = comp.address || '';
  form.elements['city'].value = comp.city || '';
  form.elements['state'].value = comp.state || '';
  form.elements['cep'].value = comp.cep || '';
  form.elements['phone'].value = comp.phone || '';
  form.elements['whatsapp'].value = comp.whatsapp || '';
  form.elements['instagram'].value = comp.instagram || '';
  form.elements['facebook'].value = comp.facebook || '';
  form.elements['website'].value = comp.website || '';
  form.elements['business_hours'].value = comp.business_hours || '';
  form.elements['description'].value = comp.description || '';
}

async function handleSearchOnlineCompany() {
  const btn = document.getElementById('btn-search-online-company');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Buscando fontes públicas na internet... ⏳';
  }

  try {
    const res = await API.searchCompanyOnline();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🔍 Buscar informações online';
    }

    openOnlineDataComparisonModal(res.current, res.online_found);
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🔍 Buscar informações online';
    }
    UI.showToast(`Erro na busca online: ${err.message}`, 'error');
  }
}

function openOnlineDataComparisonModal(current, found) {
  UI.openModal('modal-online-comparison');
  const body = document.getElementById('modal-online-comparison-body');
  window.pendingOnlineData = found;

  body.innerHTML = `
    <div style="background: rgba(212, 175, 55, 0.08); border: 1px solid var(--gold-border); border-radius: 8px; padding: 14px; margin-bottom: 20px;">
      <strong style="color: var(--gold-light);">Fonte Encontrada:</strong> ${found.source} (${found.found_at})<br/>
      <span style="font-size: 0.82rem; color: var(--text-muted);">
        Atenção: Nenhuma informação encontrada na internet é aplicada automaticamente. Selecione ou edite os dados abaixo antes de confirmar a atualização no site público.
      </span>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 0.88rem;">
      <div style="background: var(--bg-card-elevated); padding: 16px; border-radius: 8px; border: 1px solid var(--border-light);">
        <h4 style="color: var(--text-dim); text-transform: uppercase; margin-bottom: 12px; font-size: 0.8rem;">Dados Atuais no Sistema</h4>
        <p><strong>Razão Social:</strong> ${current.company_name || '-'}</p>
        <p><strong>Nome Fantasia:</strong> ${current.trade_name || '-'}</p>
        <p><strong>CNPJ:</strong> ${current.cnpj || '-'}</p>
        <p><strong>Endereço:</strong> ${current.address || '-'}</p>
        <p><strong>Cidade/UF:</strong> ${current.city || '-'} / ${current.state || '-'}</p>
        <p><strong>CEP:</strong> ${current.cep || '-'}</p>
        <p><strong>Telefone:</strong> ${current.phone || '-'}</p>
        <p><strong>WhatsApp:</strong> ${current.whatsapp || '-'}</p>
        <p><strong>Instagram:</strong> ${current.instagram || '-'}</p>
      </div>

      <div style="background: rgba(16, 185, 129, 0.06); padding: 16px; border-radius: 8px; border: 1px solid var(--status-valid-border);">
        <h4 style="color: var(--status-valid); text-transform: uppercase; margin-bottom: 12px; font-size: 0.8rem;">Dados Localizados Online</h4>
        <p><strong>Razão Social:</strong> ${found.company_name || '-'}</p>
        <p><strong>Nome Fantasia:</strong> ${found.trade_name || '-'}</p>
        <p><strong>CNPJ:</strong> ${found.cnpj || '-'}</p>
        <p><strong>Endereço:</strong> ${found.address || '-'}</p>
        <p><strong>Cidade/UF:</strong> ${found.city || '-'} / ${found.state || '-'}</p>
        <p><strong>CEP:</strong> ${found.cep || '-'}</p>
        <p><strong>Telefone:</strong> ${found.phone || '-'}</p>
        <p><strong>WhatsApp:</strong> ${found.whatsapp || '-'}</p>
        <p><strong>Instagram:</strong> ${found.instagram || '-'}</p>
      </div>
    </div>
  `;
}

// Confirmação dos Dados Online pelo Administrador
async function applyOnlineDataToForm() {
  if (!window.pendingOnlineData) return;
  const f = window.pendingOnlineData;
  const form = document.getElementById('admin-company-form');
  if (form) {
    if (f.company_name) form.elements['company_name'].value = f.company_name;
    if (f.trade_name) form.elements['trade_name'].value = f.trade_name;
    if (f.cnpj) form.elements['cnpj'].value = f.cnpj;
    if (f.address) form.elements['address'].value = f.address;
    if (f.city) form.elements['city'].value = f.city;
    if (f.state) form.elements['state'].value = f.state;
    if (f.cep) form.elements['cep'].value = f.cep;
    if (f.phone) form.elements['phone'].value = f.phone;
    if (f.whatsapp) form.elements['whatsapp'].value = f.whatsapp;
    if (f.instagram) form.elements['instagram'].value = f.instagram;
    if (f.description) form.elements['description'].value = f.description;
  }
  UI.closeModal('modal-online-comparison');
  UI.showToast('Dados preenchidos no formulário. Clique em "Salvar Configurações" para publicar no site.', 'success');
}

// -------------------------------------------------------------
// Gestão de Portfólio, Clientes, Usuários e Auditoria
// -------------------------------------------------------------
async function renderAdminPortfolio() {
  document.getElementById('view-admin').style.display = 'block';
  showAdminSection('admin-sec-portfolio');
  document.getElementById('nav-admin-portfolio')?.classList.add('active');

  const tbody = document.getElementById('admin-portfolio-table-body');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Carregando peças...</td></tr>';

  try {
    const items = await API.getAdminPortfolio();
    tbody.innerHTML = items.map(it => `
      <tr>
        <td><img src="${UI.escapeHTML(it.image_url)}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px;" /></td>
        <td><strong>${UI.escapeHTML(it.title)}</strong></td>
        <td><span class="gold-badge" style="font-size: 0.72rem;">${UI.escapeHTML(it.category)}</span></td>
        <td>${it.published ? '✓ Publicado' : '✕ Rascunho'}</td>
        <td>${it.display_order}</td>
        <td>
          <button onclick="deletePortfolioConfirm(${it.id})" class="btn btn-danger btn-sm">Excluir</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: red;">Erro: ${err.message}</td></tr>`;
  }
}

async function deletePortfolioConfirm(id) {
  if (confirm('Deseja realmente excluir este item do portfólio?')) {
    try {
      await API.deletePortfolioItem(id);
      UI.showToast('Item removido do portfólio.', 'success');
      await renderAdminPortfolio();
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }
}

async function renderAdminCustomers() {
  document.getElementById('view-admin').style.display = 'block';
  showAdminSection('admin-sec-clientes');
  document.getElementById('nav-admin-clientes')?.classList.add('active');
  await loadAdminCustomersList();
}

async function loadAdminCustomersList() {
  const tbody = document.getElementById('admin-customers-table-body');
  if (!tbody) return;

  const searchInput = document.getElementById('admin-customers-search');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Carregando clientes...</td></tr>';

  try {
    let customers = await API.getCustomers();
    if (!Array.isArray(customers)) customers = [];

    const countBadge = document.getElementById('admin-customers-count');
    if (countBadge) {
      countBadge.textContent = `${customers.length} cliente${customers.length === 1 ? '' : 's'}`;
    }

    if (query) {
      customers = customers.filter(c => {
        const nome = (c.nome || '').toLowerCase();
        const doc = (c.cpf_cnpj || '').toLowerCase();
        const tel = (c.telefone || c.whatsapp || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const cidade = (c.cidade || '').toLowerCase();
        return nome.includes(query) || doc.includes(query) || tel.includes(query) || email.includes(query) || cidade.includes(query);
      });
    }

    if (customers.length === 0) {
      const msg = query
        ? `Nenhum cliente encontrado para a busca "${query}".`
        : 'Nenhum cliente cadastrado ainda. Clique em "➕ Novo Cliente" acima para cadastrar.';
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 28px; color: var(--text-muted);">${UI.escapeHTML(msg)}</td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => {
      const rawTel = (c.telefone || c.whatsapp || '').replace(/\D/g, '');
      const whatsBtn = rawTel
        ? `<a href="https://wa.me/55${rawTel}" target="_blank" class="btn btn-secondary btn-sm" title="Abrir WhatsApp" style="padding: 4px 8px; font-size: 0.78rem;">💬 Whats</a>`
        : '';

      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--gold-light); font-size: 0.95rem;">${UI.escapeHTML(c.nome)}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${UI.escapeHTML(c.endereco || 'Endereço não informado')}</div>
          </td>
          <td><span style="font-family: monospace; font-size: 0.85rem;">${UI.escapeHTML(c.cpf_cnpj || '-')}</span></td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span>${UI.escapeHTML(c.telefone || c.whatsapp || '-')}</span>
              ${whatsBtn}
            </div>
          </td>
          <td><span style="font-size: 0.85rem;">${UI.escapeHTML(c.email || '-')}</span></td>
          <td><span>${UI.escapeHTML(c.cidade || 'Umbaúba')} - ${UI.escapeHTML(c.estado || 'SE')}</span></td>
          <td><span class="gold-badge" style="font-size: 0.78rem;">${c.total_notas || 0} notas</span></td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button onclick="openCreateNoteForCustomer(${c.id})" class="btn btn-primary btn-sm" title="Emitir Nova Nota para este cliente" style="padding: 4px 10px; font-size: 0.8rem;">
                🧾 Emitir Nota
              </button>
              <button onclick="deleteCustomerConfirm(${c.id}, ${UI.escapeHTML(JSON.stringify(c.nome || ''))})" class="btn btn-danger btn-sm" title="Excluir cliente" style="padding: 4px 8px; font-size: 0.8rem;">
                ✕
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center; padding: 20px;">Erro ao carregar clientes: ${err.message}</td></tr>`;
  }
}
window.loadAdminCustomersList = loadAdminCustomersList;

async function openCreateNoteForCustomer(customerId) {
  await openCreateNoteModal();
  const custSelect = document.getElementById('create-note-customer-select');
  if (custSelect) {
    custSelect.value = String(customerId);
  }
}
window.openCreateNoteForCustomer = openCreateNoteForCustomer;

async function deleteCustomerConfirm(id, name) {
  if (confirm(`Atenção: Deseja realmente excluir o cliente "${name}"?`)) {
    try {
      await API.deleteCustomer(id);
      UI.showToast(`Cliente "${name}" excluído com sucesso.`, 'success');
      await loadAdminCustomersList();
    } catch (err) {
      UI.showToast(err.message || 'Erro ao excluir cliente.', 'error');
    }
  }
}
window.deleteCustomerConfirm = deleteCustomerConfirm;

async function renderAdminUsers() {
  document.getElementById('view-admin').style.display = 'block';
  showAdminSection('admin-sec-usuarios');
  document.getElementById('nav-admin-usuarios')?.classList.add('active');

  const tbody = document.getElementById('admin-users-table-body');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Carregando usuários...</td></tr>';

  try {
    const users = await API.getUsers();
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${UI.escapeHTML(u.name)}</strong></td>
        <td>${UI.escapeHTML(u.username)}</td>
        <td>${UI.escapeHTML(u.email)}</td>
        <td><span class="gold-badge">${u.role}</span></td>
        <td>${UI.formatDateTime(u.created_at)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: red;">Erro: ${err.message}</td></tr>`;
  }
}

async function renderAdminAudit() {
  document.getElementById('view-admin').style.display = 'block';
  showAdminSection('admin-sec-auditoria');
  document.getElementById('nav-admin-auditoria')?.classList.add('active');

  const tbody = document.getElementById('admin-audit-table-body');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Carregando trilha de auditoria...</td></tr>';

  try {
    const logs = await API.getAuditLogs();
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="font-family: monospace; font-size: 0.8rem;">${UI.formatDateTime(l.created_at)}</td>
        <td><strong>${UI.escapeHTML(l.user_name)}</strong> <span style="font-size: 0.72rem; color: var(--text-dim);">(${l.user_role})</span></td>
        <td><span class="gold-badge" style="font-size: 0.7rem;">${l.action}</span></td>
        <td>${l.target_type}: <strong>${l.target_id}</strong></td>
        <td>${UI.escapeHTML(l.details)}</td>
        <td style="font-family: monospace; font-size: 0.8rem;">${l.ip_address}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: red;">Erro: ${err.message}</td></tr>`;
  }
}

// -------------------------------------------------------------
// Módulo de Impressão Oficial de Nota Fiscal / Recibo QR
// -------------------------------------------------------------
window.printDoc = async function(publicId, publicCertificate = false) {
  try {
    // Fecha qualquer modal que esteja aberto para não sobrepor a impressão
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';

    const note = publicCertificate
      ? await API.validateNote(publicId)
      : await API.getNoteDetail(publicId);
    const customerAddress = [
      note.cliente_endereco,
      [note.cliente_cidade, note.cliente_estado].filter(Boolean).join('/'),
      note.cliente_cep ? `CEP: ${note.cliente_cep}` : ''
    ].filter(Boolean).join(' - ');
    let printArea = document.getElementById('print-area-container');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'print-area-container';
      printArea.className = 'print-area';
      document.body.appendChild(printArea);
    }

    const itemsRows = (note.itens || []).map(it => `
      <tr>
        <td>${UI.escapeHTML(it.descricao)}</td>
        <td style="text-align: center;">${it.quantidade}</td>
        ${note.valor_total ? `<td style="text-align: right;">${UI.formatBRL(it.valor_unitario)}</td><td style="text-align: right; font-weight: bold;">${UI.formatBRL(it.valor_total)}</td>` : ''}
      </tr>
    `).join('');

    printArea.innerHTML = `
      <div class="print-document">
        <div class="print-doc-header">
          <img src="${currentCompany?.logo_url || '/assets/images/fraga-logo.png'}" class="print-doc-logo" alt="Logo Fraga Sucatas" />
          <div class="print-doc-company-info">
            <h2>FRAGA SUCATAS LTDA</h2>
            <p><strong>CNPJ:</strong> 10.792.217/0001-35</p>
            <p><strong>Endereço:</strong> ${currentCompany?.address || 'Rodovia BR-101, Km 182, Zona Industrial'} - Umbaúba/SE</p>
            <p><strong>WhatsApp:</strong> (79) 99637-6501 | <strong>Instagram:</strong> @fragasucatas</p>
            <p><strong>Segmento:</strong> Desmanche Legalizado & Peças de Motocicletas (DETRAN/SE)</p>
          </div>
        </div>

        <div class="print-doc-title-bar">
          <h3>COMPROVANTE DE COMPRA E AUTENTICIDADE</h3>
          <span>${note.numero_nota}</span>
        </div>

        <div class="print-grid-info">
          <div class="print-info-block">
            <h4>DADOS DA TRANSAÇÃO</h4>
            <p><strong>Número da Nota:</strong> ${note.numero_nota}</p>
            <p><strong>Data da Compra:</strong> ${note.data_compra}</p>
            <p><strong>Cliente:</strong> <span data-print-customer="name"></span></p>
            ${publicCertificate ? '' : `
              <p><strong>CPF/CNPJ:</strong> <span data-print-customer="document"></span></p>
              <p><strong>Endereço:</strong> <span data-print-customer="address"></span></p>
            `}
            <p><strong>Status Atual:</strong> <strong style="color: ${note.status === 'VALIDA' ? '#059669' : '#dc2626'};">${note.status}</strong></p>
            <p><strong>Descrição:</strong> ${UI.escapeHTML(note.descricao || '-')}</p>
          </div>

          <div class="print-qr-center">
            <div id="print-qr-target" class="print-qr-canvas"></div>
            <div class="print-qr-desc">ESCANEE PARA VALIDAR</div>
            <div style="font-size: 0.65rem; color: #64748b; margin-top: 4px; font-family: monospace;">${note.public_id.substring(0, 18)}...</div>
          </div>
        </div>

        <table class="print-items-table">
          <thead>
            <tr>
              <th>Peça / Produto</th>
              <th style="text-align: center;">Qtd</th>
              ${note.valor_total ? '<th style="text-align: right;">Valor Unit.</th><th style="text-align: right;">Total</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
            ${note.valor_total ? `
              <tr class="print-total-row">
                <td colspan="3" style="text-align: right;">VALOR TOTAL DA COMPRA:</td>
                <td style="text-align: right;">${UI.formatBRL(note.valor_total)}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>

        ${note.observacoes ? `
          <div class="print-custom-obs">
            <strong>Observações do Pedido:</strong> ${UI.escapeHTML(note.observacoes)}
          </div>
        ` : ''}

        <!-- OBSERVAÇÃO LEGAL OBRIGATÓRIA DESTACADA -->
        <div class="print-legal-obs" style="display: block !important; margin: 10px 0 !important; padding: 10px 14px !important; background: #f8fafc !important; border: 1.5px solid #000000 !important; border-left: 6px solid #000000 !important; border-radius: 4px !important; font-size: 0.76rem !important; line-height: 1.4 !important; color: #000000 !important; text-align: justify !important; box-sizing: border-box !important;">
          <strong style="color: #000000 !important; font-weight: 800 !important; text-transform: uppercase !important;">Obs:</strong> Os veículos leiloados na condição de SUCATAS APROVEITÁVEIS, sendo classificadas como sucatas aproveitáveis e sucatas aproveitáveis com motor inservível, baixados no Registro Nacional de Veículos Automotores (RENAVAM), não podem ser registrados ou licenciados e absolutamente proibida a sua circulação em via pública, destinando-se exclusivamente para DESMONTE e REAPROVEITAMENTO comercial de suas peças e partes metálicas.
        </div>

        <div class="print-doc-footer">
          <div class="print-seal">
            <span>🛡️</span>
            <span>AUTENTICIDADE VERIFICADA VIA QR CODE EM TEMPO REAL</span>
          </div>
          <div>Emitido em: ${new Date().toLocaleString('pt-BR')}</div>
        </div>
      </div>
    `;

    printArea.querySelector('[data-print-customer="name"]').textContent =
      (publicCertificate ? note.cliente_mascarado : note.cliente_nome) || 'Consumidor Final';
    if (!publicCertificate) {
      printArea.querySelector('[data-print-customer="document"]').textContent = note.cliente_doc || 'Não informado';
      printArea.querySelector('[data-print-customer="address"]').textContent = customerAddress || 'Não informado';
    }

    // Renderiza o QR Code e abre janela de impressão
    setTimeout(() => {
      const qrEl = document.getElementById('print-qr-target');
      if (qrEl) QR.render(qrEl, note.public_id, 95);
      setTimeout(() => {
        window.print();
      }, 250);
    }, 80);

  } catch (err) {
    UI.showToast(`Erro ao preparar impressão: ${err.message}`, 'error');
  }
};

// -------------------------------------------------------------
// Inicialização de Formulários e Event Listeners Globais
// -------------------------------------------------------------
function initGlobalEventListeners() {
  document.getElementById('form-password')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector('button[type="submit"]');
    try {
      if (form.elements.password.value !== form.elements.confirm_password.value) throw new Error('As senhas não coincidem.');
      button.disabled = true;
      await API.changePassword(form.elements.current_password.value, form.elements.password.value);
      form.reset();
      UI.closeModal('modal-password');
      UI.showToast('Senha alterada. Use a nova senha nos outros aparelhos.', 'success');
    } catch (err) { UI.showToast(err.message, 'error'); }
    finally { button.disabled = false; }
  });
  document.getElementById('btn-import-browser')?.addEventListener('click', async () => {
    try {
      const data = API.getBrowserData();
      if (!data.notes.length && !data.customers.length) {
        UI.showToast('Não há cadastros antigos neste navegador.', 'info');
        return;
      }
      if (!confirm(`Importar ${data.notes.length} notas e ${data.customers.length} clientes deste aparelho? Cadastros existentes serão preservados. Números de nota repetidos serão renumerados, mantendo os códigos QR.`)) return;
      const result = await API.importBrowserData(data);
      UI.showToast(`${result.notes} notas e ${result.customers} clientes importados. ${result.renumbered} notas renumeradas.`, 'success', 8000);
      await loadAdminNotesList();
    } catch (err) {
      UI.showToast(err.message, 'error', 8000);
    }
  });
  // Tabs do Validador de Notas
  document.querySelectorAll('.validator-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.validator-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.validator-tab-pane').forEach(p => p.style.display = 'none');
      btn.classList.add('active');

      const targetPane = document.getElementById(btn.getAttribute('data-target'));
      if (targetPane) targetPane.style.display = 'block';

      if (btn.getAttribute('data-target') === 'tab-camera') {
        initCameraScanner();
      } else if (appScanner) {
        appScanner.stop();
      }
    });
  });

  // Busca Manual de Nota
  document.getElementById('btn-manual-validate')?.addEventListener('click', () => {
    const val = document.getElementById('manual-note-code')?.value;
    if (val) executeValidation(val);
  });

  document.getElementById('manual-note-code')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const val = e.target.value;
      if (val) executeValidation(val);
    }
  });

  // Upload de Imagem de QR Code
  document.getElementById('qr-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!appScanner) {
      appScanner = new QRScanner(null, null, (code) => {
        window.location.hash = `#/validar-nota/${encodeURIComponent(code)}`;
      });
    }

    try {
      UI.showToast('Lendo imagem do QR Code...', 'info');
      await appScanner.scanFile(file);
    } catch (err) {
      UI.showToast(err.message, 'error', 5000);
    }
  });

  // Login Form
  document.getElementById('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = e.target.elements['username'].value;
    const p = e.target.elements['password'].value;

    try {
      const res = await API.login(u, p);
      UI.showToast(`Bem-vindo, ${res.user.name}!`, 'success');
      if (res.user.role === 'ADMIN') {
        window.location.hash = '#/admin';
      } else {
        window.location.hash = '#/cliente';
      }
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  });

  // Cadastro de Cliente Form
  document.getElementById('form-register')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: e.target.elements['name'].value,
      username: e.target.elements['username'].value,
      email: e.target.elements['email'].value,
      password: e.target.elements['password'].value,
      cpf_cnpj: e.target.elements['cpf_cnpj'].value,
      telefone: e.target.elements['telefone'].value
    };

    try {
      const res = await API.register(data);
      if (res.confirmationRequired) {
        UI.showToast('Confira seu e-mail para confirmar o cadastro e depois faça login.', 'success', 8000);
        window.location.hash = '#/login';
        return;
      }
      UI.showToast(`Cadastro realizado com sucesso! Bem-vindo, ${res.user.name}.`, 'success');
      window.location.hash = '#/cliente';
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  });

  // Salvar Configurações da Empresa
  document.getElementById('admin-company-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      company_name: form.elements['company_name'].value,
      trade_name: form.elements['trade_name'].value,
      cnpj: form.elements['cnpj'].value,
      address: form.elements['address'].value,
      city: form.elements['city'].value,
      state: form.elements['state'].value,
      cep: form.elements['cep'].value,
      phone: form.elements['phone'].value,
      whatsapp: form.elements['whatsapp'].value,
      instagram: form.elements['instagram'].value,
      facebook: form.elements['facebook'].value,
      website: form.elements['website'].value,
      business_hours: form.elements['business_hours'].value,
      description: form.elements['description'].value
    };

    try {
      await API.updateCompany(data);
      await loadCompanyData();
      UI.showToast('Configurações da empresa salvas e atualizadas no site!', 'success');
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  });

  // Botão Buscar Informações Online
  document.getElementById('btn-search-online-company')?.addEventListener('click', handleSearchOnlineCompany);
  document.getElementById('btn-apply-online-data')?.addEventListener('click', applyOnlineDataToForm);

  // Upload do Logo Oficial no Painel
  document.getElementById('admin-logo-upload-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      UI.showToast('Enviando novo logo oficial...', 'info');
      const b64 = await UI.fileToBase64(file);
      const res = await API.uploadFile(b64, file.name);
      
      // Atualiza na empresa
      await API.updateCompany({ logo_url: res.url });
      await loadCompanyData();
      UI.showToast('Logo oficial atualizado com sucesso em todo o sistema!', 'success');
    } catch (err) {
      UI.showToast(`Falha no upload do logo: ${err.message}`, 'error');
    }
  });

  // Filtros da Tabela de Notas Admin
  document.getElementById('admin-notes-search')?.addEventListener('input', () => {
    loadAdminNotesList();
  });
  document.getElementById('admin-notes-filter-status')?.addEventListener('change', () => {
    loadAdminNotesList();
  });

  // Filtro de Busca de Clientes Admin
  document.getElementById('admin-customers-search')?.addEventListener('input', () => {
    loadAdminCustomersList();
  });

  // Formulário de Criação de Nota (com Itens Dinâmicos)
  document.getElementById('btn-add-note-item-row')?.addEventListener('click', addNoteItemRow);
  document.getElementById('form-create-note')?.addEventListener('submit', handleCreateNoteSubmit);

  // Modal Novo Item Portfólio
  document.getElementById('form-create-portfolio')?.addEventListener('submit', handleCreatePortfolioSubmit);

  // Modal Novo Cliente
  document.getElementById('form-create-customer')?.addEventListener('submit', handleCreateCustomerSubmit);

  // Modal Novo Usuário
  document.getElementById('form-create-user')?.addEventListener('submit', handleCreateUserSubmit);
}

// Itens Dinâmicos na Criação de Nota
function addNoteItemRow() {
  const container = document.getElementById('note-items-dynamic-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'form-grid-3 note-item-row';
  row.style.marginBottom = '10px';
  row.innerHTML = `
    <input type="text" class="form-control item-desc" placeholder="Descrição da peça ou lote" required />
    <input type="number" class="form-control item-qty" value="1" min="1" step="1" placeholder="Qtd" oninput="calculateNoteTotal()" required />
    <div style="display: flex; gap: 6px;">
      <input type="number" class="form-control item-unit" value="0.00" min="0" step="0.01" placeholder="R$ Unit" oninput="calculateNoteTotal()" required />
      <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.note-item-row').remove(); calculateNoteTotal();">✕</button>
    </div>
  `;
  container.appendChild(row);
  calculateNoteTotal();
}

window.calculateNoteTotal = function() {
  const rows = document.querySelectorAll('.note-item-row');
  let total = 0;
  rows.forEach(r => {
    const qty = parseFloat(r.querySelector('.item-qty')?.value) || 0;
    const unit = parseFloat(r.querySelector('.item-unit')?.value) || 0;
    total += (qty * unit);
  });
  const totalSlot = document.getElementById('create-note-total-preview');
  if (totalSlot) totalSlot.textContent = UI.formatBRL(total);
};

async function handleCreateNoteSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const customerId = form.elements['customer_id'].value;
  const dataCompra = form.elements['data_compra'].value;
  const descricao = form.elements['descricao'].value;
  const observacoes = form.elements['observacoes'].value;
  const publicVisibleValue = form.elements['public_visible_value'].checked;

  const rows = document.querySelectorAll('.note-item-row');
  const items = [];
  rows.forEach(r => {
    const desc = r.querySelector('.item-desc')?.value;
    const qty = parseFloat(r.querySelector('.item-qty')?.value) || 1;
    const unit = parseFloat(r.querySelector('.item-unit')?.value) || 0;
    if (desc) {
      items.push({ descricao: desc, quantidade: qty, valor_unitario: unit });
    }
  });

  if (items.length === 0) {
    UI.showToast('Adicione pelo menos 1 item à nota.', 'warning');
    return;
  }

  try {
    const res = await API.createNote({
      customer_id: customerId,
      data_compra: dataCompra,
      descricao: descricao,
      observacoes: observacoes,
      public_visible_value: publicVisibleValue,
      itens: items
    });

    UI.closeModal('modal-create-note');
    UI.showToast(res.message, 'success');
    form.reset();
    await loadAdminNotesList();
    // Abre detalhes da nota criada com o QR Code
    openNoteDetailModal(res.id);
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

async function openCreateNoteModal() {
  UI.openModal('modal-create-note');
  const custSelect = document.getElementById('create-note-customer-select');
  if (custSelect) {
    custSelect.innerHTML = '<option value="">Carregando clientes...</option>';
    try {
      const custs = await API.getCustomers();
      custSelect.innerHTML = custs.map(c => `
        <option value="${c.id}">${UI.escapeHTML(c.nome)} (${UI.escapeHTML(c.cpf_cnpj || 'Sem CPF/CNPJ')})</option>
      `).join('');
    } catch {
      custSelect.innerHTML = '<option value="">Erro ao carregar clientes</option>';
    }
  }

  // Preenche data atual
  const dateInput = document.getElementById('create-note-date');
  if (dateInput) {
    const today = new Date();
    const dd = String(today.getDate()).zfill(2);
    const mm = String(today.getMonth() + 1).zfill(2);
    const yyyy = today.getFullYear();
    dateInput.value = `${dd}/${mm}/${yyyy}`;
  }

  const itemsContainer = document.getElementById('note-items-dynamic-container');
  if (itemsContainer) {
    itemsContainer.innerHTML = '';
    addNoteItemRow();
  }
}
window.openCreateNoteModal = openCreateNoteModal;

async function handleCreatePortfolioSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  const title = (form.elements['title']?.value || '').trim();
  if (!title) {
    UI.showToast('Por favor, informe o título do item.', 'error');
    return;
  }

  const data = {
    title: title,
    category: form.elements['category']?.value || 'Peças',
    description: (form.elements['description']?.value || '').trim(),
    image_url: form.elements['image_url']?.value || '/assets/images/part_motor.jpg',
    display_order: parseInt(form.elements['display_order']?.value || 0),
    published: form.elements['published'] ? form.elements['published'].checked : true
  };

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Salvando...';
    }
    await API.createPortfolioItem(data);
    UI.closeModal('modal-create-portfolio');
    UI.showToast('Item adicionado ao portfólio!', 'success');
    form.reset();
    await renderAdminPortfolio();
  } catch (err) {
    UI.showToast(err.message || 'Erro ao adicionar item', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Salvar Item';
    }
  }
}

async function handleCreateCustomerSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  const nome = (form.elements['nome']?.value || '').trim();
  if (!nome) {
    UI.showToast('Por favor, informe o Nome do cliente.', 'error');
    return;
  }

  const telefone = (form.elements['telefone']?.value || '').trim();
  const whatsapp = (form.elements['whatsapp']?.value || telefone).trim();

  const data = {
    nome: nome,
    cpf_cnpj: (form.elements['cpf_cnpj']?.value || '').trim(),
    telefone: telefone,
    whatsapp: whatsapp,
    email: (form.elements['email']?.value || '').trim(),
    endereco: (form.elements['endereco']?.value || '').trim(),
    cidade: (form.elements['cidade']?.value || 'Umbaúba').trim(),
    estado: (form.elements['estado']?.value || 'SE').trim(),
    cep: (form.elements['cep']?.value || '').trim()
  };

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Salvando...';
    }

    await API.createCustomer(data);
    UI.closeModal('modal-create-customer');
    UI.showToast('Cliente cadastrado com sucesso!', 'success');
    form.reset();

    // Atualiza tabela de clientes no admin se a seção estiver aberta
    await renderAdminCustomers();

    // Atualiza também dinamicamente o dropdown de clientes na criação de notas se existir
    const custSelect = document.getElementById('create-note-customer-select');
    if (custSelect) {
      try {
        const custs = await API.getCustomers();
        custSelect.innerHTML = custs.map(c => `
          <option value="${c.id}">${UI.escapeHTML(c.nome)} (${UI.escapeHTML(c.cpf_cnpj || 'Sem CPF/CNPJ')})</option>
        `).join('');
      } catch (e) {
        console.warn('Erro ao atualizar dropdown de clientes:', e);
      }
    }
  } catch (err) {
    UI.showToast(err.message || 'Erro ao cadastrar cliente', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Salvar Cliente';
    }
  }
}

async function handleCreateUserSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  const name = (form.elements['name']?.value || '').trim();
  const username = (form.elements['username']?.value || '').trim();
  const email = (form.elements['email']?.value || '').trim();
  const password = form.elements['password']?.value || '';
  const role = form.elements['role']?.value || 'CLIENTE';

  if (!name || !username || !email || !password) {
    UI.showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
    return;
  }

  const data = { name, username, email, password, role };

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Salvando...';
    }

    await API.createUser(data);
    UI.closeModal('modal-create-user');
    UI.showToast('Usuário cadastrado com sucesso!', 'success');
    form.reset();
    await renderAdminUsers();
  } catch (err) {
    UI.showToast(err.message || 'Erro ao cadastrar usuário', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Salvar Usuário';
    }
  }
}

// Utility string zfill
String.prototype.zfill = function(size) {
  let s = this;
  while (s.length < (size || 2)) { s = "0" + s; }
  return s;
};
