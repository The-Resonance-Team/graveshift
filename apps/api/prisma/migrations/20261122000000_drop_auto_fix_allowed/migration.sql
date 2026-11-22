-- Auto-fix is a boot flag in graveshift.config.yaml, not a work-item column.
ALTER TABLE "work_items" DROP COLUMN "auto_fix_allowed";
