'use client'

import { useActionState, useId } from 'react'
import {
  assignTask,
  setTaskStatus,
  takeTask,
  type TaskActionState,
} from '@/app/[lang]/groups/[slug]/tasks/actions'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/fields'
import { TASK_COMPLETION_NOTE_MAX_LENGTH } from '@/lib/domain/activities'
import { MAX_URL_LENGTH } from '@/lib/domain/meetings'
import type { TaskStatus } from '@/lib/domain/tasks'
import { useTranslations } from '@/lib/i18n/client'

const initial: TaskActionState = { status: 'idle' }

export type TaskTarget = { groupId: string; slug: string; taskId: string }

/** What the signed-in person may do with one task, worked out on the server by the pure rules. */
export type TaskCapabilities = {
  take: boolean
  assign: boolean
  complete: boolean
  /** The statuses besides done the person may move the task to (open, in progress). */
  moves: TaskStatus[]
}

function Hidden({ groupId, slug, taskId }: TaskTarget) {
  return (
    <>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="taskId" value={taskId} />
    </>
  )
}

/** A refusal is announced as an alert; a success needs no text, the list shows the new state. */
function Outcome({ state }: { state: TaskActionState }) {
  const t = useTranslations('tasks.controls.states')
  const failed =
    state.status !== 'idle' && state.status !== 'done' && state.status !== 'doneEmailFailed'
  return (
    <p
      role={failed ? 'alert' : 'status'}
      className={
        failed ? 'text-base font-semibold text-danger empty:hidden' : 'text-base empty:hidden'
      }
    >
      {state.status !== 'idle' && state.status !== 'done' ? t(state.status) : null}
    </p>
  )
}

/** The controls of one task row: take, assign, move between open and in progress, complete, reopen. */
export function TaskControls({
  target,
  status,
  assigneeId,
  candidates,
  can,
}: {
  target: TaskTarget
  status: TaskStatus
  assigneeId: string | null
  candidates: { id: string; label: string }[]
  can: TaskCapabilities & { reopen: boolean }
}) {
  const t = useTranslations('tasks.controls')
  const id = useId()
  const [takeState, take, taking] = useActionState(takeTask, initial)
  const [assignState, assign, assigning] = useActionState(assignTask, initial)
  const [moveState, move, moving] = useActionState(setTaskStatus, initial)
  const [doneState, complete, completing] = useActionState(setTaskStatus, initial)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {can.take && (
          <form action={take}>
            <Hidden {...target} />
            <Button type="submit" disabled={taking}>
              {taking ? t('taking') : t('take')}
            </Button>
          </form>
        )}
        {can.moves.map((next) => (
          <form action={move} key={next}>
            <Hidden {...target} />
            <input type="hidden" name="status" value={next} />
            <Button type="submit" variant="secondary" disabled={moving}>
              {next === 'in_progress' ? t('start') : t('backToOpen')}
            </Button>
          </form>
        ))}
        {can.reopen && (
          <form action={move}>
            <Hidden {...target} />
            <input type="hidden" name="status" value="open" />
            <Button type="submit" variant="secondary" disabled={moving}>
              {t('reopen')}
            </Button>
          </form>
        )}
        {can.assign && (
          <form action={assign} className="flex flex-wrap items-end gap-2">
            <Hidden {...target} />
            <FormField id={`${id}-assignee`} label={t('assignee')}>
              {(props) => (
                <Select {...props} name="assigneeId" defaultValue={assigneeId ?? ''}>
                  <option value="">{t('unassigned')}</option>
                  {candidates.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <Button type="submit" variant="secondary" disabled={assigning}>
              {assigning ? t('assigning') : t('assign')}
            </Button>
          </form>
        )}
      </div>

      {can.complete && status !== 'done' && (
        <details className="rounded-md border-2 border-line-strong p-3">
          <summary className="cursor-pointer text-base font-semibold">
            {t('completeSummary')}
          </summary>
          <form action={complete} className="mt-3 flex flex-col gap-3">
            <Hidden {...target} />
            <input type="hidden" name="status" value="done" />
            <FormField id={`${id}-note`} label={t('note')} hint={t('evidenceHint')}>
              {(props) => (
                <Textarea {...props} name="note" maxLength={TASK_COMPLETION_NOTE_MAX_LENGTH} />
              )}
            </FormField>
            <FormField id={`${id}-url`} label={t('link')} hint={t('linkHint')}>
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  name="url"
                  maxLength={MAX_URL_LENGTH}
                  autoComplete="off"
                />
              )}
            </FormField>
            <div>
              <Button type="submit" disabled={completing}>
                {completing ? t('completing') : t('complete')}
              </Button>
            </div>
          </form>
        </details>
      )}

      <Outcome state={takeState.status !== 'idle' ? takeState : assignState} />
      <Outcome state={moveState} />
      <Outcome state={doneState} />
    </div>
  )
}
