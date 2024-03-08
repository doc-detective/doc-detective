#!/usr/bin/env node

const { spawn } = require('child_process');

// Detect the arguments used to run the script, and run the appropriate command
const args = process.argv.slice(2);
const command = args[0];
const arguments = args.slice(1);
console.log(arguments)

// Run the appropriate command, including the arguments
switch (command) {
    case 'runTests':
        // Run the npm runTests command
        const runTests = spawn('npm', ['run', 'runTests', '--', ...arguments]);

        // Handle the output of the command
        runTests.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        runTests.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        runTests.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
        });
}