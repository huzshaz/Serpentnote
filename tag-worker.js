// Web Worker for tag search
// This keeps the UI thread responsive during tag searches

let allTags = [];

// Listen for messages from main thread
self.addEventListener('message', (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            // Initialize worker with tag list
            allTags = data.tags;
            self.postMessage({ type: 'ready' });
            break;

        case 'search':
            // Perform tag search
            const { query, limit } = data;
            const results = searchTags(query, limit || 10);
            self.postMessage({ type: 'results', data: results });
            break;

        case 'update':
            // Update tag list
            allTags = data.tags;
            break;

        default:
            console.error('Unknown message type:', type);
    }
});

function searchTags(query, limit) {
    if (!query || query.length < 2) {
        return [];
    }

    const lowerQuery = query.toLowerCase();
    const startsWithMatches = [];
    const containsMatches = [];

    // Early exit optimization - stop after finding enough matches
    for (let i = 0; i < allTags.length && (startsWithMatches.length + containsMatches.length) < 50; i++) {
        const tag = allTags[i];
        const tagLower = tag.name.toLowerCase();

        if (tagLower.startsWith(lowerQuery)) {
            startsWithMatches.push(tag);
        } else if (tagLower.includes(lowerQuery)) {
            containsMatches.push(tag);
        }
    }

    // Combine and limit results - prioritize exact matches at the start
    return [...startsWithMatches, ...containsMatches].slice(0, limit);
}
