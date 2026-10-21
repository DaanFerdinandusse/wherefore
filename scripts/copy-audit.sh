#!/bin/sh
# Fails if UI code names the data provider or uses an em dash.
set -e
status=0
if grep -rn "Qloo" app components 2>/dev/null; then echo "Provider name found in UI code"; status=1; fi
if grep -rn "—" app components lib workflows 2>/dev/null; then echo "Em dash found"; status=1; fi
exit $status
