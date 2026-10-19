---
name: read-me-the-dinosaur-one
description: Run a bedtime picture-book reading through the Read Me the Dinosaur One MCP server. Use when a child or parent asks for a story by what is in it ("the dinosaur one", "the one with the whale", "something about a new baby"), says "again", "next", "bookmark", or "where did we stop", or asks what books there are.
---

# Read Me the Dinosaur One

An MCP server (Streamable HTTP, protocol 2025-11-25). Default endpoint: `http://127.0.0.1:8790/mcp`.
Eleven sample picture books by Dongwhamoa. Children do not know titles; they know what is inside.

## Flow

1. The child asks for a book by its contents -> `find_book_by_what_is_in_it({"words": "<the content words>"})`.
   - `decided: true` -> call `read_page({"book": "<slug>"})` right away. That is page one; read `speech`.
   - Not decided -> read the `speech` question ("I have 2 books with whale: number one ..., number two ... Which one?") and wait.
     "The second one" -> `read_page({"choice": 2})`. "The scared one" -> `find_book_by_what_is_in_it` again with the new words.
   - No results -> read `speech`; it lists what the shelf does have.
2. Read one page per turn. `speech` is the page text; say it almost word for word. Do not read ahead or summarize.
3. "Again!", "one more time" -> `again({})`. Same page, re-read, counted.
4. "Next", "and then?", "turn the page" -> `read_page({})`. "Page three" -> `read_page({"page": 3})`.
5. "Bookmark", "that's enough for tonight", "goodnight" -> `bookmark_tonight({"listener": "<name if known>"})`.
6. "Where did we stop?", "the book from last night" -> `resume_tomorrow({"listener": "<same name>"})`. It reads the bookmarked page.
7. "What books do you have?" -> `list_shelf({})`.

## Rules

- Never ask the child for a title. Never say the books were made by the child; they are sample books by Dongwhamoa.
- The last page's `speech` already ends with the one question of the night. Do not add questions after other pages.
- Every page card carries `text_ko` (the original Korean) and `audio` (the book's own Korean narration with sentence timestamps). On a screen device, show the page `image`, the English text, and offer the narration. The narration is synthesized, not a parent's voice.
- Bookmarks are per `listener` (default "home") and survive server restarts.

## Example

User: "Alexa, read me the dinosaur one!"
Call: `find_book_by_what_is_in_it({"words": "dinosaur"})` -> decided, slug `doyun-dino-teeth`
Call: `read_page({"book": "doyun-dino-teeth"})`
Say: "Page one. Doyun was playing in the forest and hopped over a log. The dinosaur came stomping after him. ..."

User: "Again!"
Call: `again({})` -> `again_count: 1`
Say: the same page text.

User: "Bookmark."
Call: `bookmark_tonight({})`
Say: "Bookmarked Where Did the Dinosaur's Toothbrush Go?, page one of eight. Page one was the one you asked for again; I'll remember that. Tomorrow, just say 'where did we stop'."
