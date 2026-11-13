#!/usr/bin/env bash
# "הקומץ" – הפעלה מהירה עם קישור HTTPS ציבורי (Cloudflare Tunnel)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js לא מותקן. הורידו מ- https://nodejs.org (גרסת LTS) והריצו שוב."; exit 1
fi
[ -d node_modules ] || { echo "📦 מתקין רכיבים (פעם ראשונה בלבד)..."; npm install --omit=dev || exit 1; }
PORT="${PORT:-3000}"
echo "🎬 מפעיל את השרת על פורט $PORT..."
PORT=$PORT node server/index.js &
SERVER_PID=$!
trap 'echo; echo "עוצר..."; kill $SERVER_PID $TUNNEL_PID 2>/dev/null; exit 0' INT TERM
sleep 2
LOG="$(mktemp)"
echo "🌐 פותח קישור ציבורי מאובטח (Cloudflare)..."
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ חסר הכלי הרשמי של Cloudflare (cloudflared)."
  echo "   ב-Mac התקינו פעם אחת עם:  brew install cloudflared"
  echo "   או הורידו מהאתר הרשמי: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo "   המשחק בינתיים רץ רק על המחשב הזה: http://localhost:$PORT"
  wait $SERVER_PID; exit 0
fi
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!
for i in $(seq 1 60); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -n "$URL" ]; then
  echo
  echo "════════════════════════════════════════════════"
  echo "  ✅ המשחק באוויר! שלחו לחברים את הקישור:"
  echo "     $URL"
  echo "════════════════════════════════════════════════"
  echo "  (השאירו את החלון הזה פתוח. Ctrl+C לסגירה)"
else
  echo "⚠️ לא הצלחתי לפתוח קישור ציבורי. המשחק עדיין עובד ברשת הביתית: http://localhost:$PORT"
  echo "   פרטים: $LOG"
fi
wait $SERVER_PID
