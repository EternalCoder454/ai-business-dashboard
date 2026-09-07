ALTER TABLE "all_hands_runs" RENAME TO "meetings";
ALTER TABLE "all_hands_rounds" RENAME TO "meeting_rounds";

ALTER INDEX "all_hands_ws_idx" RENAME TO "meetings_ws_idx";

ALTER TABLE "meetings" RENAME CONSTRAINT "all_hands_runs_workspace_id_id_pk" TO "meetings_workspace_id_id_pk";
ALTER TABLE "meeting_rounds" RENAME CONSTRAINT "all_hands_rounds_workspace_id_id_pk" TO "meeting_rounds_workspace_id_id_pk";
