export function baseEmailTemplate(content: string, logoUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Capital de Prêmios</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background-color: #1a2f47;
      font-family: 'Inter', Arial, sans-serif;
      padding: 40px 16px;
      min-height: 100vh;
    }
    .wrapper { max-width: 540px; margin: 0 auto; }
    .brand-bar { text-align: center; margin-bottom: 24px; }
    .brand-bar img { max-width: 220px; height: auto; }
    .card { background: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 32px 64px rgba(0,0,0,0.4); }
    .card-header {
      background: linear-gradient(135deg, #1a3a5c 0%, #295280 50%, #2d5c8f 100%);
      padding: 40px 32px 32px;
      position: relative;
      overflow: hidden;
    }
    .card-header::before {
      content: '';
      position: absolute;
      top: -60px; right: -60px;
      width: 200px; height: 200px;
      border-radius: 50%;
      background: rgba(255,255,255,0.05);
    }
    .card-header::after {
      content: '';
      position: absolute;
      bottom: -40px; left: -40px;
      width: 140px; height: 140px;
      border-radius: 50%;
      background: rgba(255,255,255,0.04);
    }
    .icon-badge {
      width: 64px; height: 64px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 20px;
      position: relative; z-index: 1;
    }
    .icon-badge svg { width: 32px; height: 32px; }
    .header-title {
      font-size: 32px; font-weight: 900;
      color: #FFFFFF; line-height: 1.1;
      position: relative; z-index: 1;
      letter-spacing: -0.5px;
    }
    .header-subtitle {
      margin-top: 8px; font-size: 14px;
      color: #a8c4e0; font-weight: 500;
      position: relative; z-index: 1;
    }
    .divider-strip {
      height: 6px;
      background: linear-gradient(90deg, #295280 0%, #436F3A 50%, #295280 100%);
    }
    .card-body { padding: 32px; }
    .greeting {
      font-size: 15px; color: #374151;
      line-height: 1.6; margin-bottom: 28px;
      border-left: 3px solid #436F3A;
      padding-left: 14px;
    }
    .greeting strong { color: #111827; }
    .data-grid {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      padding: 24px; margin-bottom: 28px;
    }
    .data-grid-title {
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #94A3B8; margin-bottom: 16px;
    }
    .data-row {
      display: flex; align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #E2E8F0;
    }
    .data-row:last-child { border-bottom: none; padding-bottom: 0; }
    .data-row:first-of-type { padding-top: 0; }
    .data-label {
      font-size: 13px; color: #64748B;
      font-weight: 500;
      display: flex; align-items: center; gap: 8px;
    }
    .data-label .icon {
      width: 28px; height: 28px;
      border-radius: 8px;
      background: #E2E8F0;
      display: flex; align-items: center;
      justify-content: center;
      font-size: 14px; flex-shrink: 0;
    }
    .data-value { font-size: 13px; font-weight: 700; color: #1E293B; text-align: right; }
    .data-value.highlight { font-size: 16px; color: #436F3A; }
    .status-badge {
      display: inline-flex; align-items: center; gap: 5px;
      background: #eaf2e8; color: #2a4a24;
      font-size: 12px; font-weight: 700;
      padding: 4px 10px; border-radius: 100px;
      border: 1px solid #b5d4ae;
    }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #436F3A; }
    .cta-section { text-align: center; margin-bottom: 28px; }
    .cta-label { font-size: 13px; color: #64748B; margin-bottom: 14px; font-weight: 500; }
    .cta-btn {
      display: inline-block;
      background: linear-gradient(135deg, #295280, #436F3A);
      color: #FFFFFF !important;
      font-size: 15px; font-weight: 800;
      text-decoration: none;
      padding: 16px 40px; border-radius: 12px;
      letter-spacing: 0.04em; text-transform: uppercase;
      box-shadow: 0 8px 24px rgba(41,82,128,0.35);
    }
    .info-box {
      border-radius: 12px; padding: 16px 20px;
      display: flex; align-items: flex-start; gap: 12px;
      margin-bottom: 28px;
    }
    .info-box.warning { background: linear-gradient(135deg, #FFFBEB, #FEF3C7); border: 1px solid #FDE68A; }
    .info-box.info { background: linear-gradient(135deg, #EFF6FF, #DBEAFE); border: 1px solid #93C5FD; }
    .info-box .emoji { font-size: 24px; flex-shrink: 0; }
    .info-text { font-size: 13px; font-weight: 600; line-height: 1.4; }
    .info-box.warning .info-text { color: #92400E; }
    .info-box.info .info-text { color: #1E40AF; }
    .divider-section { border-top: 1px solid #E2E8F0; margin: 24px 0; }
    .code-block {
      background: #F1F5F9; border: 2px dashed #CBD5E1;
      border-radius: 12px; padding: 20px;
      text-align: center; margin-bottom: 28px;
    }
    .code-label { font-size: 12px; color: #64748B; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.05em; text-transform: uppercase; }
    .code-value { font-size: 36px; font-weight: 900; color: #1E293B; letter-spacing: 8px; }
    .code-expiry { font-size: 12px; color: #94A3B8; margin-top: 8px; }
    .card-footer {
      background: #F8FAFC; border-top: 1px solid #E2E8F0;
      padding: 20px 32px; text-align: center;
    }
    .footer-text { font-size: 12px; color: #94A3B8; line-height: 1.7; }
    .footer-text a { color: #295280; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="brand-bar">
      <img src="${logoUrl}" alt="Capital de Prêmios" />
    </div>
    <div class="card">
      ${content}
    </div>
  </div>
</body>
</html>`;
}
