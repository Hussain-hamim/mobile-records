-- Run after setting the same random PHOTO_CLEANUP_SECRET in Edge Function
-- secrets and Vault (name: photo_cleanup_secret). Never commit the value.
-- Set Vault photo_project_url to this deployment's Supabase URL.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('record-photo-reconciliation','*/15 * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='photo_project_url') || '/functions/v1/photo-cleanup',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
   (select decrypted_secret from vault.decrypted_secrets where name='photo_cleanup_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 60000
 );
$job$);
