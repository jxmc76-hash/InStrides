async function fetchStravaRSS() {
    const feedId = "5266316";
    const rssUrl = `https://feedmyride.net/activities/${feedId}`; 
    const container = document.getElementById('strava-content');

    try {
        // We use rss2json to parse the XML into a clean JSON object
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
        const data = await response.json();

        if (data.status === 'ok' && data.items.length > 0) {
            const lastRun = data.items[0];
            
            // Format the date nicely
            const pubDate = new Date(lastRun.pubDate);
            const dateStr = pubDate.toLocaleDateString('en-GB', { 
                day: 'numeric', 
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            container.innerHTML = `
                <a href="${lastRun.link}" target="_blank" class="activity-link">
                    <div class="activity-title">${lastRun.title}</div>
                    <div class="activity-meta">Last tracked: ${dateStr}</div>
                </a>
            `;
        } else {
            container.innerHTML = "Waiting for your next move...";
        }
    } catch (error) {
        console.error("Strava Feed Error:", error);
        container.innerHTML = "Unable to reach Strava feed.";
    }
}

// Initialize the fetch
fetchStravaRSS();


