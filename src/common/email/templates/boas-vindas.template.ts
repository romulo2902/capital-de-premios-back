export interface BoasVindasParams {
  nomeCliente: string;
  linkAcessar: string;
  logoUrl: string;
}

export function boasVindasTemplate(p: BoasVindasParams): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Bem-vindo(a)!</title>
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

            <!-- Person badge -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
              <tr>
                <td align="center" valign="middle"
                    style="width:64px;height:64px;background-color:#295280;border:3px solid rgba(255,255,255,0.3);border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;color:#ffffff;line-height:58px;padding:0;">
                  &#128100;
                </td>
              </tr>
            </table>

            <div style="font-size:30px;font-weight:900;color:#ffffff;line-height:1.1;letter-spacing:-0.5px;margin-bottom:8px;">
              Bem-vindo(a)!
            </div>
            <div style="font-size:14px;color:#a8c4e0;font-weight:500;">
              Sua conta foi criada com sucesso
            </div>

          </td>
        </tr>

        <!-- Divider strip -->
        <tr>
          <td height="6" style="background-color:#436F3A;background:linear-gradient(90deg,#295280,#436F3A,#295280);font-size:1px;line-height:1px;">&nbsp;</td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 32px;background-color:#ffffff;">

            <!-- Greeting -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td style="border-left:3px solid #295280;padding:4px 0 4px 14px;font-size:15px;color:#374151;line-height:1.6;">
                  Ol&aacute;, <strong style="color:#111827;">${p.nomeCliente}</strong>! Ficamos muito felizes em ter voc&ecirc; na Capital de Pr&ecirc;mios. Sua conta j&aacute; est&aacute; ativa e pronta para usar.
                </td>
              </tr>
            </table>

            <!-- Steps grid -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px;">

              <tr>
                <td colspan="2" style="padding:16px 20px 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94A3B8;">
                  PR&Oacute;XIMOS PASSOS
                </td>
              </tr>

              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  1&#65039;&#8419;&nbsp;&nbsp;Acesse a plataforma
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#436F3A;">
                  Feito!
                </td>
              </tr>

              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  2&#65039;&#8419;&nbsp;&nbsp;Escolha uma edi&ccedil;&atilde;o
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#94A3B8;">
                  Pendente
                </td>
              </tr>

              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  3&#65039;&#8419;&nbsp;&nbsp;Compre seus n&uacute;meros
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#94A3B8;">
                  Pendente
                </td>
              </tr>

              <tr>
                <td style="padding:11px 20px 18px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  4&#65039;&#8419;&nbsp;&nbsp;Torce e ganha!
                </td>
                <td align="right" style="padding:11px 20px 18px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#94A3B8;">
                  Em breve
                </td>
              </tr>

            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td align="center" style="padding-bottom:14px;font-size:13px;color:#64748B;font-weight:500;">
                  Acesse agora e participe dos sorteios
                </td>
              </tr>
              <tr>
                <td align="center">
                  <a href="${p.linkAcessar}"
                     style="display:inline-block;background-color:#295280;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:16px 44px;border-radius:12px;letter-spacing:0.05em;text-transform:uppercase;">
                    ACESSAR PLATAFORMA &nbsp;&#127919;
                  </a>
                </td>
              </tr>
            </table>

            <!-- Info box -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#EFF6FF;border:1px solid #93C5FD;border-radius:12px;">
              <tr>
                <td width="48" valign="top" style="padding:14px 0 14px 16px;font-size:22px;vertical-align:top;line-height:1;">
                  &#128276;
                </td>
                <td style="padding:14px 16px 14px 6px;font-size:13px;font-weight:600;color:#1E40AF;line-height:1.5;vertical-align:middle;">
                  Fique de olho nos pr&oacute;ximos sorteios e n&atilde;o perca a chance de ganhar pr&ecirc;mios incr&iacute;veis!
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
