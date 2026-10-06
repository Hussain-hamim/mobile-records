-- Match the app's current IMEI policy: exactly 15 normalized digits.
-- The client stopped requiring a checksum, but the original server function
-- still rejected those records at valid_snapshot. Keep all other snapshot
-- checks, including distinct dual IMEIs, and preserve existing function grants.
create or replace function public.validate_imei(value text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(value ~ '^[0-9]{15}$', false);
$$;
