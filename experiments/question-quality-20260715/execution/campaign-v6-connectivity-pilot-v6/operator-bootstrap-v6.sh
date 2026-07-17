#!/bin/sh
set -eu
umask 077

# This script is not allowed to clean an already-started Node process. The
# authorized invocation must enter through /usr/bin/env -i before /bin/sh:
#   /usr/bin/env -i PATH=/usr/bin:/bin HOME=/nonexistent LANG=C LC_ALL=C \
#     TMPDIR=/tmp QUESTION_QUALITY_V6_POSIX_ENV_I=1 \
#     /bin/sh <sealed-path>/operator-bootstrap-v6.sh

if [ "${QUESTION_QUALITY_V6_POSIX_ENV_I-}" != "1" ]; then
  echo "operator bootstrap requires the sealed external env -i invocation" >&2
  exit 125
fi

for forbidden_name in \
  NODE_OPTIONS NODE_PATH NODE_REPL_EXTERNAL_MODULE NODE_EXTRA_CA_CERTS \
  ESBUILD_BINARY_PATH NPM_CONFIG_NODE_OPTIONS PNPAPI \
  LD_PRELOAD LD_LIBRARY_PATH DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH \
  BASH_ENV ENV CDPATH
do
  eval "forbidden_present=\${${forbidden_name}+yes}"
  if [ "${forbidden_present-}" = "yes" ]; then
    echo "operator bootstrap rejects preload/loader/resolution environment: ${forbidden_name}" >&2
    exit 125
  fi
done

if [ "${PATH-}" != "/usr/bin:/bin" ] ||
   [ "${HOME-}" != "/nonexistent" ] ||
   [ "${LANG-}" != "C" ] ||
   [ "${LC_ALL-}" != "C" ] ||
   [ "${TMPDIR-}" != "/tmp" ]; then
  echo "operator bootstrap exact clean environment differs" >&2
  exit 125
fi

SCRIPT_PATH=$(/usr/bin/readlink -f -- "$0")
SCRIPT_DIR=$(/usr/bin/dirname -- "${SCRIPT_PATH}")
NODE_PATH_EXACT="/usr/bin/node"
NODE_REAL=$(/usr/bin/readlink -f -- "${NODE_PATH_EXACT}")
if [ "${NODE_REAL}" != "${NODE_PATH_EXACT}" ]; then
  echo "operator bootstrap Node realpath differs" >&2
  exit 125
fi

# POSIX shells may export an implementation-owned PWD even when they were
# entered through env -i. Rebuild the exact six-name environment at the Node
# exec boundary so no shell-added name reaches module evaluation.
exec /usr/bin/env -i \
  PATH=/usr/bin:/bin \
  HOME=/nonexistent \
  LANG=C \
  LC_ALL=C \
  TMPDIR=/tmp \
  QUESTION_QUALITY_V6_POSIX_ENV_I=1 \
  "${NODE_PATH_EXACT}" "${SCRIPT_DIR}/operator-bootstrap-preflight-v6.mjs" "$@"
