#!/usr/bin/env bash
# Prints the version of the checked-out commit. Run from anywhere in the checkout:
#
#   deploy/version.sh   ->  0.1.7
#
# The VERSION file holds the `major.minor` base; the patch is the number of
# commits since VERSION last changed. Every merge advances the version with no
# manual bump, and editing VERSION starts a new line at .0.
#
# CI and the VPS both run this, on their own checkouts, and that independence is
# the point: CI tags the images with what it computes and `deploy/update.sh`
# pulls what *it* computes, so the two agreeing is what makes a 404 on that pull
# a true statement — CI has not finished, or it went red — rather than a mystery.
# They have to compute it the same way for that to hold, which is why the formula
# lives here once instead of being written out in both places.
#
# Needs the full history: a shallow clone cannot count commits, so CI passes
# fetch-depth: 0.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

base="$(cat VERSION)"
version_commit="$(git log -1 --format=%H -- VERSION)"
patch="$(git rev-list --count "${version_commit}..HEAD")"

printf '%s.%s\n' "$base" "$patch"
