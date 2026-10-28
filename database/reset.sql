-- ============================================================
-- RESET — removes every Wellspring table, trigger and function.
-- ============================================================
-- WARNING: this permanently deletes all data in these tables.
-- Use it only on a practice database, then run wellspring.sql again.

drop table if exists
  delivery,
  vendor_job,
  vendor_service,
  service_type,
  vendor,
  status_update,
  maintenance_request,
  category,
  room,
  person
cascade;

drop function if exists check_maintenance_request();
drop function if exists check_vendor_job();
drop function if exists block_status_update_changes();
drop function if exists block_vendor_delete();
