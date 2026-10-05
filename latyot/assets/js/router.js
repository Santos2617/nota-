/**
 * FRAGA SUCATAS LTDA — Roteador SPA com Proteção de Rotas
 */

class Router {
  constructor(routes, defaultRoute = '#/') {
    this.routes = routes;
    this.defaultRoute = defaultRoute;
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  navigate(hash) {
    window.location.hash = hash;
  }

  getRouteInfo() {
    let hash = window.location.hash || this.defaultRoute;
    if (hash.startsWith('#validar-nota/')) hash = '#/' + hash.slice(1);
    if (!hash.startsWith('#/')) hash = '#/';
    
    // Suporte a parâmetros dinâmicos: #/validar-nota/:id
    const parts = hash.slice(2).split('/');
    const mainSection = parts[0] || '';
    const param = parts[1] || '';
    const sub = parts[2] || '';

    return { hash, mainSection, param, sub, parts };
  }

  async handleRoute() {
    const { hash, mainSection, param, sub } = this.getRouteInfo();
    const user = API.getCurrentUser();

    // Guardas de autenticação
    if (hash.startsWith('#/admin')) {
      if (!user || user.role !== 'ADMIN') {
        UI.showToast('Acesso restrito a administradores. Faça login para continuar.', 'warning');
        this.navigate('#/login');
        return;
      }
    } else if (hash.startsWith('#/cliente')) {
      if (!user) {
        UI.showToast('Por favor, acesse sua conta para ver suas compras.', 'warning');
        this.navigate('#/login');
        return;
      }
    }

    // Oculta todas as telas
    document.querySelectorAll('.app-view').forEach(el => el.style.display = 'none');

    // Executa rota correspondente
    if (this.routes[hash]) {
      this.routes[hash]();
    } else if (hash.startsWith('#/validar-nota/')) {
      // Rota dinâmica de validação com ID
      if (this.routes['#/validar-nota/:id']) {
        this.routes['#/validar-nota/:id'](param);
      }
    } else if (hash.startsWith('#/admin/')) {
      // Subrotas admin
      const adminSub = `#/admin/${param}`;
      if (this.routes[adminSub]) {
        this.routes[adminSub]();
      } else if (this.routes['#/admin']) {
        this.routes['#/admin']();
      }
    } else if (this.routes[this.defaultRoute]) {
      this.routes[this.defaultRoute]();
    }

    this.updateActiveNav(hash);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateActiveNav(hash) {
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href === hash || (hash.startsWith(href) && href !== '#/')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Atualiza botão de login/área de usuário no topo
    const user = API.getCurrentUser();
    const userSlot = document.getElementById('nav-user-slot');
    if (userSlot) {
      if (user) {
        const dest = user.role === 'ADMIN' ? '#/admin' : '#/cliente';
        const roleLabel = user.role === 'ADMIN' ? 'Painel Admin' : 'Minhas Compras';
        userSlot.innerHTML = `
          <a href="${dest}" class="btn btn-primary btn-sm">
            <span>👤</span> ${UI.escapeHTML(user.name.split(' ')[0])} (${roleLabel})
          </a>
          <button id="btn-global-logout" class="btn btn-secondary btn-sm" title="Sair da Conta">
            Sair
          </button>
          <button id="btn-change-password" class="btn btn-secondary btn-sm">Alterar senha</button>
        `;
        document.getElementById('btn-global-logout')?.addEventListener('click', async () => {
          await API.logout();
          UI.showToast('Você saiu do sistema.', 'info');
          window.location.hash = '#/';
          window.location.reload();
        });
        document.getElementById('btn-change-password')?.addEventListener('click', () => UI.openModal('modal-password'));
      } else {
        userSlot.innerHTML = `
          <a href="#/login" class="btn btn-primary btn-sm">
            <span>🔐</span> Entrar
          </a>
        `;
      }
    }
  }
}

window.Router = Router;
