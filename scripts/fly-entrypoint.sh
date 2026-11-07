#!/bin/sh
set -eu
umask 077
# The mounted Fly volume starts owned by root; the application runs as the node user.
mkdir -p /data
chown node:node /data
chmod 700 /data
exec gosu node "$@"
