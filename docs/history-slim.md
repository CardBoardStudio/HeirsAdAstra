# History slim

Study output (`analysis/`) and viewport screenshots (`docs/screenshots/`) made up about 93% of this repository's packed size: 62.5 MiB of history for 4.4 MiB of everything else. They now live in [CardBoardStudio/galactic-reach-studies](https://github.com/CardBoardStudio/galactic-reach-studies), with their own history, and a one-time rewrite removes them from every commit here. `node scripts/check-large-files.cjs` (the **Rules contract** job) keeps them out: it refuses study output (`.jsonl`, `.gz`, `.zip` and other archives), anything under the two moved folders, images over 256 KiB, other files over 1 MiB, and branches built on the old history.

| | Before | After |
|---|---|---|
| Packed history (all branches and tags) | 62.5 MiB | 4.4 MiB |
| Fresh `git clone` (`.git` + working tree) | 110 MiB | 26 MiB |
| Commits | 474 | 474, plus one id-remap commit on `main` |

Every commit id changes, because the first commit carries GitHub's signature and the rewrite cannot keep signatures. Merged PRs keep their pages, and GitHub still shows their old commits. Old ids cited in tracked files are rewritten by `scripts/history-slim/remap-shas.sh`. The full pre-rewrite history is the `drawing_board-pre-slim.bundle` release asset on the studies repository, beside `commit-map.txt` (old id, new id).

## After the rewrite: update your clone

Re-cloning is simplest. To keep an existing clone:

```sh
git tag pre-slim/main origin/main          # before fetching: remembers the old main
git fetch --prune --force origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
git switch main && git reset --hard origin/main
# each local branch with unpushed work:
git rebase --onto origin/main pre-slim/main my-branch
# then drop the old objects
git tag -d pre-slim/main && git reflog expire --expire=now --all && git gc --prune=now
```

If you fetched before tagging, `origin/main@{1}` names the old main. Never merge or push a branch from the old history. CI refuses it, and it would bring back all 58 MiB. Worktrees share their repository's objects, so a worktree pool needs the fetch and `gc` once, plus a rebase in each worktree with unpushed work.

## Runbook (one time)

`scripts/history-slim/rewrite.sh WORK` does steps 3 to 5 in a scratch directory and never pushes; `URL=/path/to/mirror.git` runs it against a copy for a rehearsal.

1. **Announce a freeze** (about one hour) to everyone with push access. Merge or park open PRs; note each open PR's head.
2. **Render:** turn off auto-deploy on the `drawing-board` service. Pushing a rewritten `stable` would redeploy it and drop live stable games.
3. **Backup:** `git clone --mirror` plus a bundle of every branch and tag (`rewrite.sh` writes `backup.git`, `drawing_board-pre-slim.bundle` and `pre-slim-refs.txt`). Upload the bundle and `commit-map.txt` as release assets on the studies repository before pushing.
4. **Rewrite:** `git filter-repo --invert-paths --paths-from-file scripts/history-slim/paths.txt` on a second mirror without `refs/pull/*`.
5. **Remap:** one commit on `main` runs `remap-shas.sh` over the commit map.
6. **Push** every branch and tag at once, with leases on the backed-up ids, using the command `rewrite.sh` prints (`git push --atomic --force-with-lease=…`). If anyone pushed during the freeze, nothing moves; start again from step 3.
7. **Open PRs:** rebase each head onto the new `main` (`git rebase --onto origin/main pre-slim/main <branch>`) and force-push it. The PR keeps its number. `release/next` is rebuilt by the **Release cut** workflow on the push to `main`.
8. **Verify:** a fresh clone is about 5 MiB of history; CI is green on `main` and `stable`; `git log --all -- analysis docs/screenshots` is empty; the dev host has redeployed `main` (one restart, same tree).
9. **Render:** turn auto-deploy back on. **Unfreeze.**
10. Optional: ask GitHub Support to garbage-collect the repository. Its reported size stays high until they do, because `refs/pull/*` still holds the old commits; clones are small immediately.

**Rollback** (any time before collaborators rebase): from `backup.git`, `git push --atomic --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'` restores every branch and tag byte for byte. After people have rebased onto the new history, roll forward instead.
