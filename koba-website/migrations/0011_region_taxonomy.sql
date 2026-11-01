-- Region taxonomy update: NA/EU/APAC/OCE/LATAM/AFR replaces the old
-- NA-East/NA-West/EU/OCE/SEA split (see src/site/regions.ts). Normalize
-- existing seeded rows to the new codes.
update players set region = 'APAC' where region = 'SEA';
update players set region = 'NA' where region in ('NA-East', 'NA-West', 'NA-E', 'NA-W');
update servers set region = 'APAC' where region = 'SEA';
update servers set region = 'NA' where region in ('NA-East', 'NA-West', 'NA-E', 'NA-W');
