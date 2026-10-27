-- SECURITY NOTE: The store owner explicitly authorized public storage upload,
-- update, and read policies for catalog-images only. This permits anonymous
-- clients to write arbitrary objects in this bucket; no DELETE permission is
-- added, and no other bucket or table policy is widened by this migration.
DROP POLICY IF EXISTS "Allow public upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Allow public select" ON storage.objects;

CREATE POLICY "Allow public upload"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'catalog-images');

-- The follow-up migration scopes both existing and resulting rows with USING
-- and WITH CHECK to prevent updates from affecting other storage buckets.
CREATE POLICY "Allow public update"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'catalog-images')
WITH CHECK (bucket_id = 'catalog-images');

CREATE POLICY "Allow public select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'catalog-images');
