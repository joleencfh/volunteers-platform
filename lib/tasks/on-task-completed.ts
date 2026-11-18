// The hook M3c (levels and automatic onboarding) fills in. It runs once after a task has been
// marked done, with the id of that task. Today it does nothing on purpose: the count of a member's
// completed tasks and the level re-evaluation arrive with M3c (stories O-04 to O-06).

/** Called by `setTaskStatus` after a task was completed. A no-op until the level engine exists. */
export async function onTaskCompleted(taskId: string): Promise<void> {
  void taskId
}
