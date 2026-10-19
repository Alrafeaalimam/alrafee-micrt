// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: src/infrastructure/email/EmailService.ts
// Infrastructure Service: Transactional Email Delivery via Nodemailer / SMTP
// Master Reference: Rule 14 (Security - No credentials hardcoded)
// ============================================================================

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface IEmailService {
  sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean>;
  sendDeviceVerificationOtpEmail(toEmail: string, otpCode: string, deviceLabel?: string): Promise<boolean>;
  sendWelcomeEmail(toEmail: string, networkName: string): Promise<boolean>;
}

export class EmailService implements IEmailService {
  private transporter: Transporter | null = null;

  constructor(customTransporter?: Transporter) {
    if (customTransporter) {
      this.transporter = customTransporter;
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_APP_PASSWORD || '';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  async sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      // Mock/stub delivery in automated test mode to avoid network delays or SMTP quota exhaustion
      return true;
    }

    const fromAddress = process.env.SMTP_USER || 'jalsahnetwork@gmail.com';
    const transporter = this.getTransporter();

    const subject = 'كود إعادة تعيين كلمة المرور - نظام جلسة (Jalsah)';

    const textContent = `مرحباً بك في نظام جلسة (Jalsah)،

لقد تم طلب إعادة تعيين كلمة المرور لحسابك.

كود التحقق الخاص بك (OTP) هو: ${otpCode}

هذا الكود صالح للاستخدام لمرة واحدة فقط ولمدة 10 دقائق.
إذا لم تقم بطلب هذا الرمز، يُرجى تجاهل هذه الرسالة لحماية حسابك.

فريق دعم منصة جلسة
https://jalsah.network`;

    const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 24px;
      direction: rtl;
      text-align: right;
    }
    .card {
      max-width: 520px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0B192C 0%, #1E3E62 100%);
      padding: 32px 24px;
      text-align: center;
      color: #ffffff;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #F1C40F;
      margin: 0;
    }
    .subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 6px;
    }
    .content {
      padding: 32px 28px;
      color: #1e293b;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #0f172a;
    }
    .text {
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .otp-box {
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 10px;
      color: #0B192C;
      margin: 0;
    }
    .validity-tag {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #d97706;
      background: #fef3c7;
      padding: 4px 12px;
      border-radius: 20px;
    }
    .footer {
      background: #f8fafc;
      padding: 20px 24px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="logo-text">جلسة | JALSAH NETWORK</h1>
      <div class="subtitle">منصة إدارة شبكات مايكروتك وكروت الهوتسبوت</div>
    </div>
    <div class="content">
      <div class="title">طلب إعادة تعيين كلمة المرور</div>
      <p class="text">
        مرحباً، تلقينا طلباً لاستعادة الوصول إلى حسابك. استخدم كود التحقق السري أدناه لإكمال إعادة تعيين كلمة المرور:
      </p>
      
      <div class="otp-box">
        <div class="otp-code">${otpCode}</div>
        <div class="validity-tag">صلاحية الكود: 10 دقائق فقط</div>
      </div>

      <p class="text" style="font-size: 13px; color: #64748b; margin-top: 24px;">
        إذا لم تقم بطلب إعادة تعيين كلمة المرور بنفسك، يُرجى تجاهل هذا البريد تماماً. سيبقى حسابك آمناً ولن يتم تغيير أي بيانات.
      </p>
    </div>
    <div class="footer">
      نظام جلسة لإدارة الشبكات التجارية &copy; ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>
`;

    try {
      await transporter.sendMail({
        from: `"نظام جلسة | Jalsah" <${fromAddress}>`,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });
      return true;
    } catch (err) {
      console.error('[EmailService] Failed to send email via SMTP:', err);
      throw err;
    }
  }

  async sendDeviceVerificationOtpEmail(toEmail: string, otpCode: string, deviceLabel?: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    const fromAddress = process.env.SMTP_USER || 'jalsahnetwork@gmail.com';
    const transporter = this.getTransporter();

    const subject = 'كود تأكيد تسجيل الدخول من جهاز جديد - نظام جلسة (Jalsah)';
    const deviceDisplay = deviceLabel ? ` من الجهاز (${deviceLabel})` : '';

    const textContent = `مرحباً بك في نظام جلسة (Jalsah)،

لقد تم تسجيل محاولة دخول لحسابك${deviceDisplay} وهو جهاز جديد لم يُستخدم من قبل.

كود التحقق الخاص بك لتأكيد هذا الجهاز (OTP) هو: ${otpCode}

هذا الكود صالح للاستخدام لمرة واحدة فقط ولمدة 10 دقائق.
إذا لم تقم بمحاولة الدخول هذه، يُرجى تغيير كلمة المرور فوراً لحماية حسابك.

فريق دعم منصة جلسة
https://jalsah.network`;

    const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 24px;
      direction: rtl;
      text-align: right;
    }
    .card {
      max-width: 520px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0B192C 0%, #1E3E62 100%);
      padding: 32px 24px;
      text-align: center;
      color: #ffffff;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #F1C40F;
      margin: 0;
    }
    .subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 6px;
    }
    .content {
      padding: 32px 28px;
      color: #1e293b;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #0f172a;
    }
    .device-info {
      background: #eff6ff;
      border-right: 4px solid #3b82f6;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 16px 0;
      font-size: 13.5px;
      color: #1e40af;
    }
    .text {
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .otp-box {
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 10px;
      color: #0B192C;
      margin: 0;
    }
    .validity-tag {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #d97706;
      background: #fef3c7;
      padding: 4px 12px;
      border-radius: 20px;
    }
    .footer {
      background: #f8fafc;
      padding: 20px 24px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="logo-text">جلسة | JALSAH NETWORK</h1>
      <div class="subtitle">منصة إدارة شبكات مايكروتك وكروت الهوتسبوت</div>
    </div>
    <div class="content">
      <div class="title">تأكيد تسجيل الدخول من جهاز جديد</div>
      <p class="text">
        مرحباً، تم رصد محاولة دخول إلى حسابك من جهاز لم يُستخدم من قبل.
      </p>
      ${deviceLabel ? `<div class="device-info"><strong>الجهاز:</strong> ${deviceLabel}</div>` : ''}
      <p class="text">
        للسماح بالدخول وحماية حسابك، يرجى إدخال رمز التحقق (OTP) التالي في التطبيق:
      </p>
      <div class="otp-box">
        <div class="otp-code">${otpCode}</div>
        <div class="validity-tag">صلاحية الرمز: 10 دقائق فقط</div>
      </div>
      <p class="text" style="font-size: 13px; color: #64748b; margin-top: 24px;">
        إذا لم تكن أنت من يحاول الدخول، يُرجى تغيير كلمة المرور فوراً والتواصل مع إدارة النظام.
      </p>
    </div>
    <div class="footer">
      نظام جلسة لإدارة الشبكات التجارية &copy; ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>
`;

    try {
      await transporter.sendMail({
        from: `"نظام جلسة | Jalsah" <${fromAddress}>`,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });
      return true;
    } catch (err) {
      console.error('[EmailService] Failed to send device verification OTP email:', err);
      throw err;
    }
  }

  async sendWelcomeEmail(toEmail: string, networkName: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    const fromAddress = process.env.SMTP_USER || 'jalsahnetwork@gmail.com';
    const transporter = this.getTransporter();

    const subject = 'مرحباً بك في جلسة (Jalsah) 🎉';

    const textContent = `مرحباً بك في جلسة (Jalsah) 🎉

أهلاً وسهلاً بك وبشبكة "${networkName}" في نظام جلسة لإدارة شبكات مايكروتك وكروت الهوتسبوت.

نود إعلامك بأن حسابك الآن قيد المراجعة والتدقيق من قبل إدارة المنصة وسيتم تفعيله قريباً جداً.

في حال كان لديك أي استفسار أو بحاجة لأي مساعدة، يرجى عدم التردد في التواصل معنا عبر البريد الإلكتروني:
jalsahnetwork@gmail.com

فريق دعم منصة جلسة
https://jalsah.network`;

    const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 24px;
      direction: rtl;
      text-align: right;
    }
    .card {
      max-width: 520px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #4A154B 0%, #6B21A8 100%);
      padding: 32px 24px;
      text-align: center;
      color: #ffffff;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #FACC15;
      margin: 0;
    }
    .subtitle {
      font-size: 13px;
      color: #e9d5ff;
      margin-top: 6px;
    }
    .content {
      padding: 32px 28px;
      color: #1e293b;
    }
    .welcome-title {
      font-size: 20px;
      font-weight: 700;
      color: #4A154B;
      margin-bottom: 16px;
    }
    .network-badge {
      display: inline-block;
      background-color: #FAF5FF;
      border: 1px solid #E9D5FF;
      color: #6B21A8;
      font-weight: 700;
      padding: 8px 16px;
      border-radius: 8px;
      margin-bottom: 18px;
      font-size: 15px;
    }
    .info-box {
      background: #FEFCE8;
      border-right: 4px solid #EAB308;
      border-radius: 8px;
      padding: 16px;
      margin: 18px 0;
      color: #713F12;
      font-size: 14px;
      line-height: 1.6;
    }
    .text {
      font-size: 14px;
      line-height: 1.7;
      color: #475569;
      margin-bottom: 16px;
    }
    .contact-info {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 13.5px;
      color: #64748b;
    }
    .contact-link {
      color: #6B21A8;
      font-weight: 700;
      text-decoration: none;
    }
    .footer {
      background: #f8fafc;
      padding: 20px 24px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="logo-text">جلسة | JALSAH NETWORK</h1>
      <div class="subtitle">منصة إدارة شبكات مايكروتك وكروت الهوتسبوت</div>
    </div>
    <div class="content">
      <div class="welcome-title">مرحباً بك في منصة جلسة 🎉</div>
      <div class="network-badge">شبكة: ${networkName}</div>
      <p class="text">
        سعداء بانضمامك إلينا! لقد تم تسجيل شبكتك بنجاح في النظام.
      </p>
      <div class="info-box">
        <strong>حسابك الآن قيد المراجعة من الإدارة:</strong><br>
        طلبك قيد التدقيق حالياً من قبل إدارة المنصة وسيتم تفعيله قريباً لتتمكن من بدء استخدام النظام والتحكم براوتراتك وكروتك.
      </div>
      <div class="contact-info">
        إذا كان لديك أي استفسار أو احتجت لأي مساعدة، يمكنك دائماً التواصل عبر:
        <a class="contact-link" href="mailto:jalsahnetwork@gmail.com">jalsahnetwork@gmail.com</a>
      </div>
    </div>
    <div class="footer">
      نظام جلسة لإدارة الشبكات التجارية &copy; ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`;

    try {
      await transporter.sendMail({
        from: `"نظام جلسة | Jalsah" <${fromAddress}>`,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });
      return true;
    } catch (err) {
      console.error('[EmailService] Failed to send welcome email:', err);
      throw err;
    }
  }
}

export const defaultEmailService = new EmailService();
