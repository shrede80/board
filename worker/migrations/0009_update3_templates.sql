-- Update 3, phase C. Additive only: saved templates (UPDATE-3 §7, §8). A template is an ordinary
-- project row marked 'project' (a whole project) or 'scene' (one scene with its shots, plan,
-- images, characters and locations). Every existing project stays NULL = a normal project.
ALTER TABLE projects ADD COLUMN template_kind TEXT;
