-- Roles used to be guessed from names and job titles (and rewritten on every start); they now live in members.level.
UPDATE `members` SET `level` = 'Brand Owner' WHERE upper(trim(`role`)) = 'BO' OR lower(`role`) LIKE '%brand owner%' OR lower(trim(`role`)) = 'business owner' OR upper(trim(`level`)) = 'BO' OR lower(`name`) LIKE '%hanief%' OR lower(`email`) LIKE '%hanief%';--> statement-breakpoint
UPDATE `members` SET `level` = 'Director' WHERE `level` != 'Brand Owner' AND (lower(`role`) LIKE '%direktur%' OR lower(`name`) LIKE '%aziz%' OR lower(`email`) LIKE '%aziz%');--> statement-breakpoint
UPDATE `members` SET `level` = 'Project Manager' WHERE `level` NOT IN ('Brand Owner', 'Director') AND (lower(`role`) LIKE '%project manager%' OR upper(trim(`role`)) = 'PM' OR lower(`name`) LIKE '%vero%' OR lower(`email`) LIKE '%vero%');--> statement-breakpoint
-- First-run entities (used to be seeded on every start while the table was empty, which undid deleting the last one).
INSERT INTO `entities` (`id`, `name`, `description`, `color`, `created_at`)
SELECT g, g, 'Unit Bisnis & Entitas ' || g, 'lilac', CAST(strftime('%s', 'now') AS integer) * 1000
FROM (SELECT 'HCS' AS g UNION SELECT 'HCM' UNION SELECT 'HUC' UNION SELECT upper(`grp`) FROM `members` WHERE `grp` != '')
WHERE (SELECT count(*) FROM `entities`) = 0;
