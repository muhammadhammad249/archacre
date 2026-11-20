# ARCH ACRE Studio

The Next.js server uses the existing website files and reads published projects and edited website content from Supabase. Visitors can use the public website without an account.

The studio sign-in path is **/studio/login**. The public site has no link to it. Dashboard pages, actions and database writes require an assigned admin account and a verified authenticator code. Draft projects and draft-only images stay private.

## Local setup

1. Create a Supabase project and run [001_studio.sql](supabase/migrations/001_studio.sql) and [002_seed_projects.sql](supabase/migrations/002_seed_projects.sql) in order, using the SQL Editor or Supabase CLI. The second migration imports the existing portfolio.
2. In Supabase Authentication, disable public sign-ups, enable email/password and TOTP, and create or invite the administrator. Copy their UUID from the Users screen and run the SQL below with that UUID. Repeat for any other approved administrator.
3. Copy [.env.example](.env.example) to `.env.local`. Set the project URL, publishable key and server-only secret key. Generate a private rate-limit secret using the command below.
4. Set the site URL and allow its exact authentication callback URL, such as `http://localhost:3000/studio/auth/callback`, in Supabase Auth. Configure custom SMTP and keep the standard password recovery link template.
5. Run `npm ci` and `npm run dev`. Open `http://localhost:3000/studio/login`, sign in and enroll an authenticator when prompted.

```sql
insert into studio_private.studio_admins (user_id)
values ('REPLACE_WITH_THE_AUTH_USER_UUID');
```

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

[Supabase Auth setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) · [Authenticator codes](https://supabase.com/docs/guides/auth/auth-mfa/totp) · [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

With no Supabase configuration, the public site serves its existing content and the studio disables sign-in. The original static preview is available through `npm run dev:static`.

## Projects and media

Upload JPG, PNG, WebP or AVIF still images to the media library. Choose an optional center crop. Uploads are limited to eight files and 3.9 MB total per request and are converted to WebP. Choose a cover and gallery images in the project editor. Publishing adds the project to the public portfolio. Featured published projects also appear on the homepage. Smaller display-order numbers appear first.

## Inquiries and email

With the server secret configured, the public contact form stores general, project and quote requests in the private inbox. Set `RESEND_API_KEY`, `INQUIRY_FROM_EMAIL` on a verified sending domain and `INQUIRY_TO_EMAIL` to enable new-inquiry email. Submission stays in the inbox if the email service is unavailable. Supabase Auth sends password recovery through its own SMTP configuration. [Resend email API](https://resend.com/docs/api-reference/emails/send-email)

## Deployment and backups

Deploy as a Next.js application on a Node.js host. Set the same environment variables in the host's secret settings, use the HTTPS website origin for `SITE_URL` and allow its recovery callback URL in Supabase. Prepare the database before switching the domain to the new application. Keep the Supabase secret key and rate-limit secret server-side. Vercel restricts its Hobby plan to personal, non-commercial use. [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)

Admin Profile can download a JSON export of application data, and Inquiries can export a CSV. These files contain private inquiry data. Store them securely. For full recovery, make a Supabase logical database dump and copy the Storage files separately. [Supabase backups](https://supabase.com/docs/guides/platform/backups)
