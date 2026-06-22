import sgMail from "@sendgrid/mail";
import fs from "fs";
import path from "path";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function getLogoDataUri(): string {
  try {
    const logoPath = path.join(process.cwd(), "client", "public", "logo.png");
    const logoData = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logoData.toString("base64")}`;
  } catch (err) {
    console.warn("[email] Could not read logo.png for inline embedding — falling back to URL:", err);
    return "";
  }
}

const LOGO_DATA_URI = getLogoDataUri();

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "hello@sfmedia.com";

function getAppUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, "");
  }
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, "");
  }
  return "http://localhost:5000";
}

const RESOLVED_APP_URL_AT_BOOT = getAppUrl();
if (RESOLVED_APP_URL_AT_BOOT === "http://localhost:5000") {
  console.warn(
    "[email] APP_BASE_URL / APP_URL is not set — outgoing email links will point at http://localhost:5000. " +
    "Set APP_BASE_URL to your deployed domain (e.g. https://<app>.azurewebsites.net) so welcome emails work."
  );
} else {
  console.log(`[email] Outgoing email links will use base URL: ${RESOLVED_APP_URL_AT_BOOT}`);
}

function emailWrapper(title: string, headerColor: string, headerContent: string, bodyContent: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef1f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #eef1f6; padding: 48px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 560px; width: 100%;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <span style="display: inline-block; color: #075949; font-size: 22px; font-weight: 700; letter-spacing: -0.2px; line-height: 1;">SF Media</span>
            </td>
          </tr>
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04);">
                <tr>
                  <td style="background: ${headerColor}; padding: 40px 44px 36px;">
                    ${headerContent}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 36px 44px 40px;">
                    ${bodyContent}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} SF Media. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function ctaButton(href: string, label: string, color = "linear-gradient(145deg, #0a5344 0%, #0f7d64 100%)"): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding-bottom: 16px;">
      <a href="${href}" style="display: inline-block; background: ${color}; color: #ffffff; text-decoration: none; padding: 15px 48px; border-radius: 10px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px; box-shadow: 0 4px 14px rgba(30,58,95,0.35);">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

function infoBox(rows: { label: string; value: string }[]): string {
  const rowsHtml = rows.map((r, i) => `
<tr>
  <td style="padding: 8px 0; ${i < rows.length - 1 ? "border-bottom: 1px solid #e8ecf1;" : ""}">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td width="140" style="color: #9ca3af; font-size: 13px; font-weight: 500;">${r.label}</td>
        <td style="color: #0a241e; font-size: 14px; font-weight: 600;">${r.value}</td>
      </tr>
    </table>
  </td>
</tr>`).join("");
  return `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f8fafc; border: 1px solid #e8ecf1; border-radius: 12px; margin-bottom: 32px;">
  <tr>
    <td style="padding: 24px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        ${rowsHtml}
      </table>
    </td>
  </tr>
</table>`;
}

async function send(to: string, subject: string, html: string) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn(`[email] SENDGRID_API_KEY not set — skipping email to ${to}: ${subject}`);
    return;
  }
  await sgMail.send({ to, from: { email: FROM_EMAIL, name: "SF Media" }, subject, html });
}

export async function sendInvitationEmail({
  toEmail,
  inviterName,
  organizationName,
  roleName,
  token,
}: {
  toEmail: string;
  inviterName: string;
  organizationName: string;
  roleName: string;
  token: string;
}) {
  const appUrl = getAppUrl();
  const setupUrl = `${appUrl}/accept-invite?token=${token}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to ${organizationName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef1f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #eef1f6; padding: 48px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 560px; width: 100%;">

          <!-- Logo Section -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <span style="display: inline-block; color: #075949; font-size: 22px; font-weight: 700; letter-spacing: -0.2px; line-height: 1;">SF Media</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04);">

                <!-- Header Banner -->
                <tr>
                  <td style="background: linear-gradient(145deg, #075949 0%, #0b5d4b 40%, #1e3450 100%); padding: 40px 44px 36px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td>
                          <p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Team Invitation</p>
                          <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700; line-height: 1.3;">You're invited to join<br>${organizationName}</h1>
                          <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0; line-height: 1.5;">${inviterName} wants you on the team</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding: 36px 44px 40px;">

                    <p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 28px;">
                      Hi there! You've been invited to collaborate on <strong style="color: #0a241e;">${organizationName}</strong> using SF Media — an AI-powered platform for creating and managing social media campaigns.
                    </p>

                    <!-- Details Card -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f8fafc; border: 1px solid #e8ecf1; border-radius: 12px; margin-bottom: 32px;">
                      <tr>
                        <td style="padding: 24px 28px;">
                          <p style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700; margin: 0 0 16px;">Your Account Details</p>

                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                              <td style="padding: 8px 0; border-bottom: 1px solid #e8ecf1;">
                                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                  <tr>
                                    <td width="110" style="color: #9ca3af; font-size: 13px; font-weight: 500;">Organization</td>
                                    <td style="color: #0a241e; font-size: 14px; font-weight: 600;">${organizationName}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; border-bottom: 1px solid #e8ecf1;">
                                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                  <tr>
                                    <td width="110" style="color: #9ca3af; font-size: 13px; font-weight: 500;">Your Role</td>
                                    <td>
                                      <span style="display: inline-block; background-color: #e0e7ff; color: #3730a3; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 20px;">${roleName}</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                  <tr>
                                    <td width="110" style="color: #9ca3af; font-size: 13px; font-weight: 500;">Email</td>
                                    <td style="color: #0a241e; font-size: 14px; font-weight: 500;">${toEmail}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center" style="padding-bottom: 16px;">
                          <a href="${setupUrl}" style="display: inline-block; background: linear-gradient(145deg, #0a5344 0%, #0f7d64 100%); color: #ffffff; text-decoration: none; padding: 15px 48px; border-radius: 10px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px; box-shadow: 0 4px 14px rgba(30,58,95,0.35);">
                            Accept Invitation &amp; Set Up Account
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback Link -->
                    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0 0 4px; line-height: 1.5;">
                      Or copy and paste this link into your browser:
                    </p>
                    <p style="color: #0f7d64; font-size: 12px; text-align: center; margin: 0; word-break: break-all; line-height: 1.5;">
                      <a href="${setupUrl}" style="color: #0f7d64; text-decoration: underline;">${setupUrl}</a>
                    </p>
                  </td>
                </tr>

                <!-- Expiry Notice -->
                <tr>
                  <td style="padding: 0 44px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
                      <tr>
                        <td style="padding: 12px 16px;">
                          <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
                            &#9200; This invitation expires in <strong>7 days</strong>. Please set up your account before then.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 28px 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0 0 6px; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} SF Media. All rights reserved.
              </p>
              <p style="color: #c4c9d4; font-size: 11px; margin: 0; line-height: 1.5;">
                You received this email because ${inviterName} invited you to join ${organizationName}.<br>
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await sgMail.send({
    to: toEmail,
    from: {
      email: FROM_EMAIL,
      name: "SF Media",
    },
    subject: `${inviterName} invited you to join ${organizationName} on SF Media`,
    html,
  });
}

export async function sendPasswordResetOtpEmail({
  toEmail,
  fullName,
  otp,
}: {
  toEmail: string;
  fullName: string;
  otp: string;
}) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("[email] SENDGRID_API_KEY not set — skipping OTP email");
    return;
  }

  const html = emailWrapper(
    "Reset Your Password",
    "linear-gradient(145deg, #075949 0%, #0b5d4b 100%)",
    `<h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Reset Your Password</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">We received a request to reset your password</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, use the code below to reset your password. This code expires in <strong>10 minutes</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding-bottom: 28px;">
          <div style="display: inline-block; background: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 12px; padding: 20px 40px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #111827; font-family: 'Courier New', monospace;">${otp}</span>
          </div>
        </td>
      </tr>
    </table>
    <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>`
  );

  await send(toEmail, "Your SF Media password reset code", html);
}

export async function sendPasswordResetEmail({
  toEmail,
  fullName,
  token,
}: {
  toEmail: string;
  fullName: string;
  token: string;
}) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("[email] SENDGRID_API_KEY not set — skipping password reset email");
    return;
  }
  const appUrl = getAppUrl();
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  const html = emailWrapper(
    "Reset Your Password",
    "linear-gradient(145deg, #075949 0%, #0b5d4b 100%)",
    `<h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Reset Your Password</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">We received a request to reset your password</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 28px;">
      Hi ${fullName}, click the button below to set a new password for your account. This link expires in 1 hour.
    </p>
    ${ctaButton(resetUrl, "Reset Password")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0; word-break: break-all;">
      Or visit: <a href="${resetUrl}" style="color: #0f7d64;">${resetUrl}</a>
    </p>
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 16px 0 0;">
      If you didn't request this, you can safely ignore this email.
    </p>`
  );

  await send(toEmail, "Reset your SF Media password", html);
}

export async function sendAdminCreatedOrgEmail({
  toEmail,
  fullName,
  orgName,
  tempPassword,
  tier,
}: {
  toEmail: string;
  fullName: string;
  orgName: string;
  tempPassword: string;
  tier: string;
}) {
  const appUrl = getAppUrl();
  const loginUrl = `${appUrl}/auth`;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  const html = emailWrapper(
    "Your SF Media workspace is ready",
    "linear-gradient(145deg, #075949 0%, #0b5d4b 40%, #1e3450 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Workspace Invitation</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700; line-height: 1.3;">Welcome to SF Media,<br>${fullName}</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0; line-height: 1.5;">A workspace has been created for ${orgName}</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 28px;">
      A SF Media admin has set up <strong style="color: #0a241e;">${orgName}</strong> on the <strong style="color: #0a241e;">${tierLabel}</strong> tier. Sign in with the credentials below to finish setting up your brand profile and start creating content.
    </p>
    ${infoBox([
      { label: "Email", value: toEmail },
      { label: "Temporary Password", value: `<span style="font-family: 'Courier New', monospace; background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${tempPassword}</span>` },
      { label: "Workspace", value: orgName },
      { label: "Tier", value: tierLabel },
    ])}
    ${ctaButton(loginUrl, "Log In to SF Media")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0 0 4px; line-height: 1.5;">
      Or copy and paste this link into your browser:
    </p>
    <p style="color: #0f7d64; font-size: 12px; text-align: center; margin: 0 0 24px; word-break: break-all; line-height: 1.5;">
      <a href="${loginUrl}" style="color: #0f7d64; text-decoration: underline;">${loginUrl}</a>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; margin-top: 16px;">
      <tr>
        <td style="padding: 12px 16px;">
          <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
            &#128274; For your security, you'll be asked to change your password immediately after signing in. Then you'll be guided through setting up your brand profile.
          </p>
        </td>
      </tr>
    </table>`
  );

  await send(toEmail, "Your SF Media workspace is ready", html);
}

export async function sendVerificationEmail({
  toEmail,
  fullName,
  token,
}: {
  toEmail: string;
  fullName: string;
  token: string;
}) {
  const appUrl = getAppUrl();
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;

  const html = emailWrapper(
    "Verify Your Email",
    "linear-gradient(145deg, #166534 0%, #15803d 100%)",
    `<h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Verify Your Email</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Please confirm your email address to activate your account</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 28px;">
      Hi ${fullName}, click the button below to verify your email address. This link expires in 24 hours.
    </p>
    ${ctaButton(verifyUrl, "Verify Email Address", "linear-gradient(145deg, #166534 0%, #15803d 100%)")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0; word-break: break-all;">
      Or visit: <a href="${verifyUrl}" style="color: #16a34a;">${verifyUrl}</a>
    </p>
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 16px 0 0;">
      If you didn't request this, you can safely ignore this email.
    </p>`
  );

  await send(toEmail, "Please verify your SF Media email address", html);
}

export async function sendWelcomeEmail({
  toEmail,
  fullName,
  trialExpiresAt,
}: {
  toEmail: string;
  fullName: string;
  trialExpiresAt: Date;
}) {
  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/dashboard`;
  const subscribeUrl = `${appUrl}/subscribe`;
  const trialExpiry = trialExpiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = emailWrapper(
    "Welcome to SF Media",
    "linear-gradient(145deg, #075949 0%, #0b5d4b 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Welcome</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Your 14-day trial has started!</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">You're all set to start creating amazing social media campaigns</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, welcome to SF Media! Your free 14-day trial is now active and gives you access to our AI-powered campaign creation tools.
    </p>
    ${infoBox([
      { label: "Plan", value: "Trial (Free)" },
      { label: "Trial starts", value: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
      { label: "Trial expires", value: trialExpiry },
    ])}
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      During your trial you can create up to <strong>3 campaigns</strong>, generate <strong>5 AI images</strong>, schedule <strong>10 posts</strong>, and connect <strong>3 social accounts</strong>.
    </p>
    ${ctaButton(dashboardUrl, "Go to Dashboard")}
    <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 8px 0 0;">
      Want unlimited access? <a href="${subscribeUrl}" style="color: #0f7d64; font-weight: 600;">View our plans</a>
    </p>`
  );

  await send(toEmail, "Welcome to SF Media — your 14-day trial has started", html);
}

export async function sendTrialReminderEmail({
  toEmail,
  fullName,
  daysRemaining,
  trialExpiresAt,
}: {
  toEmail: string;
  fullName: string;
  daysRemaining: number;
  trialExpiresAt: Date;
}) {
  const appUrl = getAppUrl();
  const subscribeUrl = `${appUrl}/subscribe`;
  const isUrgent = daysRemaining <= 1;
  const trialExpiry = trialExpiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const headerColor = isUrgent
    ? "linear-gradient(145deg, #92400e 0%, #b45309 100%)"
    : "linear-gradient(145deg, #075949 0%, #0b5d4b 100%)";
  const dayText = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;
  const urgencyMsg = isUrgent
    ? "This is your final reminder — upgrade today to keep your data and features."
    : "Upgrade now to keep all your campaigns, posts, and features without interruption.";

  const html = emailWrapper(
    `Your trial expires in ${dayText}`,
    headerColor,
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Trial Reminder</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Your trial expires in ${dayText}</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">${urgencyMsg}</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, your SF Media trial ends on <strong>${trialExpiry}</strong>. After that, you'll lose access to creating new campaigns and generating AI content.
    </p>
    ${infoBox([
      { label: "Days remaining", value: dayText },
      { label: "Trial expires", value: trialExpiry },
    ])}
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      Upgrade now to keep all your existing campaigns and continue creating unlimited content. Your data is safe — upgrading takes just a minute.
    </p>
    ${ctaButton(subscribeUrl, "Upgrade My Plan", "linear-gradient(145deg, #0c6b56 0%, #094f40 100%)")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      Questions? Reply to this email and we'll help you choose the right plan.
    </p>`
  );

  const subject = daysRemaining <= 1
    ? "⚠️ Final warning: Your SF Media trial expires tomorrow"
    : `Your SF Media trial expires in ${dayText} — upgrade now`;

  await send(toEmail, subject, html);
}

export async function sendTrialExpiredEmail({
  toEmail,
  fullName,
}: {
  toEmail: string;
  fullName: string;
}) {
  const appUrl = getAppUrl();
  const subscribeUrl = `${appUrl}/subscribe`;

  const html = emailWrapper(
    "Your trial has expired",
    "linear-gradient(145deg, #991b1b 0%, #b91c1c 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Trial Expired</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Your trial has ended</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Upgrade to restore full access to your account</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, your SF Media trial has expired. Your account is currently in read-only mode — you can still view your existing campaigns and posts, but you cannot create new content.
    </p>
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      Upgrade to a paid plan to restore full access instantly. Your existing data is safe and will be there when you return.
    </p>
    ${ctaButton(subscribeUrl, "Upgrade to Restore Access", "linear-gradient(145deg, #0c6b56 0%, #094f40 100%)")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      Need help choosing a plan? Reply to this email — we're happy to assist.
    </p>`
  );

  await send(toEmail, "Your SF Media trial has expired — upgrade to restore access", html);
}

export async function sendUpgradeConfirmationEmail({
  toEmail,
  fullName,
  tierName,
  billingInterval,
  effectiveDate,
}: {
  toEmail: string;
  fullName: string;
  tierName: string;
  billingInterval: string;
  effectiveDate: Date;
}) {
  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/dashboard`;
  const effectiveDateStr = effectiveDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const intervalLabel = billingInterval === "annual" ? "Annual" : "Monthly";

  const html = emailWrapper(
    "Subscription Upgraded",
    "linear-gradient(145deg, #14532d 0%, #166534 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Upgrade Confirmed</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Welcome to ${tierName}!</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Your subscription is now active</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, your upgrade to the <strong>${tierName}</strong> plan is confirmed and active immediately. Thank you for your subscription!
    </p>
    ${infoBox([
      { label: "New plan", value: tierName },
      { label: "Billing", value: intervalLabel },
      { label: "Effective", value: effectiveDateStr },
    ])}
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      You now have full access to all ${tierName} features. Head to your dashboard to start creating.
    </p>
    ${ctaButton(dashboardUrl, "Go to Dashboard", "linear-gradient(145deg, #14532d 0%, #166534 100%)")}`
  );

  await send(toEmail, `You're now on the ${tierName} plan — SF Media`, html);
}

export async function sendDowngradeRequestedEmail({
  toEmail,
  fullName,
  currentTier,
  effectiveDate,
}: {
  toEmail: string;
  fullName: string;
  currentTier: string;
  effectiveDate: Date;
}) {
  const appUrl = getAppUrl();
  const billingUrl = `${appUrl}/dashboard/billing`;
  const effectiveDateStr = effectiveDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = emailWrapper(
    "Downgrade Scheduled",
    "linear-gradient(145deg, #075949 0%, #0b5d4b 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Downgrade Requested</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Downgrade scheduled</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Your plan change will take effect at end of billing period</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, your request to downgrade from the <strong>${currentTier}</strong> plan has been received. You'll continue to have full access until the end of your current billing period.
    </p>
    ${infoBox([
      { label: "Current plan", value: currentTier },
      { label: "Effective date", value: effectiveDateStr },
    ])}
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      After the effective date, your account will switch to the lower plan and data exceeding the new limits may become read-only.
    </p>
    ${ctaButton(billingUrl, "Manage Billing")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      Changed your mind? You can reverse this in the billing portal before the effective date.
    </p>`
  );

  await send(toEmail, "Your SF Media downgrade has been scheduled", html);
}

export async function sendDowngradeActivatedEmail({
  toEmail,
  fullName,
  newTier,
}: {
  toEmail: string;
  fullName: string;
  newTier: string;
}) {
  const appUrl = getAppUrl();
  const subscribeUrl = `${appUrl}/subscribe`;
  const dashboardUrl = `${appUrl}/dashboard`;

  const html = emailWrapper(
    "Plan Changed",
    "linear-gradient(145deg, #374151 0%, #4b5563 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Plan Updated</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Your plan has changed</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Your account is now on the ${newTier} plan</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, your plan has been updated. You are now on the <strong>${newTier}</strong> plan. Content that exceeded your previous plan's limits is now read-only.
    </p>
    ${infoBox([
      { label: "New plan", value: newTier },
      { label: "Effective", value: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
    ])}
    ${ctaButton(dashboardUrl, "Go to Dashboard")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      Want to upgrade again? <a href="${subscribeUrl}" style="color: #0f7d64; font-weight: 600;">View plans</a>
    </p>`
  );

  await send(toEmail, `Your SF Media plan has been updated to ${newTier}`, html);
}

export async function sendCancellationConfirmedEmail({
  toEmail,
  fullName,
  effectiveDate,
}: {
  toEmail: string;
  fullName: string;
  effectiveDate: Date;
}) {
  const appUrl = getAppUrl();
  const subscribeUrl = `${appUrl}/subscribe`;
  const effectiveDateStr = effectiveDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = emailWrapper(
    "Subscription Cancelled",
    "linear-gradient(145deg, #374151 0%, #4b5563 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Cancellation Confirmed</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Subscription cancelled</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Your cancellation is confirmed</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, we've confirmed your cancellation. You'll continue to have access to your account until <strong>${effectiveDateStr}</strong>.
    </p>
    ${infoBox([
      { label: "Access ends", value: effectiveDateStr },
      { label: "Data retention", value: "Your data is preserved for 30 days" },
    ])}
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      We're sorry to see you go. If you change your mind, you can reactivate your subscription at any time before your access ends.
    </p>
    ${ctaButton(subscribeUrl, "Reactivate Subscription", "linear-gradient(145deg, #0c6b56 0%, #094f40 100%)")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      Thank you for being a SF Media customer.
    </p>`
  );

  await send(toEmail, "Your SF Media subscription has been cancelled", html);
}

export async function sendPaymentFailedEmail({
  toEmail,
  fullName,
  gracePeriodEndsAt,
}: {
  toEmail: string;
  fullName: string;
  gracePeriodEndsAt: Date;
}) {
  const appUrl = getAppUrl();
  const billingUrl = `${appUrl}/dashboard/billing`;
  const graceDate = gracePeriodEndsAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const daysLeft = Math.max(0, Math.ceil((gracePeriodEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const html = emailWrapper(
    "Payment Failed",
    "linear-gradient(145deg, #92400e 0%, #b45309 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Payment Issue</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Payment failed</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Please update your billing information to avoid interruption</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, we were unable to process your latest payment. Your account is currently in a <strong>grace period</strong> — you still have access for now.
    </p>
    ${infoBox([
      { label: "Grace period", value: `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining` },
      { label: "Access ends", value: graceDate },
    ])}
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      Please update your payment method before <strong>${graceDate}</strong> to avoid service interruption.
    </p>
    ${ctaButton(billingUrl, "Update Payment Method", "linear-gradient(145deg, #92400e 0%, #b45309 100%)")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      If you need help, please reply to this email.
    </p>`
  );

  await send(toEmail, "⚠️ Payment failed — update your billing info to keep access", html);
}

export async function sendAccountSuspendedEmail({
  toEmail,
  fullName,
}: {
  toEmail: string;
  fullName: string;
}) {
  const html = emailWrapper(
    "Account Suspended",
    "linear-gradient(145deg, #991b1b 0%, #b91c1c 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Account Notice</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Your account has been suspended</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Please contact support to restore access</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, your SF Media account has been suspended. You will not be able to log in or access your content until the suspension is lifted.
    </p>
    <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
      If you believe this is an error, or if you'd like more information about the suspension, please contact our support team.
    </p>
    ${ctaButton("mailto:hello@sfmedia.com", "Contact Support", "linear-gradient(145deg, #991b1b 0%, #b91c1c 100%)")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      You can also reply directly to this email.
    </p>`
  );

  await send(toEmail, "Your SF Media account has been suspended", html);
}

export async function sendFounderAssignedEmail({
  toEmail,
  fullName,
}: {
  toEmail: string;
  fullName: string;
}) {
  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/dashboard`;

  const html = emailWrapper(
    "Founder Status Granted",
    "linear-gradient(145deg, #78350f 0%, #92400e 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Special Access</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">You've been granted Founder status!</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Unlimited access to all SF Media features</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, congratulations! Your account has been granted <strong>Founder</strong> status. You now have unlimited access to all SF Media features with no quotas or restrictions.
    </p>
    ${infoBox([
      { label: "Plan", value: "Founder (Unlimited)" },
      { label: "Campaigns", value: "Unlimited" },
      { label: "AI images", value: "Unlimited" },
      { label: "Scheduled posts", value: "Unlimited" },
    ])}
    ${ctaButton(dashboardUrl, "Go to Dashboard", "linear-gradient(145deg, #78350f 0%, #92400e 100%)")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      Thank you for being part of our journey. We're honoured to have you with us.
    </p>`
  );

  await send(toEmail, "🎉 You've been granted Founder status on SF Media", html);
}

export async function sendTrialResetEmail({
  toEmail,
  fullName,
  newExpiryDate,
  usageReset,
}: {
  toEmail: string;
  fullName: string;
  newExpiryDate: Date;
  usageReset: boolean;
}) {
  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/dashboard`;
  const expiryStr = newExpiryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = emailWrapper(
    "Trial Reset",
    "linear-gradient(145deg, #075949 0%, #0b5d4b 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">Trial Extended</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">Your trial has been reset</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">A fresh 14-day trial period has started</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
      Hi ${fullName}, your SF Media trial has been reset by our team. You now have a full 14-day trial period starting today.
    </p>
    ${infoBox([
      { label: "New expiry", value: expiryStr },
      { label: "Usage reset", value: usageReset ? "Yes — all usage counters cleared" : "No — existing usage retained" },
    ])}
    ${ctaButton(dashboardUrl, "Go to Dashboard")}
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 8px 0 0;">
      Make the most of your trial — we're here if you need help.
    </p>`
  );

  await send(toEmail, "Your SF Media trial has been reset — enjoy a fresh 14 days", html);
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  instagram: "Instagram",
  facebook: "Facebook",
};

function postCard(post: {
  content: string;
  platform: string;
  scheduledAt: Date;
  campaignName: string;
  detailUrl: string;
}): string {
  const platformLabel = PLATFORM_LABELS[post.platform.toLowerCase()] || post.platform;
  const when = post.scheduledAt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const trimmed = post.content.length > 200
    ? post.content.slice(0, 200).trimEnd() + "…"
    : post.content;
  return `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border: 1px solid #e8ecf1; border-radius: 12px; margin-bottom: 12px;">
  <tr>
    <td style="padding: 18px 22px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="padding-bottom: 10px;">
            <span style="display: inline-block; background-color: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 999px;">${platformLabel}</span>
            <span style="display: inline-block; color: #6b7280; font-size: 13px; margin-left: 8px;">${when}</span>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom: 6px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; font-weight: 500;">${post.campaignName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom: 14px;">
            <p style="color: #374151; font-size: 14px; line-height: 1.55; margin: 0; white-space: pre-wrap;">${escapeHtml(trimmed)}</p>
          </td>
        </tr>
        <tr>
          <td>
            <a href="${post.detailUrl}" style="color: #4338ca; font-size: 13px; font-weight: 600; text-decoration: none;">Review post →</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function sendApprovalReminderEmail({
  toEmail,
  fullName,
  organizationName,
  frequency,
  windowLabel,
  posts,
  preferencesUrl,
}: {
  toEmail: string;
  fullName: string;
  organizationName: string;
  frequency: "daily" | "weekly" | "monthly";
  windowLabel: string;
  posts: Array<{
    id: number;
    content: string;
    platform: string;
    scheduledAt: Date;
    campaignName: string;
    detailUrl: string;
  }>;
  preferencesUrl: string;
}) {
  const appUrl = getAppUrl();
  const calendarUrl = `${appUrl}/calendar`;

  const cardsHtml = posts.map(postCard).join("");
  const countText = posts.length === 1 ? "1 post" : `${posts.length} posts`;

  const html = emailWrapper(
    `Review ${countText} going out ${windowLabel}`,
    "linear-gradient(145deg, #0a5344 0%, #0f7d64 100%)",
    `<p style="color: rgba(255,255,255,0.6); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 600;">${frequency} digest · ${escapeHtml(organizationName)}</p>
     <h1 style="color: #ffffff; margin: 0 0 8px; font-size: 26px; font-weight: 700;">${countText} going out ${windowLabel}</h1>
     <p style="color: rgba(255,255,255,0.75); font-size: 15px; margin: 0;">Take a moment to review them before they publish.</p>`,
    `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 22px;">
      Hi ${escapeHtml(fullName)}, here are the posts queued to publish ${windowLabel} for <strong>${escapeHtml(organizationName)}</strong>. Click any post to edit, reschedule, or delete it.
    </p>
    ${cardsHtml}
    <div style="margin-top: 28px;">
      ${ctaButton(calendarUrl, "Open the calendar")}
    </div>
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 18px 0 0; line-height: 1.6;">
      You're receiving this because you're an admin for ${escapeHtml(organizationName)}.<br>
      <a href="${preferencesUrl}" style="color: #6b7280; text-decoration: underline;">Change reminder settings</a>
    </p>`
  );

  const subject = `${countText} going out ${windowLabel} — review now`;
  await send(toEmail, subject, html);
}
