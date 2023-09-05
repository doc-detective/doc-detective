import React from 'react';

function TestRunner({ onRunTests, onCoverageAnalysis }) {
    return (
        <div>
            <button onClick={onRunTests}>Run Tests</button>
            <button onClick={onCoverageAnalysis}>Perform Coverage Analysis</button>
        </div>
    );
}

export default TestRunner;
