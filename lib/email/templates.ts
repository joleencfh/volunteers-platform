// Email texts. Applicants write to us in Italian and get Italian back; admins get English
// (development plan A-04). Plain text only, and no admin email carries personal data: it points
// to the review page, behind sign-in.
import type { EmailMessage } from './transport'

type Template = Omit<EmailMessage, 'to'>

/** Sent to an applicant when an admin approves: where to ask for the sign-in link. */
export function applicationApprovedEmail(loginUrl: string): Template {
  return {
    subject: 'La tua candidatura a PauseAI Italia è stata accolta',
    text: [
      'Ciao,',
      '',
      'la tua candidatura come volontario di PauseAI Italia è stata accolta. Benvenuto!',
      '',
      `Per accedere apri questa pagina e chiedi il link di accesso con questo stesso indirizzo email: ${loginUrl}`,
      'Puoi accedere anche con Google, se usi un account Google con questo indirizzo.',
      '',
      'Grazie,',
      'PauseAI Italia',
    ].join('\n'),
  }
}

/** Sent to an applicant when an admin rejects: short and without reasons. */
export function applicationRejectedEmail(applyUrl: string): Template {
  return {
    subject: 'La tua candidatura a PauseAI Italia',
    text: [
      'Ciao,',
      '',
      'grazie per esserti candidato come volontario di PauseAI Italia. Al momento non possiamo accogliere la tua candidatura.',
      '',
      `Puoi candidarti di nuovo in qualsiasi momento: ${applyUrl}`,
      '',
      'Grazie,',
      'PauseAI Italia',
    ].join('\n'),
  }
}

/** Sent to every admin when someone applies. */
export function newApplicationEmail(reviewUrl: string): Template {
  return {
    subject: 'New volunteer application',
    text: [
      'Hello,',
      '',
      'A new volunteer application is waiting for review.',
      '',
      `Review it here (sign-in required): ${reviewUrl}`,
      '',
      'PauseAI IT platform',
    ].join('\n'),
  }
}

/**
 * Sent to every admin when a member asks for an export or deletion of their data. It names the
 * kind of request and the display name and points to the admin list; it never carries the
 * member's email address or real name.
 */
export function dataRequestEmail(
  kind: 'export' | 'deletion',
  displayName: string,
  listUrl: string,
): Template {
  const what = kind === 'export' ? 'an export of their data' : 'the deletion of their data'
  return {
    subject: `Data ${kind} request`,
    text: [
      'Hello,',
      '',
      `A volunteer (${displayName}) has asked for ${what}.`,
      '',
      `See the request here (sign-in required): ${listUrl}`,
      '',
      'PauseAI IT platform',
    ].join('\n'),
  }
}

export type TaskAssignedDetails = {
  title: string
  groupName: string
  /** ISO date (YYYY-MM-DD), when the task has one. */
  dueOn: string | null
  /** The display name of the person who assigned it; never their address or real name. */
  assignerName: string
  activityUrl: string
}

/**
 * Sent to a volunteer when a task is assigned to them by someone else, in their saved language.
 * It names the task, the group, the due date and the person who assigned it by display name, and
 * links to the activity page (sign-in required).
 */
export function taskAssignedEmail(locale: 'en' | 'it', details: TaskAssignedDetails): Template {
  const { title, groupName, dueOn, assignerName, activityUrl } = details
  if (locale === 'it') {
    return {
      subject: `Ti è stato assegnato un compito: ${title}`,
      text: [
        'Ciao,',
        '',
        `${assignerName} ti ha assegnato un compito nel gruppo di lavoro ${groupName}: ${title}`,
        ...(dueOn ? [`Scadenza: ${dueOn}`] : []),
        '',
        `Aprilo qui (serve l'accesso): ${activityUrl}`,
        '',
        'Grazie,',
        'PauseAI Italia',
      ].join('\n'),
    }
  }
  return {
    subject: `A task was assigned to you: ${title}`,
    text: [
      'Hello,',
      '',
      `${assignerName} assigned you a task in the ${groupName} working group: ${title}`,
      ...(dueOn ? [`Due: ${dueOn}`] : []),
      '',
      `Open it here (sign-in required): ${activityUrl}`,
      '',
      'PauseAI IT platform',
    ].join('\n'),
  }
}
