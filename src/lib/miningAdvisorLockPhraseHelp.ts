export type AdvisorLockPhraseHelpItem = {
  q: string
  a: string
}

export const ADVISOR_LOCK_PHRASE_HELP: AdvisorLockPhraseHelpItem[] = [
  {
    q: 'If you forget the lock phrase',
    a: 'You cannot unlock the saved Gemini key. Nobody else can either. Clear the saved key, paste your Gemini key again, and pick a new phrase.',
  },
  {
    q: 'Does Clear also clear the phrase?',
    a: 'The phrase is never stored. Clear deletes the encrypted copy. After that the old phrase does nothing.',
  },
  {
    q: 'Why a lock phrase?',
    a: 'So you can save a key to your profile without this site ever holding a readable copy. Your device encrypts with the phrase before it is stored. Only that phrase unlocks it. You can skip save and paste the Gemini key each visit — no phrase needed.',
  },
]

export function advisorLockPhraseHelpArchiveLines(): string[] {
  return ADVISOR_LOCK_PHRASE_HELP.map((item) => `**${item.q}:** ${item.a}`)
}
