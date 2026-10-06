# K&B (Kitchens & Bathrooms) London Limited

Static staff and client portal demo for renovation project updates.

- `staff.html` contains the project register, stage updates and photos, target dates, issue records, and client decision publishing.
- `index.html` contains the client project timeline, stage galleries, design previews, upcoming stage, and shared decision responses.
- `projects.js` contains the demo project records and the eight bathroom/kitchen stages.

Project data is stored in browser-local IndexedDB. The demo has no authentication, server-side storage, or access controls; it is not suitable for confidential production data or cross-device client access.

## Supabase authentication foundation

The test sign-in page is at `login.html`, with separate **Staff login** and **Customer login** choices. Each choice checks the Supabase user's assigned role before continuing. The browser uses only the Supabase project URL and public publishable key in `supabase/config.js`; never put a `service_role` or secret key in browser code.

Before creating accounts, run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor. Keep public sign-ups disabled; create or invite users through **Authentication → Users** in the Supabase dashboard. Copy each user's UUID from there, then use the SQL Editor to add their profile. Add the relevant project row first:

```sql
insert into public.projects (id, title, status)
values ('09', 'Bathroom renovation', 'progress');

-- Staff account: replace the UUID with the staff user's Auth UUID.
insert into public.profiles (id, role)
values ('00000000-0000-0000-0000-000000000000', 'staff');

-- Customer account: replace the UUID; project_id must match a project row.
insert into public.profiles (id, role, project_id)
values ('00000000-0000-0000-0000-000000000000', 'client', '09');
```

Replace both example UUIDs before running the relevant profile statement; do not run both examples with the placeholder UUID. Give each customer only their own project assignment.

Keep sign-up invite-only. Set the Supabase Site URL and allowed redirect URLs to the actual development/production origins, including `login.html` for password resets. Do not create or send passwords in this repository.

**Important:** this is only the authentication/schema foundation. The existing `index.html` and `staff.html` still read project content from static files and browser-local IndexedDB, and do not yet require a Supabase session. A login page alone does not protect those pages or their assets. Do not use this for real client access until all private data and storage have been migrated to Supabase and the pages enforce the session and Row Level Security policies.

This is a test-login flow, not a protected portal. It routes staff to the staff demo and only supports the client demo project with ID `09`; it deliberately does not route other client assignments into Jane's page.

## Development preview

The **Deploy development previews** GitHub Actions workflow can be run manually after GitHub Pages is enabled with GitHub Actions as its source. It publishes:

- Client preview: `/development/`
- Staff preview: `/development/staff.html`

Both use [development/projects.js](./development/projects.js), which contains Jane's address-free project plus eight anonymized sample projects for reviewing staff register filters and navigation. No other project names, references, or notes are included. The staff preview uses a sanitized issue summary rather than the internal email summary. Both pages display development notices; the client message form does not send messages. The client preview header includes a link to the staff preview.

The staff preview is **not private**: it has no authentication, and anything in the Pages artifact can be viewed by anyone who can access the Pages site. Do not use it for real staff work or enter confidential data. Before deployment, ensure the repository and Pages visibility are appropriate for a review link. The previews still contain Jane Hill's name, project reference, photos, and design files, and should only be shared with intended reviewers.
