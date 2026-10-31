# Stackyard — Audience Writing Rules

These rules apply to every word the Maker (teacher) sees: UI labels, error messages, help text, generated card content, and documentation.

## Voice

Write as a helpful colleague, not a manual.
Be warm but brief. Never be condescending.

## Plain language

- Use everyday words. Avoid tech jargon.
  - Say "card" not "component" or "node".
  - Say "set of cards" not "stack" in UI labels (use "stack" only in technical files).
  - Say "next card" not "navigate to destination".
  - Say "something went wrong" not "an unhandled exception occurred".
- One idea per sentence.
- Active voice: "Stackyard builds your cards" not "Your cards are built by Stackyard".

## Spelling and grammar

- Irish/UK English spelling throughout.
  - colour, behaviour, recognise, organise, licence (noun), practise (verb), fulfil.
- Use "pupils" not "students" for a primary school context.
- Contractions are fine ("can't", "you'll") — they sound natural.

## Numbers and punctuation

- Spell out numbers one to ten; use digits for 11 and above.
- No Oxford comma.
- Use an em dash (—) for parenthetical phrases, not a double hyphen.

## Error messages

- Say what happened in one sentence.
- Say what to do next in one sentence.
- Never show a stack trace or raw error code to the teacher.
- Example: "We couldn't save your card. Check your internet connection and try again."

## Button and label style

- Title case for buttons: "Save Card", "Export File", "Add Question".
- Sentence case for all other labels and messages.
- Keep button labels under five words.

## Generated card content

When the LLM generates card text, the output must follow the same rules:
- Age-appropriate language for the year group specified (default: 4th class, ~9–10 years old).
- Short sentences. No passive voice.
- Questions should be unambiguous — one clearly correct answer.
