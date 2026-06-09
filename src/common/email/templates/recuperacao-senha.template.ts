export interface RecuperacaoSenhaParams {
  nomeUsuario: string;
  novaSenha: string;
  logoUrl: string;
}

export function recuperacaoSenhaTemplate(p: RecuperacaoSenhaParams): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Nova Senha</title>
</head>
<body style="margin:0;padding:0;background-color:#1a2f47;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a2f47;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Logo -->
      ${p.logoUrl ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td align="center"><img src="${p.logoUrl}" alt="Capital de Pr&ecirc;mios" width="200" style="display:block;max-width:200px;height:auto;" /></td></tr></table>` : ''}

      <!-- Card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;margin:0 auto;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 32px 64px rgba(0,0,0,0.4);">

        <!-- Header -->
        <tr>
          <td style="background-color:#1e4470;background:linear-gradient(135deg,#1a3a5c 0%,#295280 50%,#2d5c8f 100%);padding:36px 32px 28px;border-radius:20px 20px 0 0;">

            <!-- Lock badge -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
              <tr>
                <td align="center" valign="middle"
                    style="width:64px;height:64px;background-color:#92400E;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;color:#ffffff;line-height:64px;padding:0;">
                  &#128274;
                </td>
              </tr>
            </table>

            <div style="font-size:30px;font-weight:900;color:#ffffff;line-height:1.1;letter-spacing:-0.5px;margin-bottom:8px;">
              Nova Senha
            </div>
            <div style="font-size:14px;color:#a8c4e0;font-weight:500;">
              Sua senha foi redefinida pelo administrador
            </div>

          </td>
        </tr>

        <!-- Divider strip -->
        <tr>
          <td height="6" style="background-color:#92400E;background:linear-gradient(90deg,#295280,#92400E,#295280);font-size:1px;line-height:1px;">&nbsp;</td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 32px;background-color:#ffffff;">

            <!-- Greeting -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td style="border-left:3px solid #92400E;padding:4px 0 4px 14px;font-size:15px;color:#374151;line-height:1.6;">
                  Ol&aacute;, <strong style="color:#111827;">${p.nomeUsuario}</strong>! Uma nova senha tempor&aacute;ria foi gerada para o seu acesso ao painel administrativo.
                </td>
              </tr>
            </table>

            <!-- Password block -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;border:2px dashed #CBD5E1;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td align="center" style="padding:24px 20px 8px;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748B;margin-bottom:12px;">
                    SUA SENHA TEMPOR&Aacute;RIA
                  </div>
                  <div style="font-size:32px;font-weight:900;color:#1E293B;letter-spacing:6px;">
                    ${p.novaSenha}
                  </div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:8px 20px 20px;font-size:12px;color:#94A3B8;">
                  Recomendamos alterar a senha ap&oacute;s o primeiro acesso.
                </td>
              </tr>
            </table>

            <!-- Instructions grid -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px;">

              <tr>
                <td colspan="2" style="padding:16px 20px 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94A3B8;">
                  INSTRU&Ccedil;&Otilde;ES
                </td>
              </tr>

              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  1&#65039;&#8419;&nbsp;&nbsp;Acesse o painel
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#295280;">
                  Painel Admin
                </td>
              </tr>

              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  2&#65039;&#8419;&nbsp;&nbsp;Use o email + senha acima
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#295280;">
                  Login
                </td>
              </tr>

              <tr>
                <td style="padding:11px 20px 18px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  3&#65039;&#8419;&nbsp;&nbsp;Redefina sua senha
                </td>
                <td align="right" style="padding:11px 20px 18px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#295280;">
                  Configura&ccedil;&otilde;es
                </td>
              </tr>

            </table>

            <!-- Warning box -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;">
              <tr>
                <td width="48" valign="top" style="padding:14px 0 14px 16px;font-size:22px;vertical-align:top;line-height:1;">
                  &#9888;&#65039;
                </td>
                <td style="padding:14px 16px 14px 6px;font-size:13px;font-weight:600;color:#92400E;line-height:1.5;vertical-align:middle;">
                  N&atilde;o compartilhe esta senha com ningu&eacute;m. Se voc&ecirc; n&atilde;o solicitou a redefini&ccedil;&atilde;o, entre em contato com o suporte imediatamente.
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#F8FAFC;border-top:1px solid #E2E8F0;padding:18px 32px;text-align:center;font-size:12px;color:#94A3B8;line-height:1.7;border-radius:0 0 20px 20px;">
            &copy; ${year} Capital de Pr&ecirc;mios &mdash; Todos os direitos reservados.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}
