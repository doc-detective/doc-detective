const fs = require('fs');

reset();

function reset() {
    // Remove node_modules from root
    console.log("Removing node_modules from root")
    const rootPath = process.cwd();
    const rootModulesPath = `${rootPath}/node_modules`;
    if (fs.existsSync(rootModulesPath)) {
        fs.rmSync(rootModulesPath, { recursive: true });
    }
    // Remove node_modules from frontend
    console.log("Removing node_modules from frontend")
    const frontendPath = `${rootPath}/frontend`;
    const frontendModulesPath = `${frontendPath}/node_modules`;
    if (fs.existsSync(frontendModulesPath)) {
        fs.rmSync(frontendModulesPath, { recursive: true });
    }
    // Install dependencies
    // console.log("Installing dependencies (This may take a while)")
    // const exec = require('child_process').exec;
    // const child = exec('npm i', { cwd: rootPath });
    // child.stdout.on('data', (data) => {
    //     console.log(data);
    // });
    // child.stderr.on('data', (data) => {
    //     console.log(data);
    // });
    // child.on('close', (code) => {
    //     console.log(`child process exited with code ${code}`);
    // });
}