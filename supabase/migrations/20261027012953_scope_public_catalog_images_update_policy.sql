-- Defense-in-depth follow-up: an UPDATE policy must constrain both the row
-- selected for update and the resulting row. Keep both sides on catalog-images.
ALTER POLICY "Allow public update" ON storage.objects
USING (bucket_id = 'catalog-images')
WITH CHECK (bucket_id = 'catalog-images');
