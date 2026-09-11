# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Phase-commit ritual must account for pre-staged index content

- **Context**: git history — commit 37e4489 (`/10x-implement`'s Phase 1 commit ritual, saved-recipes-with-notes)
- **Problem**: The phase-commit ritual's dirty-path prompt only asks about worktree-dirty unrelated paths. It doesn't check whether an unrelated path is already staged in git's index before the run started. A plain `git commit` with no pathspec commits the whole index regardless of which paths were explicitly `git add`ed during the ritual — so pre-existing staged content can leak into a phase commit even after the user chooses "stage only the planned set."
- **Rule**: Before the phase-commit ritual's `git add` step, also check `git status --porcelain` for paths already staged (index status column not blank/`?`) that are outside the touched-file set. Either unstage them first (`git restore --staged <path>`) or commit with an explicit pathspec (`git commit -- <paths>`) instead of a bare `git commit`.
- **Applies to**: `/10x-implement`'s phase-end and epilogue commit rituals (this project's `.claude/skills/10x-implement` skill).
