const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

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
            const target = (session.target || '').trim();
            const summary = target
                ? `${typeLabel} — ${target} (${plan.title})`
                : `${typeLabel} (${plan.title})`;
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

exports.generateAnalysis = onRequest(
    { cors: false, invoker: 'public', secrets: ['ANTHROPIC_API_KEY'] },
    async (req, res) => {
        const authHeader = req.headers.authorization || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

        let uid;
        try {
            const decoded = await getAuth().verifyIdToken(idToken);
            uid = decoded.uid;
        } catch (e) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const snap = await db.collection('logs').doc(`log-${uid}`).get();
        if (!snap.exists) return res.status(404).json({ error: 'No training data found' });

        const data = snap.data();
        const entries = (data.entries || []).filter(e => !e.isPlanned);
        const plans = data.trainingPlans || [];
        const goals = data.goals || [];
        const completedLearnings = data.completedLearnings || [];

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const recent = entries.filter(e => e.date >= cutoffStr);

        const typeCounts = {};
        recent.forEach(e => { if (e.type && e.type !== 'NONE') typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
        const typesSummary = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}: ${c} sessions`).join(', ');

        const today = new Date().toISOString().split('T')[0];
        const activePlan = plans.find(p => p.startDate <= today && p.endDate >= today);
        const activeGoals = goals.filter(g => !g.achieved).map(g => g.title || g.name || 'Unnamed goal').join(', ');

        const prompt = `You are an expert endurance coach reviewing an athlete's training log. Provide concise, actionable coaching insights.

Training data (last 90 days):
- Total sessions: ${recent.length}
- Activity breakdown: ${typesSummary || 'none recorded'}
- Active goals: ${activeGoals || 'none set'}
${activePlan ? `- Current plan: ${activePlan.title} (${(activePlan.sessions || []).filter(s => s.isComplete).length}/${(activePlan.sessions || []).length} sessions complete)` : ''}
${completedLearnings.length ? `- Recent learnings: ${completedLearnings.slice(-5).map(l => `"${typeof l === 'string' ? l : l.text || ''}"` ).join(', ')}` : ''}

Provide a structured analysis with these sections:
## Volume & Consistency
## Strengths
## Areas to Improve
## Priority This Week

Be specific, encouraging, and practical. Write 2-4 bullet points per section maximum. Reference the actual data provided.`;

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'Analysis not configured — set the ANTHROPIC_API_KEY secret via: firebase functions:secrets:set ANTHROPIC_API_KEY' });

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-5',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(502).json({ error: `AI error ${response.status}: ${errText.slice(0, 120)}` });
            }

            const result = await response.json();
            const analysis = result.content?.[0]?.text || 'No analysis returned.';
            return res.json({ analysis });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
);
