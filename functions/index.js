const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const escapeIcs = (str) =>
    String(str).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const nextDay = (yyyymmdd) => {
    const d = new Date(`${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
};

exports.calendarFeed = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).send('Missing token');

    const snap = await db.collection('logs').where('calendarToken', '==', token).limit(1).get();
    if (snap.empty) return res.status(404).send('Invalid token');

    const data = snap.docs[0].data();
    const plans = data.trainingPlans || [];

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//InStrides//Training Plan//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:InStrides Training Plan',
        'X-WR-CALDESC:Your InStrides training plan sessions',
        'X-WR-TIMEZONE:UTC',
    ];

    for (const plan of plans) {
        for (const session of (plan.sessions || [])) {
            const dateStr = (session.date || '').replace(/-/g, '');
            if (dateStr.length !== 8) continue;

            const typeLabel = session.type || 'Session';
            const doneLabel = session.isComplete ? ' ✓' : '';
            const summary = `${typeLabel}${doneLabel} — ${plan.title}`;
            const description = session.target || '';

            lines.push('BEGIN:VEVENT');
            lines.push(`UID:instrides-${session.id}@in-strides.firebaseapp.com`);
            lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
            lines.push(`DTEND;VALUE=DATE:${nextDay(dateStr)}`);
            lines.push(`SUMMARY:${escapeIcs(summary)}`);
            if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
            lines.push(`STATUS:${session.isComplete ? 'CONFIRMED' : 'TENTATIVE'}`);
            lines.push('END:VEVENT');
        }
    }

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(lines.join('\r\n'));
});
