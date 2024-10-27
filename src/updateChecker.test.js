const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const inquirer = require('inquirer');
const { execSync, spawn } = require('child_process');
const semver = require('semver');
const path = require('path');

describe('updateChecker', () => {
    let checkForUpdates;
    let performUpdateStub;
    let promptForUpdateStub;
    let execSyncStub;
    let spawnStub;
    let packageJsonStub;

    beforeEach(() => {
        performUpdateStub = sinon.stub().resolves(true);
        promptForUpdateStub = sinon.stub().resolves('yes');
        execSyncStub = sinon.stub();
        spawnStub = sinon.stub();

        packageJsonStub = {
            version: '1.0.0'
        };

        checkForUpdates = proxyquire('./updateChecker', {
            'child_process': { execSync: execSyncStub, spawn: spawnStub },
            'semver': semver,
            'path': path,
            'inquirer': inquirer,
            '../package.json': packageJsonStub,
            './updateChecker': {
                performUpdate: performUpdateStub,
                promptForUpdate: promptForUpdateStub
            }
        }).checkForUpdates;
    });

    it('should return false if not running from global npm install path', async () => {
        execSyncStub.withArgs('npm root -g', { encoding: 'utf8' }).returns('/some/global/path');
        const result = await checkForUpdates();
        expect(result).to.be.false;
    });

    it('should return false if no new version is available', async () => {
        execSyncStub.withArgs('npm root -g', { encoding: 'utf8' }).returns(__dirname);
        execSyncStub.withArgs('npm show doc-detective@latest version', { encoding: 'utf8' }).returns('1.0.0');
        const result = await checkForUpdates();
        expect(result).to.be.false;
    });

    it('should prompt for update if new version is available and autoInstall is false', async () => {
        execSyncStub.withArgs('npm root -g', { encoding: 'utf8' }).returns(__dirname);
        execSyncStub.withArgs('npm show doc-detective@latest version', { encoding: 'utf8' }).returns('1.1.0');
        const result = await checkForUpdates();
        expect(promptForUpdateStub.calledOnce).to.be.true;
        expect(performUpdateStub.calledOnce).to.be.true;
        expect(result).to.be.true;
    });

    it('should auto install update if new version is available and autoInstall is true', async () => {
        execSyncStub.withArgs('npm root -g', { encoding: 'utf8' }).returns(__dirname);
        execSyncStub.withArgs('npm show doc-detective@latest version', { encoding: 'utf8' }).returns('1.1.0');
        const result = await checkForUpdates({ autoInstall: true });
        expect(promptForUpdateStub.called).to.be.false;
        expect(performUpdateStub.calledOnce).to.be.true;
        expect(result).to.be.true;
    });

    it('should return false if an error occurs', async () => {
        execSyncStub.throws(new Error('Some error'));
        const result = await checkForUpdates();
        expect(result).to.be.false;
    });
});