import React from 'react';

function ResultsDisplay({ testResults, coverageResults }) {
    return (
        <div>
            <div>
                <h2>Test Results</h2>
                {/* Display test results */}
            </div>
            <div>
                <h2>Coverage Results</h2>
                {/* Display coverage results */}
            </div>
        </div>
    );
}

export default ResultsDisplay;
