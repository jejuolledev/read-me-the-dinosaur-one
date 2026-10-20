# Friction log — Read Me the Dinosaur One

Six points of friction I hit while building an Alexa+ MCP server for the Amazon Developer Hackathon (October 2026). Each entry follows the Devpost format: Task, Steps, Expected, Actual, Severity, Workaround, Suggestion.

## 1. Testing an MCP server against real Alexa+

- **Task:** hear how Alexa+ reads a page from my server and see the page card on a screen device.
- **Steps:** followed the Alexa+ add-on documentation from the Resources page; looked for a simulator or test console for self-hosted MCP servers.
- **Expected:** a sandbox to connect a self-hosted MCP server, even text-only.
- **Actual:** the add-on tools are preview-only for selected partners (the hackathon FAQ confirms this).
- **Severity:** high.
- **Workaround:** built my own web simulator (a real MCP client) and recorded the demo through it, as the FAQ allows.
- **Suggestion:** a public Alexa+ test console for self-hosted MCP servers, plus a note at the top of every gated page.

## 2. Playing audio from a tool result

- **Task:** let Alexa+ play the book's own narration (an mp3 with sentence timestamps) after reading the English.
- **Steps:** searched the MCP spec (audio content block) and the Alexa+ docs for whether a voice host plays audio returned by a tool.
- **Expected:** a statement of which content types Alexa+ renders, and how audio is handled on a speaker versus a screen device.
- **Actual:** nothing documented; I could not find out whether an `audio` block is played, buffered or dropped.
- **Severity:** high for any read-aloud, music or language-learning add-on.
- **Workaround:** the English goes in `speech`; the narration is a URL in the page card that the simulator plays with a button.
- **Suggestion:** a support matrix for tool-result content types (text, image, audio, structuredContent) per device class.

## 3. Session lifetime across a pause

- **Task:** make "Again!", "next" and "the second one" refer to what was just read, and make "bookmark" survive to tomorrow.
- **Steps:** looked for how Alexa+ maps a spoken conversation to MCP sessions, and whether a session survives a pause.
- **Expected:** "one MCP session per conversation", with the lifetime stated.
- **Actual:** not documented. I keep the reading per MCP session, expose it as the `storyshelf://reading` resource, and keep only the bookmark on disk so a new session can pick it up.
- **Severity:** medium.
- **Workaround:** per-session state plus a file-backed bookmark keyed by listener name.
- **Suggestion:** document when an Alexa+ MCP session starts and ends, and whether it survives a pause in the conversation.

## 4. Children's content and consent for an add-on

- **Task:** find out what an add-on that reads picture books to a child must do for certification, and how a parent's consent would be captured.
- **Steps:** read the Resources and FAQ pages and searched the policy pages for add-on categories.
- **Expected:** a short per-category checklist (children's content, data retention, consent flow).
- **Actual:** no summary for add-on categories that I could find.
- **Severity:** medium.
- **Workaround:** the demo uses only published sample books and stores nothing but a bookmark keyed by a listener name the parent types.
- **Suggestion:** a one-page guide for children's add-ons.

## 5. Bilingual books on an English voice host

- **Task:** show the original Korean text when Alexa+ reads the English.
- **Steps:** looked for guidance on mixed-language output or on-screen original text.
- **Expected:** a note on how a screen device shows text that the voice does not speak.
- **Actual:** none found; I put `text_ko` in `structuredContent` and render it in the simulator.
- **Severity:** low.
- **Workaround:** separate `speech` (spoken) from `text_ko` (shown).
- **Suggestion:** name a convention for "show but do not speak" fields.

## 6. Serving media next to an MCP endpoint

- **Task:** let a screen client fetch the page picture and narration that a tool result points to.
- **Steps:** returned `image` and `audio.src` as relative URLs in `structuredContent`; served them from the same Express app.
- **Expected:** guidance on whether tool results may carry relative URLs, and how a host resolves them.
- **Actual:** nothing in the spec or the Alexa+ docs; I made them server-relative and documented it.
- **Severity:** low.
- **Workaround:** relative paths plus a note in the README.
- **Suggestion:** state whether a host resolves relative URLs against the MCP endpoint origin.
