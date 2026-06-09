import { baseEmailTemplate } from './base.template';

export interface RecuperacaoSenhaParams {
  nomeUsuario: string;
  novaSenha: string;
  logoUrl: string;
}

export function recuperacaoSenhaTemplate(p: RecuperacaoSenhaParams): string {
  const content = `
    <div class="card-header">
      <div class="icon-badge" style="background:#92400E;box-shadow:0 0 0 8px rgba(146,64,14,0.25),0 0 0 16px rgba(146,64,14,0.1);">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div class="header-title">Nova Senha</div>
      <div class="header-subtitle">Sua senha foi redefinida pelo administrador</div>
    </div>

    <div class="divider-strip"></div>

    <div class="card-body">
      <p class="greeting">
        Ol&#225;, <strong>${p.nomeUsuario}</strong>! Uma nova senha tempor&#225;ria foi gerada para o seu acesso ao painel administrativo.
      </p>

      <div class="code-block">
        <div class="code-label">Sua senha tempor&#225;ria</div>
        <div class="code-value">${p.novaSenha}</div>
        <div class="code-expiry">Recomendamos alterar a senha ap&#243;s o primeiro acesso.</div>
      </div>

      <div class="data-grid">
        <div class="data-grid-title">Instru&#231;&#245;es</div>

        <div class="data-row">
          <div class="data-label"><div class="icon">1&#65039;&#8419;</div> Acesse o painel</div>
          <div class="data-value" style="color:#64748B;">Painel Admin</div>
        </div>

        <div class="data-row">
          <div class="data-label"><div class="icon">2&#65039;&#8419;</div> Use o email + senha acima</div>
          <div class="data-value" style="color:#64748B;">Login</div>
        </div>

        <div class="data-row">
          <div class="data-label"><div class="icon">3&#65039;&#8419;</div> Redefina sua senha</div>
          <div class="data-value" style="color:#64748B;">Configura&#231;&#245;es</div>
        </div>
      </div>

      <div class="info-box warning">
        <span class="emoji">&#9888;&#65039;</span>
        <div class="info-text">N&#227;o compartilhe esta senha com ningu&#233;m. Se voc&#234; n&#227;o solicitou a redefini&#231;&#227;o, entre em contato com o suporte imediatamente.</div>
      </div>
    </div>

    <div class="card-footer">
      <p class="footer-text">
        &copy; ${new Date().getFullYear()} Capital de Pr&#234;mios &mdash; Todos os direitos reservados.
      </p>
    </div>
  `;

  return baseEmailTemplate(content, p.logoUrl);
}
