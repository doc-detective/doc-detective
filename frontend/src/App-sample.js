import React, { useState } from 'react';
import ConfigManager from './components/ConfigManager';
import TestManager from './components/TestManager';
import TestRunner from './components/TestRunner';
import ResultsDisplay from './components/ResultsDisplay';
import './App.css';

function App() {
    const [testResults, setTestResults] = useState([]);
    const [coverageResults, setCoverageResults] = useState([]);

    function handleRunTests() {
        // Call function to run tests and then update testResults
    }

    function handleCoverageAnalysis() {
        // Call function for coverage analysis and then update coverageResults
    }

    return (
        <div className="App">
            <ConfigManager />
            <TestManager />
            <TestRunner 
                onRunTests={handleRunTests} 
                onCoverageAnalysis={handleCoverageAnalysis} 
            />
            <ResultsDisplay 
                testResults={testResults} 
                coverageResults={coverageResults} 
            />
        </div>
    );
}

export default App;
