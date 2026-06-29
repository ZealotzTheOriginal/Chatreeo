#!/usr/bin/env bash
set -e

ENV_FILE="src/environments/environment.prod.ts"

# API URL (https → wss for WebSocket)
if [ -n "$API_URL" ]; then
  WS_URL="${API_URL/https:/wss:}"
  sed -i "s|http://localhost:8000|${API_URL}|g"  "$ENV_FILE"
  sed -i "s|ws://localhost:8000|${WS_URL}|g"     "$ENV_FILE"
fi

# Firebase Web SDK config
[ -n "$FIREBASE_API_KEY" ]              && sed -i "s|YOUR_FIREBASE_API_KEY|${FIREBASE_API_KEY}|g"                       "$ENV_FILE"
[ -n "$FIREBASE_AUTH_DOMAIN" ]          && sed -i "s|YOUR_PROJECT\.firebaseapp\.com|${FIREBASE_AUTH_DOMAIN}|g"          "$ENV_FILE"
[ -n "$FIREBASE_PROJECT_ID" ]           && sed -i "s|YOUR_PROJECT_ID|${FIREBASE_PROJECT_ID}|g"                          "$ENV_FILE"
[ -n "$FIREBASE_STORAGE_BUCKET" ]       && sed -i "s|YOUR_PROJECT\.appspot\.com|${FIREBASE_STORAGE_BUCKET}|g"           "$ENV_FILE"
[ -n "$FIREBASE_MESSAGING_SENDER_ID" ]  && sed -i "s|YOUR_SENDER_ID|${FIREBASE_MESSAGING_SENDER_ID}|g"                  "$ENV_FILE"
[ -n "$FIREBASE_APP_ID" ]               && sed -i "s|YOUR_APP_ID|${FIREBASE_APP_ID}|g"                                  "$ENV_FILE"

npm install
npm run build
