#!/usr/bin/env bash
# Rewrites commit ids cited in tracked files from pre-rewrite to post-rewrite ids,
# using git filter-repo's commit-map. A full 40-hex id changes when it is a key in
# the map; an abbreviated id (7 to 39 hex digits) changes when it is the prefix of
# exactly one old commit, and keeps its length. Other hex strings (sha256 digests,
# colours) are left alone. Every replacement is listed on stderr for review.
# Usage (in a checkout of the rewritten branch): remap-shas.sh <commit-map>
set -euo pipefail
map=$1
# check-large-files.cjs names the pre-rewrite root on purpose, so it keeps the old id.
mapfile -t files < <(git grep -l -I -w -E '[0-9a-f]{7,40}' -- . ':!*.lock' ':!*package-lock.json' ':!zk/vendor' ':!scripts/check-large-files.cjs' || true)
[ "${#files[@]}" -gt 0 ] || exit 0
perl -i -pe '
  BEGIN { my $m = shift @ARGV; open my $f, "<", $m or die "$m: $!"; <$f>;
          while (<$f>) { my ($o, $n) = split; $map{$o} = $n } @old = keys %map }
  sub remap { my $id = shift;
    return $map{$id} if exists $map{$id};
    return $id if length($id) == 40;
    my @hit = grep { index($_, $id) == 0 } @old;
    return $id unless @hit == 1;
    my $new = substr($map{$hit[0]}, 0, length $id);
    print STDERR "$ARGV: $id -> $new\n" if $new ne $id;
    return $new }
  s/\b([0-9a-f]{7,40})\b/remap($1)/ge' "$map" "${files[@]}"
git status --short
