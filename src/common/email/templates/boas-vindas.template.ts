import { baseEmailTemplate } from './base.template';

export interface BoasVindasParams {
  nomeCliente: string;
  linkAcessar: string;
  logoUrl: string;
}

export function boasVindasTemplate(p: BoasVindasParams): string {
  const content = `
    <div class="card-header">
      <div class="icon-badge" style="background:#295280;box-shadow:0 0 0 8px rgba(41,82,128,0.25),0 0 0 16px rgba(41,82,128,0.1);">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div class="header-title">Bem-vindo(a)!</div>
      <div class="header-subtitle">Sua conta foi criada com sucesso</div>
    </div>

    <div class="divider-strip"></div>

    <div class="card-body">
      <p class="greeting">
        Ol&#225;, <strong>${p.nomeCliente}</strong>! Ficamos muito felizes em ter voc&#234; na Capital de Pr&#234;mios. Sua conta j&#225; est&#225; ativa e pronta para usar.
      </p>

      <div class="data-grid">
        <div class="data-grid-title">Pr&#243;ximos passos</div>

        <div class="data-row">
          <div class="data-label"><div class="icon">1&#65039;&#8419;</div> Acesse a plataforma</div>
          <div class="data-value" style="color:#436F3A;">Feito!</div>
        </div>

        <div class="data-row">
          <div class="data-label"><div class="icon">2&#65039;&#8419;</div> Escolha uma edi&#231;&#227;o</div>
          <div class="data-value" style="color:#64748B;">Pendente</div>
        </div>

        <div class="data-row">
          <div class="data-label"><div class="icon">3&#65039;&#8419;</div> Compre seus n&#250;meros</div>
          <div class="data-value" style="color:#64748B;">Pendente</div>
        </div>

        <div class="data-row">
          <div class="data-label"><div class="icon">4&#65039;&#8419;</div> Torce e ganha!</div>
          <div class="data-value" style="color:#64748B;">Em breve</div>
        </div>
      </div>

      <div class="cta-section">
        <p class="cta-label">Acesse agora e participe dos sorteios</p>
        <a href="${p.linkAcessar}" class="cta-btn">Acessar Plataforma &#127919;</a>
      </div>

      <div class="info-box info">
        <span class="emoji">&#128276;</span>
        <div class="info-text">Fique de olho nos pr&#243;ximos sorteios e n&#227;o perca a chance de ganhar premi&#234;s incr&#237;veis!</div>
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
