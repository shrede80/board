-- Update 3, phase A1. Additive only: the photo height of a scene card on the free board after
-- dragging its side (UPDATE-3 §3.2). NULL = the photo follows the card width, as before, so
-- every existing scene card looks exactly the same.
ALTER TABLE scenes ADD COLUMN board_img_h REAL;
