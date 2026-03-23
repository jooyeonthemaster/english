"use client";

import { useState } from "react";
import { AssignmentListClient } from "./assignment-list-client";
import { AssignmentFormDialog } from "./assignment-form-dialog";

interface Props {
  academyId: string;
  assignments: never[];
  classes: { id: string; name: string }[];
}

export function AssignmentsPageClient({
  academyId,
  assignments,
  classes,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <AssignmentListClient
        assignments={assignments}
        classes={classes}
        onCreateClick={() => setDialogOpen(true)}
      />
      <AssignmentFormDialog
        academyId={academyId}
        classes={classes}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
