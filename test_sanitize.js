function sanitizeBranches(data) {
    const clean = {};
    Object.entries(data || {}).forEach(([key, value]) => {
        // Valid branches must be objects, not strings/metadata
        if (value && typeof value === 'object') {
            clean[key] = value;
        }
    });
    return clean;
}

const sampleData = {
    "CA-001": { branchName: "Test Branch" },
    "beverage": "http://example.com",
    "branchCode": "invalid",
    "CA-002": { branchName: "Another Branch" }
};

const cleaned = sanitizeBranches(sampleData);
console.log('Original keys:', Object.keys(sampleData));
console.log('Cleaned keys:', Object.keys(cleaned));
console.log('Cleaned data:', JSON.stringify(cleaned, null, 2));
