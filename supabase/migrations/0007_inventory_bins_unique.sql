create temporary table inventory_bins_agg as
select
  sku,
  bin,
  sum(quantity) as quantity,
  max(item_id) as item_id,
  max(created_at) as created_at
from public.inventory_bins
group by sku, bin;

truncate table public.inventory_bins;

insert into public.inventory_bins (sku, bin, quantity, item_id, created_at)
select sku, bin, quantity, item_id, created_at
from inventory_bins_agg;

drop table inventory_bins_agg;

alter table public.inventory_bins
  add constraint inventory_bins_sku_bin_key unique (sku, bin);
