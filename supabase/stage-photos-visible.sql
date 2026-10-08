-- Stage photos are visible to the customer as soon as they are uploaded.
alter table public.project_files alter column client_visible set default true;
update public.project_files set client_visible = true where category = 'stage-photo';
