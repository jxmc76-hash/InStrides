window.fetchStravaRSS = async () => {
    const rssUrl = "https://feedmyride.net/activities/5266316";
    const container = document.getElementById('strava-content');
    try {
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
        const data = await response.json();
        
        if (data.status === 'ok' && data.items?.length > 0) {
            const last = data.items[0];
            const date = new Date(last.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            
            // Extracting extra details from the description/content
            // FeedMyRide often puts stats in the description or title string
            const description = last.description || "";
            
            container.innerHTML = `
                <a href="${last.link}" target="_blank" class="activity-link">
                    <div class="activity-stats-row">
                        <div class="stat-item">
                            <span class="stat-label">ACTIVITY</span>
                            <div class="activity-title">${last.title}</div>
                        </div>
                    </div>
                    <div class="activity-footer">
                        <span class="activity-meta">Tracked on ${date}</span>
                        <span class="strava-badge">View on Strava →</span>
                    </div>
                </a>`;
        }
    } catch (e) { container.innerHTML = "Feed currently unavailable."; }
};

