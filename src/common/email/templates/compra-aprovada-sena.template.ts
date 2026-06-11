export interface CompraAprovadaSenaParams {
  nomeCliente: string;
  valorFormatado: string;
  dataCompra: string;
  formaPagamento: string;
  linkVerNumeros: string;
  logoUrl: string;
}

export function compraAprovadaSenaTemplate(p: CompraAprovadaSenaParams): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Compra Aprovada — Capital Sena</title>
</head>
<body style="margin:0;padding:0;background-color:#0f2b1a;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f2b1a;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Logo -->
      ${p.logoUrl ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td align="center"><img src="${p.logoUrl}" alt="Capital Sena" width="200" style="display:block;max-width:200px;height:auto;" /></td></tr></table>` : ''}

      <!-- Card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;margin:0 auto;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 32px 64px rgba(0,0,0,0.4);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f3320 0%,#1a5c30 50%,#22703a 100%);padding:36px 32px 28px;border-radius:20px 20px 0 0;">

            <!-- Checkmark circle -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
              <tr>
                <td align="center" valign="middle"
                    style="width:64px;height:64px;background-color:#2e8b4a;border-radius:50%;text-align:center;vertical-align:middle;font-size:32px;color:#ffffff;font-weight:900;line-height:64px;padding:0;">
                  &#10003;
                </td>
              </tr>
            </table>

            <div style="font-size:30px;font-weight:900;color:#ffffff;line-height:1.1;letter-spacing:-0.5px;margin-bottom:8px;">
              Tudo Certo!
            </div>
            <div style="font-size:14px;color:#a8d4b8;font-weight:500;">
              Voc&ecirc; j&aacute; est&aacute; concorrendo no Capital Sena
            </div>

          </td>
        </tr>

        <!-- Divider strip -->
        <tr>
          <td height="6" style="background:linear-gradient(90deg,#1a5c30,#4CAF50,#1a5c30);font-size:1px;line-height:1px;">&nbsp;</td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 32px;background-color:#ffffff;">

            <!-- Greeting -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td style="border-left:3px solid #2e8b4a;padding:4px 0 4px 14px;font-size:15px;color:#374151;line-height:1.6;">
                  Parab&eacute;ns! Sua compra no valor de
                  <strong style="color:#111827;">${p.valorFormatado}</strong>
                  foi aprovada com sucesso. Confira os detalhes abaixo.
                </td>
              </tr>
            </table>

            <!-- Data grid -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px;overflow:hidden;">

              <tr>
                <td colspan="2" style="padding:16px 20px 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94A3B8;">
                  DETALHES DA COMPRA
                </td>
              </tr>

              <!-- Cliente -->
              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  &#128100;&nbsp;&nbsp;Cliente
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#1E293B;">
                  ${p.nomeCliente}
                </td>
              </tr>

              <!-- Data -->
              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  &#128197;&nbsp;&nbsp;Data da compra
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#1E293B;">
                  ${p.dataCompra}
                </td>
              </tr>

              <!-- Valor -->
              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  &#128176;&nbsp;&nbsp;Valor
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:16px;font-weight:700;color:#2e8b4a;">
                  ${p.valorFormatado}
                </td>
              </tr>

              <!-- Pagamento -->
              <tr>
                <td style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  &#128179;&nbsp;&nbsp;Pagamento
                </td>
                <td align="right" style="padding:11px 20px;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#1E293B;">
                  ${p.formaPagamento}
                </td>
              </tr>

              <!-- Status -->
              <tr>
                <td style="padding:11px 20px 18px;border-top:1px solid #E2E8F0;font-size:13px;color:#64748B;font-weight:500;white-space:nowrap;">
                  &#10003;&nbsp;&nbsp;Status
                </td>
                <td align="right" style="padding:11px 20px 18px;border-top:1px solid #E2E8F0;">
                  <span style="display:inline-block;background-color:#dcf5e7;color:#166534;font-size:12px;font-weight:700;padding:4px 12px;border-radius:100px;border:1px solid #86efac;">
                    &bull;&nbsp;Conclu&iacute;do
                  </span>
                </td>
              </tr>

            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td align="center" style="padding-bottom:14px;font-size:13px;color:#64748B;font-weight:500;">
                  Clique no bot&atilde;o para consultar seus n&uacute;meros
                </td>
              </tr>
              <tr>
                <td align="center">
                  <a href="${p.linkVerNumeros}"
                     style="display:inline-block;background-color:#1a5c30;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:16px 44px;border-radius:12px;letter-spacing:0.05em;text-transform:uppercase;">
                    VER N&Uacute;MEROS &nbsp;&#127808;
                  </a>
                </td>
              </tr>
            </table>

            <!-- Luck box -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#f0fdf4;border:1px solid #86efac;border-radius:12px;">
              <tr>
                <td width="48" valign="top" style="padding:14px 0 14px 16px;font-size:22px;vertical-align:top;line-height:1;">
                  &#127808;
                </td>
                <td style="padding:14px 16px 14px 6px;font-size:13px;font-weight:600;color:#166534;line-height:1.5;vertical-align:middle;">
                  Te desejamos muita sorte! Que essa seja a sua vez de ganhar na Sena.
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#F8FAFC;border-top:1px solid #E2E8F0;padding:18px 32px;text-align:center;font-size:12px;color:#94A3B8;line-height:1.7;border-radius:0 0 20px 20px;">
            &copy; ${year} Capital Sena &mdash; Todos os direitos reservados.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}
