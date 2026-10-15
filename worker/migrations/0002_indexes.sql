-- Indexes found missing in review: polling reads images by time, the project list and
-- cleanup look up images by owner, restores look rows up by trash id.
CREATE INDEX IF NOT EXISTS images_owner_created ON images(owner_id, created_at);
CREATE INDEX IF NOT EXISTS item_images_owner ON item_images(owner_id, position);
CREATE INDEX IF NOT EXISTS scenes_trash ON scenes(trash_id);
CREATE INDEX IF NOT EXISTS shots_trash ON shots(trash_id);
CREATE INDEX IF NOT EXISTS board_cards_trash ON board_cards(trash_id);
CREATE INDEX IF NOT EXISTS trash_project ON trash(project_id);
