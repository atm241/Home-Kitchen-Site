-- Rewrite absolute upload URLs to root-relative paths.
--
-- Photo uploads used to be stored as `http://<whatever host the uploader
-- used>/uploads/<file>`, which meant a recipe photo added from the machine
-- running the server was saved as http://localhost:5001/... and then failed to
-- load on every other device in the house. Uploads are now stored relative and
-- resolved client-side; this fixes rows written before that change.
--
-- Only touches URLs pointing at our own /uploads/ path. Scraped recipe images
-- live on other people's domains and must keep their absolute URLs, so the
-- pattern deliberately requires the /uploads/ segment.
UPDATE recipes
SET image_url = '/uploads/' || regexp_replace(image_url, '^https?://[^/]+/uploads/', '')
WHERE image_url ~ '^https?://[^/]+/uploads/';
